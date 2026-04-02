import { Agent, callable, type Connection } from "agents";
import { parseDentalCommand, type DentalCommand } from "../lib/dental-ai";
import { createClient, streamToDataUri } from "../lib/elevenlabs";
import type {
  Surface,
  SurfaceCondition,
  ToothLabel,
  Mobility,
  ToothState,
  VoiceLogEntry,
} from "../data/dental";

export interface SessionState {
  sessionId: string;
  patientId: string;
  patientName: string;
  teeth: ToothState[];
  voiceLog: VoiceLogEntry[];
  status: "active" | "completed";
  startedAt: string;
}

const VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // ElevenLabs default voice

// ElevenLabs Realtime STT endpoint
const STT_URL =
  "https://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&audio_format=pcm_16000";

function createInitialTeeth(): ToothState[] {
  const upperRight = [18, 17, 16, 15, 14, 13, 12, 11];
  const upperLeft = [21, 22, 23, 24, 25, 26, 27, 28];
  const lowerLeft = [31, 32, 33, 34, 35, 36, 37, 38];
  const lowerRight = [48, 47, 46, 45, 44, 43, 42, 41];
  const all = [...upperRight, ...upperLeft, ...lowerLeft, ...lowerRight];
  return all.map((n) => ({
    number: n,
    labels: [] as ToothLabel[],
    surfaces: {} as Partial<Record<Surface, SurfaceCondition>>,
    mobility: "none" as Mobility,
  }));
}

/**
 * SessionAgent — Durable Object managing a single dental consultation.
 *
 * Responsibilities:
 * - Maintains the full odontogram state (32 teeth)
 * - Processes voice commands via Workers AI NLU
 * - Broadcasts state changes to all connected screens via WebSocket
 * - Handles ElevenLabs STT streaming (outbound WebSocket)
 * - Provides TTS confirmations via ElevenLabs
 */
export class SessionAgent extends Agent<Env, SessionState> {
  // Undo stack for last commands
  #undoStack: Array<{ toothIndex: number; previous: ToothState }> = [];

  // Outbound WebSocket to ElevenLabs STT
  #sttSocket: WebSocket | null = null;

  // Debounce timer for D1 persistence
  #persistTimer: ReturnType<typeof setTimeout> | null = null;

