import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  Send,
  Volume2,
  Loader2,
  Sparkles,
  Square,
  MessageSquare,
  StopCircle,
} from "lucide-react";
import type { ToothState } from "../data/dental";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  audioUri?: string;
  timestamp: Date;
}

interface PatientChatProps {
  patientId: string;
  patientName: string;
  currentTeeth?: ToothState[];
  currentSessionNotes?: string;
}

/* ------------------------------------------------------------------ */
/*  Mic recording helpers                                              */
/* ------------------------------------------------------------------ */
function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch (err) {
      console.error("[recorder] Failed to start:", err);
    }
  }, []);

  const stop = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        setRecording(false);
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        // Stop all tracks to release the mic
        recorder.stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        resolve(blob);
      };
      recorder.stop();
    });
  }, []);

  return { recording, start, stop };
}

/* ------------------------------------------------------------------ */
/*  Audio playback                                                     */
/* ------------------------------------------------------------------ */
function useAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const play = useCallback((dataUri: string, messageId: string) => {
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(dataUri);
    audioRef.current = audio;
    setPlayingId(messageId);
    audio.onended = () => {
      setPlayingId(null);
      audioRef.current = null;
    };
    audio.onerror = () => {
      setPlayingId(null);
      audioRef.current = null;
    };
    audio.play().catch(() => setPlayingId(null));
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlayingId(null);
  }, []);

  return { playingId, play, stop };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function PatientChat({ patientId, patientName, currentTeeth, currentSessionNotes }: PatientChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [ttsLoadingId, setTtsLoadingId] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { recording, start: startRec, stop: stopRec } = useAudioRecorder();
  const { playingId, play: playAudio, stop: stopAudio } = useAudioPlayer();

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  /* ---- Send question to RAG ---- */
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const resp = await fetch(`/api/patients/${patientId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, currentTeeth, currentSessionNotes }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { answer: string };

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: data.answer,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Auto TTS for assistant response
      if (autoSpeak) {
        fetchAndPlayTTS(assistantMsg.id, data.answer);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Failed to get a response. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  }, [patientId, currentTeeth, currentSessionNotes, sending, autoSpeak]);

  /* ---- TTS ---- */
  const fetchAndPlayTTS = useCallback(async (messageId: string, text: string) => {
    setTtsLoadingId(messageId);
    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!resp.ok) throw new Error("TTS failed");
      const data = (await resp.json()) as { audio: string };

      // Store audio URI on the message
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, audioUri: data.audio } : m),
      );
      playAudio(data.audio, messageId);
    } catch (err) {
      console.error("[chat] TTS error:", err);
    } finally {
      setTtsLoadingId(null);
    }
  }, [playAudio]);

  /* ---- Voice input (record → transcribe → send) ---- */
  const handleVoiceInput = useCallback(async () => {
    if (recording) {
      const blob = await stopRec();
      if (!blob || blob.size === 0) return;

      setTranscribing(true);
      try {
        const resp = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
        });
        if (!resp.ok) throw new Error("Transcription failed");
        const data = (await resp.json()) as { text: string };
        if (data.text) {
          sendMessage(data.text);
        }
      } catch (err) {
        console.error("[chat] Transcription error:", err);
      } finally {
        setTranscribing(false);
      }
    } else {
      startRec();
    }
  }, [recording, startRec, stopRec, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
        <MessageSquare className="h-3.5 w-3.5 text-sand-400" />
        <h3 className="text-[13px] font-bold font-display text-sand-700">
          Ask about {patientName}
        </h3>
        <button
          onClick={() => setAutoSpeak((v) => !v)}
          title={autoSpeak ? "Auto-speak enabled" : "Auto-speak disabled"}
          className={`ml-auto flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors ${
            autoSpeak
              ? "bg-voice-50 border border-voice-200 text-voice-600"
              : "bg-sand-50 border border-sand-100 text-sand-400"
          }`}
        >
          <Volume2 className="h-3 w-3" />
          TTS
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-5 py-3 space-y-3 scrollbar-none"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron-50 border border-saffron-100 mb-3">
              <Sparkles className="h-5 w-5 text-saffron-400" />
            </div>
            <p className="text-[12px] text-sand-500 max-w-[200px]">
              Ask anything about {patientName}&apos;s dental history using text or voice.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                msg.role === "user"
                  ? "bg-sand-900 text-white rounded-br-md"
                  : "bg-sand-50 border border-sand-100 text-sand-700 rounded-bl-md"
              }`}
            >
              <p className="text-[12px] leading-relaxed whitespace-pre-wrap">
                {msg.text}
              </p>
              {msg.role === "assistant" && (
                <div className="mt-1.5 flex items-center gap-1.5 border-t border-sand-100/60 pt-1.5">
                  {/* Play / stop audio */}
                  {playingId === msg.id ? (
                    <button
                      onClick={stopAudio}
                      className="flex items-center gap-1 text-[10px] font-medium text-voice-600 hover:text-voice-700 transition-colors"
                    >
                      <StopCircle className="h-3 w-3" />
                      Stop
                    </button>
                  ) : ttsLoadingId === msg.id ? (
                    <span className="flex items-center gap-1 text-[10px] text-sand-400">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading audio...
                    </span>
                  ) : msg.audioUri ? (
                    <button
                      onClick={() => playAudio(msg.audioUri!, msg.id)}
                      className="flex items-center gap-1 text-[10px] font-medium text-sand-400 hover:text-sand-600 transition-colors"
                    >
                      <Volume2 className="h-3 w-3" />
                      Play
                    </button>
                  ) : (
                    <button
                      onClick={() => fetchAndPlayTTS(msg.id, msg.text)}
                      className="flex items-center gap-1 text-[10px] font-medium text-sand-400 hover:text-sand-600 transition-colors"
                    >
                      <Volume2 className="h-3 w-3" />
                      Listen
                    </button>
                  )}
                  <span className="text-[9px] text-sand-300 ml-auto">
                    {msg.timestamp.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              )}
              {msg.role === "user" && (
                <p className="text-[9px] text-sand-400 mt-1 text-right">
                  {msg.timestamp.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md bg-sand-50 border border-sand-100 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <div className="h-1.5 w-1.5 rounded-full bg-sand-400 animate-pulse" style={{ animationDelay: "0s" }} />
                <div className="h-1.5 w-1.5 rounded-full bg-sand-400 animate-pulse" style={{ animationDelay: "0.15s" }} />
                <div className="h-1.5 w-1.5 rounded-full bg-sand-400 animate-pulse" style={{ animationDelay: "0.3s" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-sand-100/50 px-3 sm:px-4 py-2.5">
        {/* Transcribing indicator */}
        {transcribing && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <Loader2 className="h-3 w-3 animate-spin text-saffron-500" />
            <span className="text-[11px] text-saffron-600 font-medium">Transcribing audio...</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Voice input button */}
          <button
            onClick={handleVoiceInput}
            disabled={transcribing || sending}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
              recording
                ? "bg-clay-500 text-white shadow-[0_0_12px_-2px_rgba(179,120,134,0.4)] animate-pulse"
                : "bg-sand-100 text-sand-500 hover:bg-sand-200 hover:text-sand-700"
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {recording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={recording ? "Recording..." : "Ask about the patient..."}
            disabled={recording || transcribing}
            className="flex-1 rounded-xl border border-sand-200 bg-white/80 px-3 py-2 text-[12px] text-sand-700 placeholder:text-sand-300 outline-none focus:border-saffron-300 focus:ring-1 focus:ring-saffron-300/30 disabled:opacity-50"
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || sending || recording}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sand-900 text-white transition-all hover:bg-sand-800 disabled:bg-sand-200 disabled:text-sand-400 disabled:cursor-not-allowed"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
