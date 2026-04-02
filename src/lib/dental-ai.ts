import type { Surface, SurfaceCondition, ToothLabel, Mobility } from "../data/dental";

/** Structured result from parsing a dental voice command. */
export interface DentalCommand {
  action: "add" | "remove" | "correct" | "undo" | "query";
  tooth?: number;
  surfaces?: Surface[];
  surfaceCondition?: SurfaceCondition;
  labels?: ToothLabel[];
  mobility?: Mobility;
  note?: string;
  sessionNote?: string;
  noteMode?: "append" | "replace";
  raw: string;
}

const SYSTEM_PROMPT = `You are a dental charting NLU parser. Extract structured commands from dentist speech.

IMPORTANT: The input is a raw speech-to-text transcript that WILL contain transcription errors and may contain MULTIPLE commands concatenated together. Parse ALL commands you can find.

Common STT corrections (apply these mentally before parsing):
- "carries", "Kerry's", "carry's", "caries" → caries
- "messy al", "me seal", "mesial" → mesial (surface M)
- "distant", "this tall", "dis tal" → distal (surface D)
- "vestibular", "best tubular", "vest tubular", "buckle", "buccal", "buckall" → vestibular/buccal (surface V)
- "lingual", "linguall", "ling wall", "ling gull" → lingual (surface L)
- "occlusal", "a clue soul", "oh clue sal", "inclusive", "occluded" → occlusal (surface O)
- "composite", "come posit", "comp a sit" → composite
- "amalgam", "a mull gum" → amalgam
- "implant", "im plant" → implant
- "restoration" → typically composite (unless specified otherwise)
- "decay" → caries
- "root canal", "RCT" → rct label
- "bridge", "pontiac" → bridge label
- "prosthesis", "prothesis", "denture" → prosthesis label
- "MOD" = surfaces M + O + D. "OV" = surfaces O + V. "MO" = surfaces M + O.
- Numbers: "eighteen" = 18, "twenty one" or "two one" = 21, "thirty six" = 36, "fourteen" = 14, etc.
- "buccal and lingual" = surfaces V + L

Context: ISO 3950 (FDI) tooth numbering. Teeth are numbered 11-18 (upper right), 21-28 (upper left), 31-38 (lower left), 41-48 (lower right).
Surfaces: O (occlusal), M (mesial), D (distal), V (vestibular/buccal), L (lingual/palatal).
Surface conditions (per-surface): caries, composite, amalgam, inlay, onlay.
Labels (whole-tooth): crown, bridge, prosthesis, implant, rct, missing.
Mobility: none, M1, M2, M3.

Rules:
- "cancel last" or "undo" → action: "undo"
- "correct: was X, not Y" or "that was X not Y" → action: "correct" with the CORRECTED tooth number
- Questions like "summary", "what do we have", "read back", "status" → action: "query"
- Tooth references: "eighteen" = 18, "two-one" = 21, "tooth 36" = 36
- The input may contain MULTIPLE sentences/commands concatenated. Parse each one as a separate command in the array.
- "restoration" without a material specified defaults to surfaceCondition: "composite"
- "decay" = surfaceCondition: "caries"
- Tooth-specific notes should use tooth + note. Example: "tooth 24 note fractured cusp" → {"action":"add","tooth":24,"note":"fractured cusp"}
- General visit or session notes that are NOT tied to one tooth should use sessionNote instead of note.
- Session note phrases include: "session note", "general note", "visit note", "for this visit", "patient reports", or any whole-visit observation without a single-tooth target.
- For sessionNote, default noteMode to "append" unless the dentist explicitly says replace, overwrite, or clear the session note.
- If unsure about a field, omit it — but try hard to extract a valid tooth number

Respond with ONLY a JSON array of commands. No markdown fences, no explanation.

Example input: "Tooth eighteen, caries on occlusal and mesial"
Example output: [{"action":"add","tooth":18,"surfaces":["O","M"],"surfaceCondition":"caries"}]

Example input: "Twenty-one has root canal treatment and a crown"
Example output: [{"action":"add","tooth":21,"labels":["rct","crown"]}]

Example input: "Cancel last"
Example output: [{"action":"undo"}]

Example input: "What do we have so far"
Example output: [{"action":"query"}]

Example input: "Thirty-six, composite MOD, mobility grade one"
Example output: [{"action":"add","tooth":36,"surfaces":["M","O","D"],"surfaceCondition":"composite","mobility":"M1"}]

Example input: "tooth 11 composite restoration on the mesial surface."
Example output: [{"action":"add","tooth":11,"surfaces":["M"],"surfaceCondition":"composite"}]

Example input: "I see decay on the buckle and lingual of 18."
Example output: [{"action":"add","tooth":18,"surfaces":["V","L"],"surfaceCondition":"caries"}]

Example input: "Tooth 14 carries on distal tooth 15 carries on mesial and occlusal."
Example output: [{"action":"add","tooth":14,"surfaces":["D"],"surfaceCondition":"caries"},{"action":"add","tooth":15,"surfaces":["M","O"],"surfaceCondition":"caries"}]

Example input: "Undo last. That was tooth 25, not 15. Tooth 37 implant."
Example output: [{"action":"undo"},{"action":"add","tooth":25,"surfaces":["M","O"],"surfaceCondition":"caries"},{"action":"add","tooth":37,"labels":["implant"]}]

Example input: "24 has a large MOD restoration"
Example output: [{"action":"add","tooth":24,"surfaces":["M","O","D"],"surfaceCondition":"composite"}]

Example input: "Session note, patient reports cold sensitivity on the upper left"
Example output: [{"action":"add","sessionNote":"patient reports cold sensitivity on the upper left","noteMode":"append"}]

Example input: "Tooth 14 note recurrent food impaction distal"
Example output: [{"action":"add","tooth":14,"note":"recurrent food impaction distal"}]

Example input: "Replace the session note with patient is anxious and wants conservative treatment"
Example output: [{"action":"add","sessionNote":"patient is anxious and wants conservative treatment","noteMode":"replace"}]`;

