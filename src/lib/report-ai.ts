import type { ToothState, VoiceLogEntry } from "../data/dental";
import { conditionLabels, hasToothFinding } from "../data/dental";

// Workers AI models (same priority as dental-ai)
const MODELS = [
  "@cf/moonshotai/kimi-k2.5",
  "@cf/nvidia/nemotron-3-120b-a12b",
] as const;

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";
const GEMINI_ENDPOINT = `https://aiplatform.googleapis.com/v1/publishers/google/models/${GEMINI_MODEL}:generateContent`;

const REPORT_SYSTEM_PROMPT = `You are a dental clinical report assistant. Given structured dental examination data, generate a clear, professional clinical report in English.

The report should be in Markdown format with these sections:

## Clinical Findings
A concise narrative of all findings organized by quadrant (Upper Right, Upper Left, Lower Left, Lower Right). Mention each tooth with findings, the conditions found, and affected surfaces. Use standard dental terminology.

## Summary
A brief paragraph summarizing the overall oral health status — how many teeth have findings, what are the most common conditions, and any areas of concern.

## Recommended Treatment Plan
Based on the findings, suggest a prioritized treatment plan. Group by urgency:
- **Immediate**: Conditions requiring prompt attention (active caries, severe mobility)
- **Short-term**: Planned restorations, crowns, etc.
- **Long-term**: Monitoring, preventive care

Keep the language professional but easy to understand. Be concise — this is a clinical report, not an essay. Do NOT invent findings that are not in the data. Only report what is provided.`;

/** Build a structured text representation of session findings for the LLM */
function buildFindingsText(
  teeth: ToothState[],
  voiceLog: VoiceLogEntry[],
  patientName: string,
  sessionDate: string,
): string {
  const findings = teeth.filter(hasToothFinding);

  const lines = findings.map((t) => {
    const parts: string[] = [`Tooth ${t.number}`];
    if (t.labels.length > 0) {
      parts.push(`Labels: ${t.labels.map((l) => conditionLabels[l]).join(", ")}`);
    }
    const surfaces = Object.entries(t.surfaces);
    if (surfaces.length > 0) {
      for (const [surface, condition] of surfaces) {
        parts.push(`${conditionLabels[condition]} on surface ${surface}`);
      }
    }
    if (t.mobility !== "none") parts.push(`Mobility: ${t.mobility}`);
    if (t.note) parts.push(`Note: ${t.note}`);
    return parts.join(" | ");
  });

  let text = `Patient: ${patientName}\nDate: ${sessionDate}\nTotal teeth with findings: ${findings.length}\n\n`;
  if (lines.length > 0) {
    text += "Dental findings:\n" + lines.join("\n");
  } else {
    text += "No dental findings recorded.";
  }

  if (voiceLog.length > 0) {
    text += "\n\nVoice commands log (for context):\n";
    text += voiceLog
      .filter((e) => e.parsed !== "No changes parsed")
      .slice(0, 30) // limit to avoid token overflow
      .map((e) => `[${e.timestamp}] ${e.parsed}`)
      .join("\n");
  }

  return text;
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
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    }),
  });

  if (!resp.ok) {
    console.error("[report-ai] Gemini error:", resp.status);
    return null;
  }

  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

/** Generate a clinical dental report using LLM from session data. */
export async function generateReport(
  ai: Ai,
  teeth: ToothState[],
  voiceLog: VoiceLogEntry[],
  patientName: string,
  sessionDate: string,
  googleAiApiKey?: string,
): Promise<string> {
  const findingsText = buildFindingsText(teeth, voiceLog, patientName, sessionDate);
  const findings = teeth.filter(hasToothFinding);

  // If no findings, return a simple report without calling the LLM
  if (findings.length === 0) {
    return `## Clinical Findings\n\nNo dental findings were recorded during this examination.\n\n## Summary\n\nThe examination for **${patientName}** on ${sessionDate} did not record any findings. All examined teeth appear within normal parameters.\n\n## Recommended Treatment Plan\n\nRoutine dental check-up and cleaning recommended in 6 months.`;
  }

  const messages = [
    { role: "system", content: REPORT_SYSTEM_PROMPT },
    { role: "user", content: findingsText },
  ];

  let text: string | null = null;

  // Try Workers AI
  for (const model of MODELS) {
    try {
      console.log("[report-ai] Trying model:", model);
      const response = await ai.run(model as Parameters<Ai["run"]>[0], {
        messages,
        max_tokens: 4096,
        temperature: 0.3,
      });
      text = extractContent(response);
      if (text) {
        console.log("[report-ai] Model", model, "succeeded");
        break;
      }
    } catch (err) {
      console.warn("[report-ai] Model", model, "failed:", (err as Error).message);
    }
  }

  // Gemini fallback
  if (!text && googleAiApiKey) {
    try {
      console.log("[report-ai] Trying Gemini fallback...");
      text = await callGemini(googleAiApiKey, REPORT_SYSTEM_PROMPT, findingsText);
      if (text) console.log("[report-ai] Gemini succeeded");
    } catch (err) {
      console.warn("[report-ai] Gemini failed:", (err as Error).message);
    }
  }

  if (!text) {
    // Fallback: generate a basic report without LLM
    const quadrants: Record<string, typeof findings> = {
      "Upper Right (Q1)": findings.filter((t) => t.number >= 11 && t.number <= 18),
      "Upper Left (Q2)": findings.filter((t) => t.number >= 21 && t.number <= 28),
      "Lower Left (Q3)": findings.filter((t) => t.number >= 31 && t.number <= 38),
      "Lower Right (Q4)": findings.filter((t) => t.number >= 41 && t.number <= 48),
    };

    let report = `## Clinical Findings\n\n`;
    for (const [name, teeth] of Object.entries(quadrants)) {
      if (teeth.length === 0) continue;
      report += `**${name}:**\n`;
      for (const t of teeth) {
        const parts: string[] = [];
        if (t.labels.length > 0) parts.push(t.labels.map((l) => conditionLabels[l]).join(", "));
        for (const [s, c] of Object.entries(t.surfaces)) {
          parts.push(`${conditionLabels[c]} (${s})`);
        }
        if (t.mobility !== "none") parts.push(`Mobility ${t.mobility}`);
        report += `- Tooth ${t.number}: ${parts.join(", ")}\n`;
      }
      report += "\n";
    }

    report += `## Summary\n\n${findings.length} teeth with findings recorded for ${patientName} on ${sessionDate}.\n\n`;
    report += `## Recommended Treatment Plan\n\nPlease consult with the treating dentist for a detailed treatment plan based on the findings above.`;

    return report;
  }

  return text;
}
