import { AgentClient } from "agents/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createInitialTeeth, type ToothState, type VoiceLogEntry } from "../data/dental";
import type { SessionState } from "../agents/session";

const FALLBACK_TEETH = createInitialTeeth();

interface UseSessionReturn {
  teeth: ToothState[];
  sessionNotes: string;
  voiceLog: VoiceLogEntry[];
  connected: boolean;
  updateTooth: (tooth: ToothState) => void;
  updateSessionNotes: (notes: string, mode?: "replace" | "append", trackUndo?: boolean) => Promise<string>;
  processVoice: (transcript: string) => Promise<{ text: string; speak: boolean }>;
  appendVoiceLog: (entries: VoiceLogEntry[]) => void;
  undo: () => Promise<string>;
  speak: (text: string) => Promise<string>;
  generateSummary: () => Promise<string>;
  completeSession: () => Promise<string>;
}

export function useSession(
  sessionId: string,
  patientId: string,
  patientName: string,
): UseSessionReturn {
  const [state, setState] = useState<SessionState | undefined>(undefined);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<AgentClient<unknown, SessionState> | null>(null);
  const initialized = useRef(false);

  // Create and manage the AgentClient WebSocket connection
  useEffect(() => {
    const client = new AgentClient<unknown, SessionState>({
      agent: "session-agent",
      name: sessionId,
      host: window.location.host,
      onStateUpdate: (newState: SessionState) => {
        setState(newState);
      },
    });

    client.addEventListener("open", () => setConnected(true));
    client.addEventListener("close", () => setConnected(false));

    clientRef.current = client;

    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [sessionId]);

  // Initialize session once connected
  useEffect(() => {
    const client = clientRef.current;
    if (!client || !connected || initialized.current) return;
    if (state?.sessionId) return;
    initialized.current = true;
    client.call("initSession", [sessionId, patientId, patientName]);
  }, [connected, state?.sessionId, sessionId, patientId, patientName]);

  const teeth = state?.teeth?.length ? state.teeth : FALLBACK_TEETH;
  const sessionNotes = state?.sessionNotes ?? "";
  const voiceLog = state?.voiceLog ?? [];

  const call = useCallback(
    <T = unknown>(method: string, args: unknown[] = []): Promise<T> => {
      const client = clientRef.current;
      if (!client) return Promise.reject(new Error("Not connected"));
      return client.call(method, args) as Promise<T>;
    },
    [],
  );

  const updateTooth = useCallback(
    (tooth: ToothState) => { call("updateTooth", [tooth.number, tooth]); },
    [call],
  );

  const updateSessionNotes = useCallback(
    (notes: string, mode: "replace" | "append" = "replace", trackUndo = true) =>
      call<string>("updateSessionNotes", [notes, mode, trackUndo]),
    [call],
  );

  const processVoice = useCallback(
    (transcript: string) => call<{ text: string; speak: boolean }>("processVoiceCommand", [transcript]),
    [call],
  );

  const appendVoiceLog = useCallback(
    (entries: VoiceLogEntry[]) => { call("appendVoiceLog", [entries]); },
    [call],
  );

  const undo = useCallback(() => call<string>("undo"), [call]);

  const speak = useCallback(
    (text: string) => call<string>("speak", [text]),
    [call],
  );

  const generateSummary = useCallback(() => call<string>("generateSummary"), [call]);

  const completeSession = useCallback(
    () => call<string>("completeSession"),
    [call],
  );

  return {
    teeth,
    sessionNotes,
    voiceLog,
    connected,
    updateTooth,
    updateSessionNotes,
    processVoice,
    appendVoiceLog,
    undo,
    speak,
    generateSummary,
    completeSession,
  };
}