// Workers AI models in order of preference
const MODELS = [
  "@cf/moonshotai/kimi-k2.5",
  "@cf/nvidia/nemotron-3-120b-a12b",
] as const;

// Gemini fallback config
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** Extract the text payload from a Workers AI response (handles both standard and OpenAI formats). */
function extractContent(response: unknown): string | null {
  if (typeof response !== "object" || response === null) return String(response);
  const r = response as Record<string, unknown>;

  // Standard Workers AI format: {response: "..."}
  if ("response" in r && typeof r.response === "string") return r.response;

  // OpenAI chat-completion format (kimi-k2.5): {choices: [{message: {content}}]}
  if ("choices" in r && Array.isArray(r.choices)) {
    const choice = (r.choices as Array<{ message?: { content?: string | null }; finish_reason?: string }>)[0];
    if (choice?.message?.content) return choice.message.content;
    console.error("[dental-ai] LLM returned no content. finish_reason:", choice?.finish_reason);
    return null;
  }

  return JSON.stringify(response);
}

/** Call Gemini API as a fallback when Workers AI is unavailable. */
async function callGemini(apiKey: string, systemPrompt: string, userMessage: string): Promise<string | null> {
  const body = {
    contents: [
      { role: "user", parts: [{ text: `${systemPrompt}\n\n---\nTranscript to parse:\n${userMessage}` }] },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
    },
  };

  const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    console.error("[dental-ai] Gemini HTTP error:", resp.status, await resp.text().catch(() => ""));
    return null;
  }

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

/** Parse JSON commands from raw LLM text output. */
function parseCommandsFromText(text: string, transcript: string): DentalCommand[] {
  // Strip markdown fences if present
  const cleaned = text.replace(/```[\s\S]*?```/g, "").trim();
  const jsonStr = cleaned.match(/\[[\s\S]*\]/)?.[0] ?? "[]";
  const parsed = JSON.parse(jsonStr) as DentalCommand[];
  console.log("[dental-ai] PARSED commands:", JSON.stringify(parsed));
  return parsed.map((cmd) => ({ ...cmd, raw: transcript }));
}

/** Parse a voice transcript into structured dental commands using Workers AI with Gemini fallback. */
export async function parseDentalCommand(
  ai: Ai,
  transcript: string,
  googleAiApiKey?: string,
): Promise<DentalCommand[]> {
  console.log("[dental-ai] INPUT transcript:", transcript);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: transcript },
  ];

  let text: string | null = null;

  // Try Workers AI models first
  for (const model of MODELS) {
    try {
      console.log("[dental-ai] Trying model:", model);
      const response = await ai.run(model as Parameters<Ai["run"]>[0], {
        messages,
        max_tokens: 4096,
        temperature: 0.1,
      });
      text = extractContent(response);
      if (text) {
        console.log("[dental-ai] Model", model, "succeeded");
        break;
      }
    } catch (err) {
      console.warn("[dental-ai] Model", model, "failed:", (err as Error).message);
    }
  }

  // Fallback to Gemini if Workers AI failed
  if (!text && googleAiApiKey) {
    try {
      console.log("[dental-ai] All Workers AI models failed, trying Gemini fallback...");
      text = await callGemini(googleAiApiKey, SYSTEM_PROMPT, transcript);
      if (text) console.log("[dental-ai] Gemini fallback succeeded");
    } catch (err) {
      console.warn("[dental-ai] Gemini fallback failed:", (err as Error).message);
    }
  }

  if (!text) {
    console.error("[dental-ai] All models (including Gemini fallback) failed for transcript:", transcript);
    return [{ action: "add", raw: transcript }];
  }

  console.log("[dental-ai] RAW content:", text);

  try {
    return parseCommandsFromText(text, transcript);
  } catch (err) {
    console.error("[dental-ai] PARSE ERROR:", err, "from text:", text);
    return [{ action: "add", raw: transcript }];
  }
}