  /** Debounced save of current teeth + voiceLog to D1 (5s after last mutation). */
  #schedulePersist() {
    if (this.#persistTimer) clearTimeout(this.#persistTimer);
    this.#persistTimer = setTimeout(() => {
      this.#persistTimer = null;
      this.#persistToD1().catch(() => {});
    }, 5_000);
  }

  async #persistToD1() {
    const { sessionId, teeth, voiceLog, status } = this.state;
    if (!sessionId || status === "completed") return;
    try {
      const teethJson = JSON.stringify(teeth);
      const voiceLogJson = JSON.stringify(voiceLog);
      await this.env.DB.prepare(
        "UPDATE sessions SET teeth_data = ?, voice_log = ? WHERE id = ? AND status = 'active'",
      )
        .bind(teethJson, voiceLogJson, sessionId)
        .run();
    } catch {
      // D1 may not be available in local dev
    }
  }

  initialState: SessionState = {
    sessionId: "",
    patientId: "",
    patientName: "",
    teeth: createInitialTeeth(),
    voiceLog: [],
    status: "active",
    startedAt: new Date().toISOString(),
  };

  /** Initialize the session with patient data. */
  @callable()
  async initSession(sessionId: string, patientId: string, patientName: string) {
    this.setState({
      ...this.state,
      sessionId,
      patientId,
      patientName,
      teeth: createInitialTeeth(),
      voiceLog: [],
      status: "active",
      startedAt: new Date().toISOString(),
    });
  }

  /** Append voice log entries (used by Agent mode which tracks log client-side). */
  @callable()
  async appendVoiceLog(entries: VoiceLogEntry[]) {
    this.setState({
      ...this.state,
      voiceLog: [...this.state.voiceLog, ...entries],
    });
    this.#schedulePersist();
  }

  /** Update a single tooth from the UI (click-based editing). */
  @callable()
  async updateTooth(toothNumber: number, changes: Partial<ToothState>) {
    const teeth = [...this.state.teeth];
    const idx = teeth.findIndex((t) => t.number === toothNumber);
    if (idx === -1) return;

    // Save for undo
    this.#undoStack.push({ toothIndex: idx, previous: { ...teeth[idx] } });

    teeth[idx] = { ...teeth[idx], ...changes, number: toothNumber };
    this.setState({ ...this.state, teeth });
    this.#schedulePersist();
  }

  /** Process a voice transcript — parse with AI, apply commands, return confirmation text. */
  @callable()
  async processVoiceCommand(transcript: string): Promise<{ text: string; speak: boolean }> {
    console.log("[session] processVoiceCommand called with:", transcript);
    const commands = await parseDentalCommand(this.env.AI, transcript, this.env.GOOGLE_AI_API_KEY);
    console.log("[session] parsed commands:", JSON.stringify(commands));
    const confirmations: string[] = [];
    let shouldSpeak = false;

    // Handle query commands — dentist asked for info
    if (commands.some((c) => c.action === "query")) {
      const summary = await this.generateSummary();
      const logEntry: VoiceLogEntry = {
        id: crypto.randomUUID(),
        timestamp: this.#sessionElapsed(),
        transcript,
        parsed: "Summary requested",
        type: "command",
      };
      this.setState({
        ...this.state,
        voiceLog: [...this.state.voiceLog, logEntry],
      });
      this.#schedulePersist();
      return { text: summary, speak: true };
    }

    for (const cmd of commands) {
      const result = this.#applyCommand(cmd);
      if (result) confirmations.push(result);
    }

    // Add one log entry per action (not one giant entry for the whole transcript)
    const timestamp = this.#sessionElapsed();
    const newEntries: VoiceLogEntry[] = [];

    if (confirmations.length > 0) {
      for (const conf of confirmations) {
        const isCorrection = conf.startsWith("Undid");
        newEntries.push({
          id: crypto.randomUUID(),
          timestamp,
          transcript,
          parsed: conf,
          type: isCorrection ? "correction" : "command",
        });
      }
    } else {
      newEntries.push({
        id: crypto.randomUUID(),
        timestamp,
        transcript,
        parsed: "No changes parsed",
        type: "command",
      });
    }

    this.setState({
      ...this.state,
      voiceLog: [...this.state.voiceLog, ...newEntries],
    });
    this.#schedulePersist();

    const text = confirmations.join(". ") || "I didn't catch any dental findings. Please try again.";
    return { text, speak: shouldSpeak };
  }

  /** Undo the last command. */
  @callable()
  async undo(): Promise<string> {
    const last = this.#undoStack.pop();
    if (!last) return "Nothing to undo.";

    const teeth = [...this.state.teeth];
    const toothNumber = teeth[last.toothIndex].number;
    teeth[last.toothIndex] = last.previous;
    this.setState({ ...this.state, teeth });
    this.#schedulePersist();

    return `Undid last change on tooth ${toothNumber}.`;
  }

  /** Generate a voice summary of all findings in the session. */
  @callable()
  async generateSummary(): Promise<string> {
    const findings = this.state.teeth.filter(
      (t) =>
        t.labels.length > 0 ||
        Object.keys(t.surfaces).length > 0 ||
        t.mobility !== "none",
    );

    if (findings.length === 0) return "No findings recorded in this session.";

    const lines = findings.map((t) => {
      const parts: string[] = [`Tooth ${t.number}`];
      if (t.labels.length > 0) parts.push(t.labels.join(", "));
      const surfaces = Object.entries(t.surfaces);
      if (surfaces.length > 0) {
        const grouped = new Map<string, string[]>();
        for (const [surface, condition] of surfaces) {
          const list = grouped.get(condition) ?? [];
          list.push(surface);
          grouped.set(condition, list);
        }
        for (const [condition, surfs] of grouped) {
          parts.push(`${condition} on ${surfs.join("")}`);
        }
      }
      if (t.mobility !== "none") parts.push(`mobility ${t.mobility}`);
      return parts.join(": ");
    });

    return `Session summary. ${findings.length} teeth with findings. ${lines.join(". ")}.`;
  }

  /** Convert text to speech using ElevenLabs TTS. Returns a data URI. */
  @callable()
  async speak(text: string): Promise<string> {
    const client = createClient(this.env.ELEVENLABS_API_KEY);
    const audio = await client.textToSpeech.convert(VOICE_ID, {
      text,
      modelId: "eleven_flash_v2_5",
      outputFormat: "mp3_44100_128",
    });
    return streamToDataUri(audio);
  }

  /** Open outbound WebSocket to ElevenLabs Realtime STT. */
  @callable()
  async startTranscription() {
    if (this.#sttSocket) {
      this.#sttSocket.close();
      this.#sttSocket = null;
    }

    const resp = await fetch(STT_URL, {
      headers: {
        Upgrade: "websocket",
        "xi-api-key": this.env.ELEVENLABS_API_KEY,
      },
    });

    const ws = resp.webSocket;
    if (!ws) throw new Error("STT WebSocket upgrade failed");
    ws.accept();
    this.#sttSocket = ws;

    ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data as string);
        const msgType: string = data.message_type;

        if (
          msgType === "partial_transcript" ||
          msgType === "committed_transcript"
        ) {
          this.broadcast(
            JSON.stringify({
              type: "stt-transcript",
              partial: msgType === "partial_transcript",
              text: data.text ?? "",
            }),
          );
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.addEventListener("close", () => {
      this.#sttSocket = null;
    });

    ws.addEventListener("error", () => {
      this.#sttSocket = null;
    });
  }

  /** Commit final transcript and close ElevenLabs STT WebSocket. */
  @callable()
  async stopTranscription() {
    if (!this.#sttSocket) return;
    try {
      this.#sttSocket.send(
        JSON.stringify({
          message_type: "input_audio_chunk",
          audio_base_64: "",
          commit: true,
          sample_rate: 16000,
        }),
      );
      // Give ElevenLabs a moment to send the final transcript
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      this.#sttSocket.close();
      this.#sttSocket = null;
    }
  }

  /** Complete the session and optionally persist summary to D1. */
  @callable()
  async completeSession(): Promise<string> {
    // Cancel any pending incremental save — we'll do the final write now
    if (this.#persistTimer) {
      clearTimeout(this.#persistTimer);
      this.#persistTimer = null;
    }

    const summary = await this.generateSummary();

    this.setState({
      ...this.state,
      status: "completed",
    });

    // Persist session results to D1 (including teeth state for later viewing)
    try {
      const teethJson = JSON.stringify(this.state.teeth);
      const voiceLogJson = JSON.stringify(this.state.voiceLog);
      await this.env.DB.prepare(
        "UPDATE sessions SET status = 'completed', completed_at = datetime('now'), summary = ?, teeth_data = ?, voice_log = ? WHERE id = ?",
      )
        .bind(summary, teethJson, voiceLogJson, this.state.sessionId)
        .run();
    } catch {
      // D1 may not be available in local dev
    }

    return summary;
  }

  /**
   * Intercept raw WebSocket messages from the browser.
   * Audio chunks are forwarded to ElevenLabs STT.
   */
  onMessage(_connection: Connection, message: string | ArrayBuffer) {
    if (typeof message === "string") {
      try {
        const data = JSON.parse(message);
        if (data.type === "audio-chunk" && this.#sttSocket) {
          // Force-commit signal from the browser
          if (data.data === "__force_commit__") {
            this.#sttSocket.send(
              JSON.stringify({
                message_type: "input_audio_chunk",
                audio_base_64: "",
                commit: true,
                sample_rate: 16000,
              }),
            );
            return;
          }
          this.#sttSocket.send(
            JSON.stringify({
              message_type: "input_audio_chunk",
              audio_base_64: data.data,
              commit: false,
              sample_rate: 16000,
            }),
          );
          return;
        }
      } catch {
        // not our message, fall through
      }
    }
  }

  // --- Private helpers ---

  #applyCommand(cmd: DentalCommand): string | null {
    if (cmd.action === "undo") {
      // Handled separately via undo()
      const last = this.#undoStack.pop();
      if (!last) return "Nothing to undo.";
      const teeth = [...this.state.teeth];
      const toothNumber = teeth[last.toothIndex].number;
      teeth[last.toothIndex] = last.previous;
      this.setState({ ...this.state, teeth });
      return `Undid last change on tooth ${toothNumber}.`;
    }

    if (!cmd.tooth) return null;

    const teeth = [...this.state.teeth];
    const idx = teeth.findIndex((t) => t.number === cmd.tooth);
    if (idx === -1) return null;

    // Save for undo
    this.#undoStack.push({ toothIndex: idx, previous: { ...teeth[idx] } });

    const tooth = { ...teeth[idx] };
    const parts: string[] = [`Tooth ${cmd.tooth}`];

    // Apply labels
    if (cmd.labels && cmd.labels.length > 0) {
      const newLabels = new Set([...tooth.labels, ...cmd.labels]);
      // Missing is exclusive
      if (cmd.labels.includes("missing")) {
        tooth.labels = ["missing"];
        tooth.surfaces = {};
        tooth.mobility = "none";
      } else {
        // Remove missing if adding other labels
        newLabels.delete("missing");
        // Implant and RCT can't coexist
        if (cmd.labels.includes("implant")) newLabels.delete("rct");
        if (cmd.labels.includes("rct")) newLabels.delete("implant");
        tooth.labels = [...newLabels];
      }
      parts.push(cmd.labels.join(" and "));
    }

    // Apply surface conditions
    if (cmd.surfaces && cmd.surfaceCondition && !tooth.labels.includes("missing")) {
      const newSurfaces = { ...tooth.surfaces };
      for (const s of cmd.surfaces) {
        newSurfaces[s] = cmd.surfaceCondition;
      }
      tooth.surfaces = newSurfaces;
      parts.push(`${cmd.surfaceCondition} on ${cmd.surfaces.join("")}`);
    }

    // Apply mobility
    if (cmd.mobility && !tooth.labels.includes("missing")) {
      tooth.mobility = cmd.mobility;
      parts.push(`mobility ${cmd.mobility}`);
    }

    // Apply note
    if (cmd.note) {
      tooth.note = cmd.note;
    }

    teeth[idx] = tooth;
    this.setState({ ...this.state, teeth });

    return parts.length > 1 ? parts.join(", ") + " registered." : null;
  }

  #sessionElapsed(): string {
    const start = new Date(this.state.startedAt).getTime();
    const now = Date.now();
    const seconds = Math.floor((now - start) / 1000);
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }
}
