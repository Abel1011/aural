// Script to update the ElevenLabs ConvAI agent prompt and client tools.
// Run: node scripts/update-agent.mjs

import { readFileSync } from "fs";

const devVars = readFileSync(".dev.vars", "utf8");
const apiKey = devVars.match(/ELEVENLABS_API_KEY=(.+)/)?.[1]?.trim();
const agentId = devVars.match(/ELEVENLABS_AGENT_ID=(.+)/)?.[1]?.trim();

if (!apiKey || !agentId) {
  console.error("Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID in .dev.vars");
  process.exit(1);
}

const BASE_CLIENT_TOOL_CONFIG = {
  type: "client",
  response_timeout_secs: 20,
  disable_interruptions: false,
  force_pre_tool_speech: false,
  assignments: [],
  tool_call_sound: null,
  tool_call_sound_behavior: "auto",
  tool_error_handling_mode: "auto",
  expects_response: true,
  dynamic_variables: { dynamic_variable_placeholders: {} },
  execution_mode: "immediate",
};

function stringParam(description) {
  return {
    type: "string",
    description,
    enum: null,
    is_system_provided: false,
    dynamic_variable: "",
    constant_value: "",
  };
}

const updateOdontogramTool = {
  tool_config: {
    ...BASE_CLIENT_TOOL_CONFIG,
    name: "update_odontogram",
    description:
      "Update a tooth on the dental chart with clinical findings or a tooth-specific note. Call this when the dentist describes a finding tied to one tooth.",
    parameters: {
      type: "object",
      required: ["tooth"],
      description: "",
      properties: {
        tooth: stringParam("FDI/ISO 3950 tooth number (11-48)"),
        surfaces: stringParam("Comma-separated surfaces: O,M,D,V,L"),
        surface_condition: stringParam(
          "Condition: caries, composite, amalgam, inlay, or onlay",
        ),
        labels: stringParam(
          "Comma-separated labels: crown, bridge, prosthesis, implant, rct, missing",
        ),
        mobility: stringParam("Mobility grade: none, M1, M2, M3"),
        note: stringParam(
          "Optional tooth-specific clinical note tied only to this tooth",
        ),
      },
    },
  },
};

const updateSessionNotesTool = {
  tool_config: {
    ...BASE_CLIENT_TOOL_CONFIG,
    name: "update_session_notes",
    description:
      "Append or replace general notes for the whole dental session. Call this when the dentist dictates symptoms, visit context, patient concerns, or any observation not tied to a single tooth.",
    parameters: {
      type: "object",
      required: ["note"],
      description: "",
      properties: {
        note: stringParam(
          "General session note for the whole visit. Use the clinician's wording as closely as possible.",
        ),
        mode: stringParam(
          "append or replace. Use append by default. Use replace only if the dentist explicitly says overwrite, replace, or clear the existing session note.",
        ),
      },
    },
  },
};

const newPrompt = `You are a dental charting assistant for VocalChart. You help dentists record clinical findings by voice during patient examinations.

CRITICAL BEHAVIOR:
- When the dentist dictates findings, call the appropriate tool SILENTLY. Do NOT speak a confirmation after registering. Stay completely silent and wait for the next command.
- ONLY speak when the dentist directly asks you something: "summary", "what do we have", "read back", "status", or asks a clinical question.
- ONLY speak when undo is requested: "cancel last", "undo". Briefly confirm what was undone.
- If you hear a correction like "that was tooth 25 not 15", process it silently via undo + new tool call.
- The dentist may dictate multiple findings rapidly. Process each one silently without interrupting their flow.

TOOTH NUMBERING (ISO 3950 / FDI):
- Upper right: 18, 17, 16, 15, 14, 13, 12, 11
- Upper left: 21, 22, 23, 24, 25, 26, 27, 28
- Lower left: 31, 32, 33, 34, 35, 36, 37, 38
- Lower right: 48, 47, 46, 45, 44, 43, 42, 41

SURFACES: O (occlusal), M (mesial), D (distal), V (vestibular/buccal), L (lingual/palatal)
Compound examples: MOD = M + O + D, MO = M + O, OV = O + V.

SURFACE CONDITIONS: caries, composite, amalgam, inlay, onlay
WHOLE-TOOTH LABELS: crown, bridge, prosthesis, implant, rct, missing
MOBILITY: none, M1, M2, M3

STT CORRECTIONS:
- carries, Kerry's, carry's = caries
- buckle, buckall = buccal/vestibular (V)
- inclusive, occluded = occlusal (O)
- decay = caries
- restoration without material = composite

TOOL RULES:
- Use update_odontogram for any finding tied to one tooth.
- If the dentist includes a tooth-specific note, pass it in the note parameter of update_odontogram.
- Use update_session_notes for general notes about the whole visit, patient symptoms, chief complaint, treatment context, or anything not tied to one tooth.
- For update_session_notes, use mode append by default. Use replace only if the dentist explicitly asks to replace or overwrite the general session note.
- Call undo_last when they say cancel last or undo.
- Missing is exclusive and clears surfaces and mobility.
- Implant and RCT cannot coexist on the same tooth.
- When asked for summary, include both odontogram findings and any general session notes concisely.`;

async function api(path, init = {}) {
  const resp = await fetch(`https://api.elevenlabs.io${path}`, {
    ...init,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`${resp.status} ${text}`);
  }

  return resp.json();
}

async function listTools() {
  const data = await api("/v1/convai/tools?types=client&page_size=100");
  return data.tools ?? [];
}

async function upsertTool(existingTools, name, payload) {
  const existing = existingTools.find((tool) => tool.tool_config?.name === name);

  if (existing) {
    const updated = await api(`/v1/convai/tools/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return updated.id;
  }

  const created = await api("/v1/convai/tools", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return created.id;
}

console.log("Syncing ElevenLabs tools and agent", agentId, "...");

const tools = await listTools();
const updateOdontogramId = await upsertTool(
  tools,
  "update_odontogram",
  updateOdontogramTool,
);
const updateSessionNotesId = await upsertTool(
  tools,
  "update_session_notes",
  updateSessionNotesTool,
);

const refreshTools = await listTools();
const undoLastId = refreshTools.find((tool) => tool.tool_config?.name === "undo_last")?.id;
const askAboutPatientId = refreshTools.find(
  (tool) => tool.tool_config?.name === "ask_about_patient",
)?.id;

if (!undoLastId || !askAboutPatientId) {
  throw new Error("Missing required existing tools: undo_last and/or ask_about_patient");
}

const agent = await api(`/v1/convai/agents/${agentId}`);
const conversationConfig = agent.conversation_config ?? {};
conversationConfig.agent ??= {};
conversationConfig.agent.first_message ??= "Ready.";
conversationConfig.agent.prompt ??= {};
conversationConfig.agent.prompt.prompt = newPrompt;
delete conversationConfig.agent.prompt.tools;
conversationConfig.agent.prompt.tool_ids = [
  updateOdontogramId,
  undoLastId,
  askAboutPatientId,
  updateSessionNotesId,
];

const result = await api(`/v1/convai/agents/${agentId}`, {
  method: "PATCH",
  body: JSON.stringify({ conversation_config: conversationConfig }),
});

console.log("Updated successfully!");
console.log("Tool IDs:", result.conversation_config?.agent?.prompt?.tool_ids);
console.log(
  "Prompt preview:",
  result.conversation_config?.agent?.prompt?.prompt?.substring(0, 240),
);
