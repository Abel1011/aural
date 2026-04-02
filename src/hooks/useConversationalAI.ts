import { useState, useCallback, useRef, useEffect } from "react";
import type { ToothState, VoiceLogEntry } from "../data/dental";

/**
 * Hook for ElevenLabs Conversational AI mode.
 *
 * Uses `@elevenlabs/react`'s `useConversation` via the ConversationProvider
 * pattern. The ElevenLabs Agent handles STT + LLM + TTS end-to-end.
 * Client tools bridge back to our SessionAgent DO for state updates.
 */

export type ConvAIStatus = "disconnected" | "connecting" | "connected";

interface UseConversationalAIReturn {
  status: ConvAIStatus;
  isSpeaking: boolean;
  agentTranscript: string;
  userTranscript: string;
  voiceLog: VoiceLogEntry[];
  startSession: () => Promise<void>;
  endSession: () => void;
  /** Called by the ConversationProvider's client tool to update a tooth */
  onToolUpdateTooth: (params: Record<string, unknown>) => void;
  /** Called by the ConversationProvider's client tool to undo */
  onToolUndo: () => void;
}

/**
 * Fetches a signed URL from our Worker (keeps API key server-side).
 */
export async function fetchSignedUrl(): Promise<string> {
  const resp = await fetch("/api/convai/signed-url");
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Unknown error" }));
    throw new Error((err as { error: string }).error || "Failed to get signed URL");
  }
  const data = (await resp.json()) as { signed_url: string };
  return data.signed_url;
}

/**
 * Lightweight hook to track Conversational AI state that the VoiceSession
 * page needs (voice log, transcripts, tool callbacks). The actual
 * ElevenLabs connection is managed by ConversationProvider in the component tree.
 */
export function useConversationalAI(
  updateToothOnDO: (toothNumber: number, changes: Partial<ToothState>) => void,
  undoOnDO: () => Promise<string>,
): UseConversationalAIReturn {
  const [status, setStatus] = useState<ConvAIStatus>("disconnected");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [agentTranscript, setAgentTranscript] = useState("");
  const [userTranscript, setUserTranscript] = useState("");
  const [voiceLog, setVoiceLog] = useState<VoiceLogEntry[]>([]);
  const startTimeRef = useRef(Date.now());

  const getElapsed = useCallback(() => {
    const seconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }, []);

  const addLogEntry = useCallback(
    (transcript: string, parsed: string, type: VoiceLogEntry["type"] = "command") => {
      setVoiceLog((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          timestamp: getElapsed(),
          transcript,
          parsed,
          type,
        },
      ]);
    },
    [getElapsed],
  );

  // Client tool: update_odontogram
  const onToolUpdateTooth = useCallback(
    (params: Record<string, unknown>) => {
      const tooth = params.tooth as number | undefined;
      if (!tooth) return;

      const changes: Partial<ToothState> = {};

      // Surface conditions
      if (params.surfaces && params.surface_condition) {
        const surfaces = params.surfaces as string[];
        const condition = params.surface_condition as string;
        const surfaceMap: Record<string, string> = {};
        for (const s of surfaces) {
          surfaceMap[s] = condition;
        }
        changes.surfaces = surfaceMap as ToothState["surfaces"];
      }

      // Labels
      if (params.labels) {
        changes.labels = params.labels as ToothState["labels"];
      }

      // Mobility
      if (params.mobility) {
        changes.mobility = params.mobility as ToothState["mobility"];
      }

      updateToothOnDO(tooth, changes);

      // Build description for the log
      const parts = [`Tooth ${tooth}`];
      if (params.labels) parts.push((params.labels as string[]).join(", "));
      if (params.surfaces && params.surface_condition) {
        parts.push(`${params.surface_condition} on ${(params.surfaces as string[]).join("")}`);
      }
      if (params.mobility && params.mobility !== "none") parts.push(`mobility ${params.mobility}`);

      addLogEntry(
        userTranscript || "Voice command",
        parts.join(", ") + " registered.",
      );
    },
    [updateToothOnDO, addLogEntry, userTranscript],
  );

  // Client tool: undo_last
  const onToolUndo = useCallback(() => {
    undoOnDO().then((msg) => {
      addLogEntry("Undo", msg, "correction");
    }).catch(() => {});
  }, [undoOnDO, addLogEntry]);

  const startSession = useCallback(async () => {
    startTimeRef.current = Date.now();
    setStatus("connecting");
    setVoiceLog([]);
  }, []);

  const endSession = useCallback(() => {
    setStatus("disconnected");
  }, []);

  // Callbacks for the ConversationProvider
  const onConnect = useCallback(() => setStatus("connected"), []);
  const onDisconnect = useCallback(() => setStatus("disconnected"), []);
  const onModeChange = useCallback(
    (mode: { mode: string }) => setIsSpeaking(mode.mode === "speaking"),
    [],
  );
  const onUserTranscript = useCallback(
    (transcript: string) => setUserTranscript(transcript),
    [],
  );
  const onAgentResponse = useCallback(
    (response: string) => setAgentTranscript(response),
    [],
  );

  // Store callbacks on ref so ConversationProvider can access them
  const callbacksRef = useRef({
    onConnect,
    onDisconnect,
    onModeChange,
    onUserTranscript,
    onAgentResponse,
  });
  useEffect(() => {
    callbacksRef.current = {
      onConnect,
      onDisconnect,
      onModeChange,
      onUserTranscript,
      onAgentResponse,
    };
  });

  return {
    status,
    isSpeaking,
    agentTranscript,
    userTranscript,
    voiceLog,
    startSession,
    endSession,
    onToolUpdateTooth,
    onToolUndo,
  };
}
