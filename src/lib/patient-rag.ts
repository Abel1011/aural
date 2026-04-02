import type { ToothState, VoiceLogEntry } from "../data/dental";
import { conditionLabels, hasToothFinding } from "../data/dental";

// Workers AI models in order of preference
const MODELS = [
  "@cf/moonshotai/kimi-k2.5",
  "@cf/nvidia/nemotron-3-120b-a12b",
] as const;

const GEMINI_MODEL = "gemini-3.1-pro-preview";
const GEMINI_ENDPOINT = `https://aiplatform.googleapis.com/v1/publishers/google/models/${GEMINI_MODEL}:generateContent`;

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

/** Build a text context from all patient sessions for the LLM */
function buildPatientContext(
  patientName: string,
  sessions: SessionRecord[],
  currentTeeth?: ToothState[],
  currentSessionNotes?: string,
): string {
  let context = `Patient: ${patientName}\nTotal sessions on record: ${sessions.length}\n\n`;

  // Current session data (if provided — the live session)
  if (currentTeeth) {
    const findings = currentTeeth.filter(hasToothFinding);
    if (findings.length > 0) {
      context += "=== CURRENT SESSION (live) ===\n";
      for (const t of findings) {
        const parts: string[] = [`Tooth ${t.number}`];
        if (t.labels.length > 0) parts.push(`Labels: ${t.labels.map((l) => conditionLabels[l]).join(", ")}`);
        for (const [s, c] of Object.entries(t.surfaces)) {
          parts.push(`${conditionLabels[c]} on ${s}`);
        }
        if (t.mobility !== "none") parts.push(`Mobility: ${t.mobility}`);
        if (t.note) parts.push(`Note: ${t.note}`);
        context += `  ${parts.join(" | ")}\n`;
      }
      if (currentSessionNotes?.trim()) {
        context += `General session notes: ${currentSessionNotes.trim()}\n`;
      }
      context += "\n";
    } else if (currentSessionNotes?.trim()) {
      context += "=== CURRENT SESSION (live) ===\n";
      context += `General session notes: ${currentSessionNotes.trim()}\n\n`;
    }
  }

  // Historical sessions (most recent first)
  for (const session of sessions) {
    const date = new Date(session.created_at).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const status = session.status === "completed" ? "Completed" : "Active";
    context += `=== Session ${date} (${status}) ===\n`;

    if (session.summary) {
      context += `Summary: ${session.summary}\n`;
    }

    if (session.session_notes) {
      context += `General session notes: ${session.session_notes}\n`;
    }

    if (session.teeth_data) {
      try {
        const teeth = JSON.parse(session.teeth_data) as ToothState[];
        const findings = teeth.filter(hasToothFinding);
        if (findings.length > 0) {
          context += "Findings:\n";
          for (const t of findings) {
            const parts: string[] = [`Tooth ${t.number}`];
            if (t.labels.length > 0) parts.push(t.labels.map((l) => conditionLabels[l]).join(", "));
            for (const [s, c] of Object.entries(t.surfaces)) {
              parts.push(`${conditionLabels[c]} (${s})`);
            }
            if (t.mobility !== "none") parts.push(`mobility ${t.mobility}`);
            if (t.note) parts.push(`note: ${t.note}`);
            context += `  ${parts.join(", ")}\n`;
          }
        } else {
          context += "No findings recorded.\n";
        }
      } catch {
        context += "Teeth data unavailable.\n";
      }
    }

    // Include a few voice log entries for context (limit to avoid token overflow)
    if (session.voice_log) {
      try {
        const log = JSON.parse(session.voice_log) as VoiceLogEntry[];
        const meaningful = log.filter((e) => e.parsed !== "No changes parsed").slice(0, 15);
        if (meaningful.length > 0) {
          context += "Voice commands:\n";
          for (const e of meaningful) {
            context += `  [${e.timestamp}] ${e.parsed}\n`;
          }
        }
      } catch {
        // skip
      }
    }

    context += "\n";
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
  const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { role: "user", parts: [{ text: `${systemPrompt}\n\n---\n${userMessage}` }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
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
      const response = await ai.run(model as Parameters<Ai["run"]>[0], {
        messages,
        max_tokens: 2048,
        temperature: 0.3,
      });
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
    return "I'm sorry, I couldn't process your question right now. Please try again.";
  }

  // Clean up any accidental markdown
  return text.replace(/[#*_`]/g, "").trim();
}
