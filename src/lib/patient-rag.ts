import type { ToothState, VoiceLogEntry } from "../data/dental";
import { conditionLabels, hasToothFinding } from "../data/dental";

// Workers AI models in order of preference
const MODELS = [
  "@cf/moonshotai/kimi-k2.5",
  "@cf/nvidia/nemotron-3-120b-a12b",
] as const;

const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_ENDPOINT = `https://aiplatform.googleapis.com/v1/publishers/google/models/${GEMINI_MODEL}:generateContent`;
const HISTORY_QUESTION_RE = /\b(history|previous|prior|last|before|compare|change|changed|trend|since|over time|improv\w*|better|worse|follow-?up|earlier)\b/i;
const TRANSCRIPT_QUESTION_RE = /\b(transcript|voice|said|dictat\w*|command)\b/i;
const MAX_RECENT_SESSIONS = 4;
const MAX_HISTORY_SESSIONS = 8;
const MAX_CONTEXT_CHARS = 12000;
const MAX_SUMMARY_CHARS = 280;
const MAX_NOTES_CHARS = 650;
const MAX_FINDINGS_PER_SESSION = 8;
const MAX_LOG_ENTRIES_PER_SESSION = 4;
const WORKERS_AI_TIMEOUT_MS = 6500;
const GEMINI_TIMEOUT_MS = 8000;

const RAG_SYSTEM_PROMPT = `You are a dental assistant AI with access to a patient's full clinical history. The dentist will ask you questions about the patient. Answer based ONLY on the provided data — do NOT invent information.

Guidelines:
- Be concise and clinically precise. This is spoken aloud, so keep answers brief (2-4 sentences typically).
- Use ISO 3950 (FDI) tooth numbering.
- Reference specific dates, sessions, and tooth numbers when relevant.
- If the data doesn't contain enough information to answer, say so clearly.
- Speak in English, using standard dental terminology.
- Do NOT use markdown formatting — your answer will be spoken aloud via text-to-speech.
- Conditions include: caries, composite, amalgam, inlay, onlay (surface-level), and crown, bridge, prosthesis, implant, rct, missing (tooth-level labels).
- Surfaces: O (occlusal), M (mesial), D (distal), V (vestibular/buccal), L (lingual/palatal).
- Mobility grades: none, M1, M2, M3.

If asked about the current session, focus on findings from the most recent data. If asked about history or changes, compare across sessions chronologically.`;

/** Session data as retrieved from D1 */
export interface SessionRecord {
  id: string;
  status: string;
  summary: string | null;
  session_notes: string | null;
  teeth_data: string | null;
  voice_log: string | null;
  created_at: string;
  completed_at: string | null;
}

function truncateText(text: string, maxChars: number): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}...`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms);
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

function buildFindingLines(teeth: ToothState[], maxFindings: number): string[] {
  const findings = teeth.filter(hasToothFinding);
  const lines = findings.slice(0, maxFindings).map((tooth) => {
    const parts: string[] = [`Tooth ${tooth.number}`];
    if (tooth.labels.length > 0) {
      parts.push(`Labels: ${tooth.labels.map((label) => conditionLabels[label]).join(", ")}`);
    }
    for (const [surface, condition] of Object.entries(tooth.surfaces)) {
      parts.push(`${conditionLabels[condition]} (${surface})`);
    }
    if (tooth.mobility !== "none") parts.push(`Mobility: ${tooth.mobility}`);
    if (tooth.note) parts.push(`Note: ${truncateText(tooth.note, 140)}`);
    return `  ${parts.join(" | ")}`;
  });

  if (findings.length > maxFindings) {
    lines.push(`  + ${findings.length - maxFindings} additional findings omitted for speed`);
  }

  return lines;
}

function buildSessionSection(
  session: SessionRecord,
  includeVoiceLog: boolean,
): string {
  const date = new Date(session.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const status = session.status === "completed" ? "Completed" : "Active";
  const lines: string[] = [`=== Session ${date} (${status}) ===`];

  if (session.summary?.trim()) {
    lines.push(`Summary: ${truncateText(session.summary, MAX_SUMMARY_CHARS)}`);
  }

  if (session.session_notes?.trim()) {
    lines.push(`General session notes: ${truncateText(session.session_notes, MAX_NOTES_CHARS)}`);
  }

  if (session.teeth_data) {
    try {
      const teeth = JSON.parse(session.teeth_data) as ToothState[];
      const findingLines = buildFindingLines(teeth, MAX_FINDINGS_PER_SESSION);
      if (findingLines.length > 0) {
        lines.push("Findings:");
        lines.push(...findingLines);
      } else {
        lines.push("No findings recorded.");
      }
    } catch {
      lines.push("Teeth data unavailable.");
    }
  }

  if (includeVoiceLog && session.voice_log) {
    try {
      const log = JSON.parse(session.voice_log) as VoiceLogEntry[];
      const meaningful = log
        .filter((entry) => entry.parsed !== "No changes parsed")
        .slice(0, MAX_LOG_ENTRIES_PER_SESSION);

      if (meaningful.length > 0) {
        lines.push("Voice commands:");
        for (const entry of meaningful) {
          lines.push(`  [${entry.timestamp}] ${truncateText(entry.parsed, 140)}`);
        }
      }
    } catch {
      // Ignore malformed voice logs.
    }
  }

  return `${lines.join("\n")}\n\n`;
}

function buildFastFallbackAnswer(
  sessions: SessionRecord[],
  currentTeeth?: ToothState[],
  currentSessionNotes?: string,
): string | null {
  const currentFindings = currentTeeth ? buildFindingLines(currentTeeth, 3) : [];
  if (currentFindings.length > 0 || currentSessionNotes?.trim()) {
    const currentDetails = currentFindings.length > 0
      ? currentFindings.map((line) => line.trim()).join("; ")
      : truncateText(currentSessionNotes ?? "", 220);
    return `I couldn't complete the full history lookup in time. Current session details available now: ${currentDetails}`;
  }

  const latestSession = sessions[0];
  if (!latestSession) return null;

  const date = new Date(latestSession.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (latestSession.summary?.trim()) {
    return `I couldn't complete the full history lookup in time. The latest recorded session from ${date} notes: ${truncateText(latestSession.summary, 220)}`;
  }

  if (latestSession.session_notes?.trim()) {
    return `I couldn't complete the full history lookup in time. The latest recorded session from ${date} includes: ${truncateText(latestSession.session_notes, 220)}`;
  }

  return null;
}

