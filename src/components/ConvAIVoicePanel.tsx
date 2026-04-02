import { useState, useCallback, useEffect, useRef } from "react";
import {
  ConversationProvider,
  useConversation,
  useConversationClientTool,
} from "@elevenlabs/react";
import {
  AudioLines,
  Loader2,
  Undo2,
  FileText,
  CheckCircle2,
  Play,
  Pause,
} from "lucide-react";
import type { ToothState, VoiceLogEntry } from "../data/dental";
import { fetchSignedUrl } from "../hooks/useConversationalAI";

/* ------------------------------------------------------------------ */
/*  Waveform constants (same as manual mode)                           */
/* ------------------------------------------------------------------ */
const BARS = 20;
const barHeights = Array.from(
  { length: BARS },
  (_, i) => 8 + 16 * Math.sin((i / BARS) * Math.PI),
);
const barDurations = Array.from(
  { length: BARS },
  (_, i) => 0.6 + ((i * 7 + 5) % 9) * 0.05,
);

/* ------------------------------------------------------------------ */
/*  Log entry component (consistent with manual mode)                  */
/* ------------------------------------------------------------------ */
function LogEntry({ entry }: { entry: VoiceLogEntry }) {
  const isCorrection = entry.type === "correction";
  const isFailed = entry.parsed === "No changes parsed";
  return (
    <div className="flex gap-3 py-2.5">
      <span className="shrink-0 text-[11px] tabular-nums text-sand-400 pt-0.5 w-8">
        {entry.timestamp}
      </span>
      <p className={`flex-1 min-w-0 text-[13px] leading-relaxed ${
        isFailed ? "text-sand-400 italic" : isCorrection ? "text-clay-500" : "text-sand-700"
      }`}>
        {entry.parsed}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Audio recording player                                             */
/* ------------------------------------------------------------------ */
function AudioRecording({ url, label }: { url: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 rounded-xl border border-sand-200 bg-white/60 px-3 py-2 text-[12px] text-sand-600 hover:bg-sand-100 transition-colors w-full"
    >
      {playing ? (
        <Pause className="h-3.5 w-3.5 text-saffron-500 shrink-0" />
      ) : (
        <Play className="h-3.5 w-3.5 text-sand-500 shrink-0" />
      )}
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Inner component — must be inside ConversationProvider              */
/* ------------------------------------------------------------------ */
function ConvAIInner({
  updateTooth,
  updateSessionNotesOnDO,
  undoOnDO,
  appendVoiceLogOnDO,
  voiceLog,
  sessionId,
  patientId,
  currentTeeth,
  currentSessionNotes,
  onAgentActiveChange,
}: {
  updateTooth: (tooth: ToothState) => void;
  updateSessionNotesOnDO: (notes: string, mode?: "replace" | "append") => Promise<string>;
  undoOnDO: () => Promise<string>;
  appendVoiceLogOnDO: (entries: VoiceLogEntry[]) => void;
  voiceLog: VoiceLogEntry[];
  sessionId: string;
  patientId: string;
  currentTeeth: ToothState[];
  currentSessionNotes: string;
  onAgentActiveChange?: (active: boolean) => void;
}) {
  // Accumulated transcript messages (persists after disconnect)
  const [messages, setMessages] = useState<Array<{ id: string; role: "user" | "agent"; text: string }>>([]);

  // Audio capture: record full conversation via mic (with echo cancellation off to capture agent audio too)
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const micStreamRef = useRef<MediaStream | null>(null);
  const sessionCountRef = useRef(0);
  const [savedRecordings, setSavedRecordings] = useState<Array<{ key: string; url: string; label: string }>>([]);

  /** Start recording the user's microphone (echo cancellation OFF to capture agent playback) */
  const startMicRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true },
      });
      micStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      micChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) micChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      micRecorderRef.current = recorder;
    } catch (err) {
      console.warn("[ConvAI] Could not start mic recording:", err);
    }
  }, []);

  /** Stop mic recording and return the blob */
  const stopMicRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = micRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(micChunksRef.current, { type: "audio/webm" });
        micChunksRef.current = [];
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.stop();
      micRecorderRef.current = null;
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    });
  }, []);

  const conversation = useConversation({
    onMessage: (props) => {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: props.role as "user" | "agent", text: props.message },
      ]);
    },
    onConnect: () => {
      startMicRecording();
    },
    onDisconnect: () => {
      saveRecording();
    },
  });
  const [startTime] = useState(() => Date.now());
  const [starting, setStarting] = useState(false);
  const [lastAction, setLastAction] = useState("");

  // Load any previously saved recordings for this session
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/audio`)
      .then((r) => r.ok ? r.json() as Promise<{ recordings: Array<{ key: string; url: string }> }> : null)
      .then((data) => {
        if (data?.recordings?.length) {
          setSavedRecordings(
            data.recordings.map((r, i) => ({
              key: r.key,
              url: r.url,
              label: `Recording ${i + 1}`,
            })),
          );
          sessionCountRef.current = data.recordings.length;
        }
      })
      .catch(() => {});
  }, [sessionId]);

  /** Save the conversation recording to R2 */
  const saveRecording = useCallback(async () => {
    const blob = await stopMicRecording();
    if (!blob) return;

    sessionCountRef.current += 1;
    const idx = sessionCountRef.current;
    try {
      const resp = await fetch(`/api/sessions/${sessionId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "audio/webm" },
        body: blob,
      });
      if (resp.ok) {
        const data = (await resp.json()) as { key: string; url: string };
        setSavedRecordings((prev) => [
          ...prev,
          { key: data.key, url: data.url, label: `Recording #${idx}` },
        ]);
      }
    } catch (err) {
      console.error("Failed to save recording to R2:", err);
    }
  }, [stopMicRecording, sessionId]);

  const getElapsed = useCallback(() => {
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }, [startTime]);

  const addLogEntry = useCallback(
    (transcript: string, parsed: string, type: VoiceLogEntry["type"] = "command") => {
      const entry: VoiceLogEntry = {
        id: crypto.randomUUID(),
        timestamp: getElapsed(),
        transcript,
        parsed,
        type,
      };
      setLastAction(parsed);
      // Persist to DO — the voiceLog prop will update via state sync
      appendVoiceLogOnDO([entry]);
    },
    [getElapsed, appendVoiceLogOnDO],
  );

  // Register client tool: update_odontogram
  useConversationClientTool("update_odontogram", async (params: Record<string, unknown>) => {
    const toothStr = params.tooth as string | undefined;
    const toothNumber = toothStr ? parseInt(toothStr, 10) : undefined;
    if (!toothNumber || isNaN(toothNumber)) return "Missing tooth number";

    const changes: Partial<ToothState> = {};

    // Surfaces come as comma-separated string from the API (tool params are all strings)
    if (params.surfaces && params.surface_condition) {
      const rawSurfaces = String(params.surfaces);
      const surfaces = rawSurfaces.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
      const condition = String(params.surface_condition);
      const surfaceMap: Record<string, string> = {};
      for (const s of surfaces) {
        surfaceMap[s] = condition;
      }
      changes.surfaces = surfaceMap as ToothState["surfaces"];
    }

    // Labels also come as comma-separated string
    if (params.labels) {
      const rawLabels = String(params.labels);
      changes.labels = rawLabels.split(/[,\s]+/).map((l) => l.trim().toLowerCase()).filter(Boolean) as ToothState["labels"];
    }

    if (params.mobility) {
      changes.mobility = String(params.mobility) as ToothState["mobility"];
    }

    if (params.note) {
      changes.note = String(params.note).trim() || undefined;
    }

    updateTooth({ number: toothNumber, ...changes } as ToothState);

    const parts = [`Tooth ${toothNumber}`];
    if (changes.labels?.length) parts.push(changes.labels.join(", "));
    if (params.surfaces && params.surface_condition) {
      parts.push(`${params.surface_condition} on ${String(params.surfaces)}`);
    }
    if (params.mobility && params.mobility !== "none") parts.push(`mobility ${params.mobility}`);
    if (params.note) parts.push("note added");
    const confirmation = parts.join(", ") + " registered.";

    addLogEntry("Voice command", confirmation);
    return confirmation;
  });

  // Register client tool: update_session_notes
  useConversationClientTool("update_session_notes", async (params: Record<string, unknown>) => {
    const note = String(params.note ?? "").trim();
    const mode = String(params.mode ?? "append") === "replace" ? "replace" : "append";
    if (!note) return "No session note provided.";

    const msg = await updateSessionNotesOnDO(note, mode);
    addLogEntry("Voice command", mode === "append" ? `Session note added: ${note}` : msg);
    return msg;
  });

  // Register client tool: undo_last
  useConversationClientTool("undo_last", async () => {
    const msg = await undoOnDO();
    addLogEntry("Undo", msg, "correction");
    return msg;
  });

  // Register client tool: ask_about_patient (structured RAG over patient history)
  useConversationClientTool("ask_about_patient", async (params: Record<string, unknown>) => {
    const question = String(params.question ?? "");
    if (!question) return "No question provided.";

    addLogEntry(question, "Looking up patient history...");

    try {
      const resp = await fetch(`/api/patients/${patientId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, currentTeeth, currentSessionNotes }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { answer: string };
      addLogEntry(question, data.answer);
      return data.answer;
    } catch (err) {
      const msg = "Sorry, I couldn't look up the patient history right now.";
      addLogEntry(question, msg);
      return msg;
    }
  });

  const isConnected = conversation.status === "connected";
  const isActive = isConnected;

  // Notify parent of agent connection status changes
  useEffect(() => {
    onAgentActiveChange?.(isConnected);
  }, [isConnected, onAgentActiveChange]);

  const toggleSession = useCallback(async () => {
    if (isConnected) {
      conversation.endSession();
    } else {
      setStarting(true);
      try {
        // Try signed URL first (secure, requires ELEVENLABS_AGENT_ID on backend)
        // Falls back to public agent ID if signed URL fails
        try {
          const signedUrl = await fetchSignedUrl();
          conversation.startSession({ signedUrl });
        } catch {
          // Fallback: fetch agent ID from backend and use public mode
          const resp = await fetch("/api/convai/agent-id");
          if (resp.ok) {
            const { agent_id } = (await resp.json()) as { agent_id: string };
            conversation.startSession({ agentId: agent_id });
          } else {
            throw new Error("No signed URL or agent ID available");
          }
        }
      } catch (err) {
        console.error("Failed to start ConvAI session:", err);
      } finally {
        setStarting(false);
      }
    }
  }, [isConnected, conversation]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      {/* Voice status card — clickable to toggle session */}
      <button
        onClick={toggleSession}
        disabled={starting}
        className={`w-full rounded-2xl p-4 sm:p-5 transition-all duration-300 text-left ${
          isActive ? "bg-gradient-to-br from-sand-900 to-sand-950 glow-dark" : "glass-card-solid glow-card hover:shadow-[0_0_20px_-4px_rgba(228,149,69,0.1)]"
        } ${starting ? "opacity-70" : ""}`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-xl ${
              isActive ? "bg-saffron-400/20" : "bg-saffron-50"
            }`}
          >
            {starting ? (
              <Loader2 className="h-4 w-4 text-saffron-500 animate-spin" />
            ) : (
              <AudioLines
                className={`h-4 w-4 ${
                  isActive ? "text-saffron-300" : "text-saffron-500"
                }`}
              />
            )}
          </div>
          <div className="flex-1">
            <p
              className={`text-[13px] sm:text-[14px] font-semibold ${
                isActive ? "text-white" : "text-sand-700"
              }`}
            >
              {isActive
                ? conversation.isSpeaking
                  ? "Agent speaking"
                  : "Listening"
                : starting
                  ? "Connecting..."
                  : "Start conversation"}
            </p>
            <p
              className={`text-[11px] ${
                isActive ? "text-sand-400" : "text-sand-500"
              }`}
            >
              {isActive
                ? "ElevenLabs handles voice end-to-end"
                : "Tap to start the AI dental assistant"}
            </p>
          </div>
          {isActive && (
            <div className="flex h-7 items-center rounded-lg bg-white/10 px-2.5">
              <span className="text-[11px] font-medium text-sand-400">End</span>
            </div>
          )}
        </div>

        {/* Waveform (active + not speaking) */}
        {isActive && !conversation.isSpeaking && (
          <div className="flex items-end justify-center gap-[2.5px] h-8 mt-3">
            {barHeights.map((h, i) => (
              <div
                key={i}
                className="w-[2px] rounded-full bg-saffron-400/50"
                style={{
                  height: `${h}px`,
                  animation: `waveform ${barDurations[i]}s ease-in-out infinite`,
                  animationDelay: `${i * 0.06}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Speaking indicator */}
        {isActive && conversation.isSpeaking && (
          <div className="flex items-center gap-2 mt-3">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-saffron-400/70 animate-pulse"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <span className="text-[11px] text-saffron-300/70">Agent responding...</span>
          </div>
        )}
      </button>

      {/* Transcript history (persists after disconnect) */}
      <div className="rounded-2xl glass-card-solid glow-card p-4">
        <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2">
          Transcript
        </p>
        <div className="min-h-[40px] max-h-[200px] overflow-y-auto space-y-1.5">
          {messages.length === 0 && !lastAction ? (
            <p className="text-[12px] text-sand-400 italic">
              {isConnected ? "Listening..." : "Start a conversation to see transcript"}
            </p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className="flex gap-2">
                <span className={`text-[10px] font-semibold uppercase shrink-0 pt-0.5 w-8 ${
                  msg.role === "user" ? "text-sand-500" : "text-saffron-500"
                }`}>
                  {msg.role === "user" ? "You" : "AI"}
                </span>
                <p className={`text-[13px] leading-relaxed flex-1 ${
                  msg.role === "user" ? "text-sand-700" : "text-sand-500 italic"
                }`}>
                  {msg.text}
                </p>
              </div>
            ))
          )}
          {lastAction && (
            <div className="flex items-center gap-2 pt-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-voice-500 shrink-0" />
              <p className="text-[13px] text-voice-600 leading-relaxed">
                {lastAction}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Undo button */}
      <button
        onClick={async () => {
          const msg = await undoOnDO();
          addLogEntry("Undo (manual)", msg, "correction");
        }}
        disabled={!isConnected}
        className="flex items-center justify-center gap-2 rounded-xl border border-sand-200/80 bg-white shadow-sm px-4 py-2.5 text-[13px] font-medium text-sand-600 hover:bg-sand-50 hover:border-sand-300 active:bg-sand-100 transition-all disabled:opacity-40"
      >
        <Undo2 className="h-3.5 w-3.5" />
        Undo last
      </button>

      {/* Action log (matches manual mode layout) */}
      <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
          <FileText className="h-3.5 w-3.5 text-sand-400" />
          <h3 className="text-[13px] font-bold font-display text-sand-700">
            Actions
          </h3>
          <span className="ml-auto rounded-md bg-sand-50 border border-sand-100 px-2 py-0.5 text-[10px] font-semibold text-sand-500 tabular-nums">
            {voiceLog.length}
          </span>
        </div>
        <div className="divide-y divide-sand-100 px-4 sm:px-5 max-h-[320px] lg:max-h-[400px] overflow-y-auto">
          {voiceLog.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-sand-400">
              {isConnected
                ? "No actions yet. Speak to chart findings."
                : "Start a conversation to begin charting."}
            </p>
          ) : (
            voiceLog.map((entry) => (
              <LogEntry key={entry.id} entry={entry} />
            ))
          )}
        </div>
      </div>

      {/* Saved audio recordings */}
      {savedRecordings.length > 0 && (
        <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
            <AudioLines className="h-3.5 w-3.5 text-sand-400" />
            <h3 className="text-[13px] font-bold font-display text-sand-700">
              Recordings
            </h3>
            <span className="ml-auto rounded-md bg-sand-50 border border-sand-100 px-2 py-0.5 text-[10px] font-semibold text-sand-500 tabular-nums">
              {savedRecordings.length}
            </span>
          </div>
          <div className="p-3 space-y-2">
            {savedRecordings.map((rec) => (
              <AudioRecording key={rec.key} url={rec.url} label={rec.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exported wrapper — provides ConversationProvider context           */
/* ------------------------------------------------------------------ */
export default function ConvAIVoicePanel({
  updateTooth,
  updateSessionNotes,
  undo,
  appendVoiceLog,
  voiceLog,
  sessionId,
  patientId,
  currentTeeth,
  currentSessionNotes,
  onAgentActiveChange,
}: {
  updateTooth: (tooth: ToothState) => void;
  updateSessionNotes: (notes: string, mode?: "replace" | "append") => Promise<string>;
  undo: () => Promise<string>;
  appendVoiceLog: (entries: VoiceLogEntry[]) => void;
  voiceLog: VoiceLogEntry[];
  sessionId: string;
  patientId: string;
  currentTeeth: ToothState[];
  currentSessionNotes: string;
  onAgentActiveChange?: (active: boolean) => void;
}) {
  return (
    <ConversationProvider>
      <ConvAIInner updateTooth={updateTooth} updateSessionNotesOnDO={updateSessionNotes} undoOnDO={undo} appendVoiceLogOnDO={appendVoiceLog} voiceLog={voiceLog} sessionId={sessionId} patientId={patientId} currentTeeth={currentTeeth} currentSessionNotes={currentSessionNotes} onAgentActiveChange={onAgentActiveChange} />
    </ConversationProvider>
  );
}