/** Build a text context from all patient sessions for the LLM */
function buildPatientContext(
  question: string,
  patientName: string,
  sessions: SessionRecord[],
  currentTeeth?: ToothState[],
  currentSessionNotes?: string,
): string {
  const includeVoiceLog = TRANSCRIPT_QUESTION_RE.test(question);
  const maxSessions = HISTORY_QUESTION_RE.test(question)
    ? MAX_HISTORY_SESSIONS
    : MAX_RECENT_SESSIONS;
  const selectedSessions = sessions.slice(0, maxSessions);

  let context = `Patient: ${patientName}\nTotal sessions on record: ${sessions.length}\nIncluded historical sessions: ${selectedSessions.length}\n\n`;

  // Current session data (if provided — the live session)
  if (currentTeeth || currentSessionNotes?.trim()) {
    const currentFindings = currentTeeth
      ? buildFindingLines(currentTeeth, MAX_FINDINGS_PER_SESSION)
      : [];

    context += "=== CURRENT SESSION (live) ===\n";
    if (currentFindings.length > 0) {
      context += `Findings:\n${currentFindings.join("\n")}\n`;
    }
    if (currentSessionNotes?.trim()) {
      context += `General session notes: ${truncateText(currentSessionNotes, MAX_NOTES_CHARS)}\n`;
    }
    context += "\n";
  }

  let includedSessions = 0;
  for (const session of selectedSessions) {
    const section = buildSessionSection(session, includeVoiceLog);
    if (context.length + section.length > MAX_CONTEXT_CHARS) break;
    context += section;
    includedSessions += 1;
  }

  if (sessions.length > includedSessions) {
    context += `Older sessions omitted for speed: ${sessions.length - includedSessions}\n`;
  }

  return context;
}

/** Extract text content from Workers AI response */
function extractContent(response: unknown): string | null {
  if (typeof response !== "object" || response === null) return String(response);
  const r = response as Record<string, unknown>;
  if ("response" in r && typeof r.response === "string") return r.response;
  if ("choices" in r && Array.isArray(r.choices)) {
    const choice = (r.choices as Array<{ message?: { content?: string | null } }>)[0];
    if (choice?.message?.content) return choice.message.content;
    return null;
  }
  return JSON.stringify(response);
}

/** Call Gemini as fallback */
async function callGemini(apiKey: string, systemPrompt: string, userMessage: string): Promise<string | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}\n\n---\n${userMessage}` }] },
        ],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
    });

    if (!resp.ok) {
      console.error("[patient-rag] Gemini error:", resp.status);
      return null;
    }

    const data = (await resp.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (err) {
    console.warn("[patient-rag] Gemini request failed:", (err as Error).message);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Answer a dentist's question about a patient using their full history.
 * Structured RAG: retrieve from D1 -> build context -> LLM synthesis.
 */
export async function askAboutPatient(
  ai: Ai,
  question: string,
  patientName: string,
  sessions: SessionRecord[],
  currentTeeth?: ToothState[],
  currentSessionNotes?: string,
  googleAiApiKey?: string,
): Promise<string> {
  const context = buildPatientContext(
    question,
    patientName,
    sessions,
    currentTeeth,
    currentSessionNotes,
  );

  const userMessage = `Here is the patient's full dental history:\n\n${context}\n---\nDentist's question: ${question}`;

  const messages = [
    { role: "system", content: RAG_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let text: string | null = null;

  // Try Workers AI
  for (const model of MODELS) {
    try {
      console.log("[patient-rag] Trying model:", model);
      const response = await withTimeout(
        ai.run(model as Parameters<Ai["run"]>[0], {
          messages,
          max_tokens: 1024,
          temperature: 0.3,
        }),
        WORKERS_AI_TIMEOUT_MS,
        `Workers AI ${model}`,
      );
      text = extractContent(response);
      if (text) {
        console.log("[patient-rag] Model", model, "succeeded");
        break;
      }
    } catch (err) {
      console.warn("[patient-rag] Model", model, "failed:", (err as Error).message);
    }
  }

  // Gemini fallback
  if (!text && googleAiApiKey) {
    try {
      console.log("[patient-rag] Trying Gemini fallback...");
      text = await callGemini(googleAiApiKey, RAG_SYSTEM_PROMPT, userMessage);
      if (text) console.log("[patient-rag] Gemini succeeded");
    } catch (err) {
      console.warn("[patient-rag] Gemini failed:", (err as Error).message);
    }
  }

  if (!text) {
    return buildFastFallbackAnswer(sessions, currentTeeth, currentSessionNotes)
      ?? "I'm sorry, I couldn't process your question right now. Please try again.";
  }

  // Clean up any accidental markdown
  return text.replace(/[#*_`]/g, "").trim();
}
