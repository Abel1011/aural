# Aural -- Voice-Powered Dental Charting with AI

Aural is a real-time, voice-controlled dental charting application that allows dentists to dictate clinical observations while examining patients. The system automatically transcribes speech, extracts structured dental entities using AI, and updates an interactive odontogram (dental chart) in real time -- eliminating the need for a human assistant to manually record findings.

Built for the **Cloudflare x ElevenLabs Hackathon**, Aural deeply integrates **8 Cloudflare services** and **3 ElevenLabs services** to deliver an end-to-end AI-powered clinical workflow entirely on the edge.

---

## Table of Contents

1. [The Problem](#the-problem)
2. [How It Works](#how-it-works)
3. [Architecture Overview](#architecture-overview)
4. [How We Use ElevenLabs](#how-we-use-elevenlabs)
5. [How We Use Cloudflare](#how-we-use-cloudflare)
6. [ElevenLabs Integration (3 Services)](#elevenlabs-integration-3-services)
7. [Cloudflare Integration (8 Services)](#cloudflare-integration-8-services)
8. [Voice Pipeline in Detail](#voice-pipeline-in-detail)
9. [Dental Domain Model](#dental-domain-model)
10. [Frontend Deep Dive](#frontend-deep-dive)
11. [Backend Deep Dive](#backend-deep-dive)
12. [AI Processing Layer](#ai-processing-layer)
13. [Database Schema](#database-schema)
14. [Project Structure](#project-structure)
15. [Getting Started](#getting-started)
16. [Environment Variables](#environment-variables)
17. [Tech Stack](#tech-stack)

---

## The Problem

Dental examinations follow a strict protocol: the dentist inspects each of the 32 teeth, identifies conditions on up to 5 surfaces per tooth, and records findings in a standardized chart (the odontogram). Doing this accurately while simultaneously operating instruments and talking to the patient is cognitively demanding.

The traditional solution is a dedicated clinical assistant whose only job is to listen to the dentist and manually fill in the chart. This creates several compounding problems:

**For independent practitioners and small clinics:**
Hiring a dedicated charting assistant just to transcribe what the dentist says is a significant fixed cost. Many practitioners either skip detailed charting or spend time after the appointment reconstructing findings from memory, both of which compromise clinical quality and patient safety.

**For all dental practices:**
- The dentist must constantly repeat, spell out, or clarify findings for the assistant -- breaking clinical focus and slowing the examination.
- Misheard tooth numbers or surface names produce inaccurate records, which can lead to wrong treatments planned on the wrong teeth.
- The chart is a handwritten or manually-typed document, not immediately queryable -- asking "what did we find on tooth 36 last visit?" requires digging through notes.
- Generating a structured treatment plan from the findings requires a separate manual step after the appointment.

**The core insight:** the dentist already speaks the findings out loud. The bottleneck is not knowledge or skill -- it is having an intelligent system that understands dental language, processes it in real time, and records it accurately without requiring human mediation. That is exactly what Aural does.

Aural replaces the human transcriber with an AI system that listens, understands dental terminology in natural speech (including common abbreviations, ISO notation, and speech-to-text errors), charts in real time, confirms each action audibly, supports instant voice corrections, and generates a structured clinical report at session end.

---

## How It Works

1. The dentist opens a voice session for a patient.
2. They speak naturally: *"Tooth 18, caries on the occlusal surface"*, *"36 MOD composite"*, *"45 missing"*.
3. ElevenLabs captures and transcribes the speech in real time (via Conversational AI in agent mode, or Realtime STT in scribe mode).
4. Cloudflare Workers AI parses the transcript into structured dental commands (tooth number, condition, surfaces, action).
5. A Cloudflare Durable Object (SessionAgent) applies the commands to the in-memory odontogram state, persists to D1, and broadcasts updates via WebSocket.
6. The interactive SVG odontogram on screen updates instantly.
7. ElevenLabs TTS confirms each action audibly: *"Tooth 18, caries occlusal, registered."*
8. At session end, the system generates a spoken summary and a clinical report.

---

## Architecture Overview

Aural is a monorepo with two parts sharing a single Cloudflare Worker deployment:

```
                    +---------------------+
                    |   Cloudflare Pages   |
                    |  (React SPA hosting) |
                    +---------+-----------+
                              |
                    +---------v-----------+
                    | Cloudflare Worker    |
                    | (API + routing)      |
                    +--+------+-------+---+
                       |      |       |
          +------------+  +---+---+  ++----------+
          |               |       |              |
  +-------v------+ +-----v---+ +-v--------+ +---v--------+
  | SessionAgent | | D1 (SQL)| | Workers  | | R2 (Object |
  | Durable Obj  | | patients| | AI (LLM) | |  Storage)  |
  | (WebSocket + | | sessions| | NLU +    | | audio +    |
  |  SQLite)     | |         | | reports  | | reports    |
  +--------------+ +---------+ +----------+ +------------+
          |
  +-------v-----------+    +------------------+    +---------------------+
  | ElevenLabs        |    | ElevenLabs       |    | ElevenLabs          |
  | Conversational AI |    | TTS Streaming    |    | Realtime STT        |
  | (agent mode)      |    | (confirmations)  |    | (scribe mode)       |
  +-------------------+    +------------------+    +---------------------+
```

**Frontend**: React 19 + TypeScript + Vite + Tailwind CSS v4, served from Cloudflare Pages.
**Backend**: Cloudflare Workers as the stateless API orchestrator + Durable Objects as stateful session actors.

---

## How We Use ElevenLabs

Aural uses ElevenLabs across three distinct products, each covering a different aspect of the voice experience:

**Conversational AI 2.0 (agent mode):**
The full-duplex conversational interface. The dentist activates it and speaks freely. The agent handles speech recognition, intent understanding, and calls registered client tools (`update_odontogram`, `undo_last`) to update the chart. The agent drives the conversation and can ask for clarification. Integrated via the `@elevenlabs/react` SDK with a signed URL generated server-side to keep the API key off the client.

**Realtime STT -- Scribe v2 (scribe mode):**
A lower-latency alternative where the dentist is fully in control. The SessionAgent Durable Object opens an outbound WebSocket directly to the ElevenLabs Realtime Speech-to-Text API (`scribe_v2_realtime` model, PCM 16kHz audio). Raw transcripts are streamed back and forwarded to Workers AI for dental NLU parsing. This mode is faster for experienced users who know exactly what to dictate.

**TTS Streaming:**
Used independently throughout the app for voice feedback. After each command is processed (in scribe mode), the SessionAgent calls the ElevenLabs TTS API, streams the audio response, converts it to a base64 data URI, and sends it to the browser for immediate playback. Also used for session summaries and patient RAG responses in PatientChat.

---

## How We Use Cloudflare

Aural is built entirely on the Cloudflare developer platform, using 8 services across compute, storage, AI, and hosting:

**Workers (stateless compute):**
The entry point for every request. Handles all REST API routing for patients and sessions, serves signed URLs for ElevenLabs, manages audio uploads to R2, and delegates WebSocket connections to Durable Objects. No servers, no containers -- pure edge compute.

**Durable Objects (stateful actors):**
The `SessionAgent` DO is the heart of the application. One DO instance per active session holds the full odontogram state in memory, accepts WebSocket connections from multiple browser tabs simultaneously (enabling multiscreen sync between dentist and assistant), and exposes RPC methods via the `@callable` decorator. It also opens outbound WebSockets to ElevenLabs for scribe-mode STT.

**Workers AI (LLM inference):**
All AI inference runs on Cloudflare's GPU infrastructure. The dental NLU engine, clinical report generator, and patient RAG system all run LLMs (Kimi K2.5, Nemotron) without leaving the Cloudflare network. No external AI provider round-trips for the core charting workflow.

**D1 (relational database):**
Global patient registry and session history. The Worker queries D1 for all API responses. The SessionAgent persists the odontogram state (as JSON) to D1 on a debounced 5-second schedule, ensuring data survives DO eviction and is queryable from any Worker instance.

**R2 (object storage):**
Stores session audio recordings (captured from the browser during voice sessions) and generated PDF reports. Audio files are uploaded via the Worker API and can be streamed back on demand.

**KV (key-value cache):**
Bound as `CACHE` for caching reference data such as ISO 3950 tooth codes and treatment catalogs.

**Browser Rendering:**
Generates printable PDF reports from the odontogram and session data, stored in R2.

**Pages:**
Hosts the React SPA as static assets colocated with the Worker. The `run_worker_first` directive ensures `/api/*` and `/agents/*` are intercepted by the Worker before falling through to static file serving.

---

## ElevenLabs Integration (3 Services)

### 1. Workers

The main entry point (`src/server.ts`) is a Cloudflare Worker that handles all HTTP routing. It exposes REST endpoints under `/api/*` for patient and session CRUD, delegates real-time connections under `/agents/*` to Durable Objects via the `routeAgentRequest` framework, and serves the React SPA for all other routes.

Key API routes include:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/dashboard` | GET | Aggregated stats: patient count, session count, active sessions |
| `/api/patients` | GET/POST | List or create patients |
| `/api/patients/:id/sessions` | GET/POST | List or create sessions for a patient |
| `/api/patients/:id/active-session` | POST | Idempotent find-or-create for the current active session |
| `/api/sessions/:id` | GET | Retrieve session with parsed teeth_data and voice_log |
| `/api/sessions/:id/complete` | PUT | Mark session as completed |
| `/api/convai/signed-url` | GET | Generate a signed URL for ElevenLabs Conversational AI (keeps API key server-side) |
| `/api/sessions/:id/audio` | POST/GET | Upload or list audio recordings in R2 |

The Worker is fully stateless. All persistent state lives in D1 or Durable Objects.

### 2. Durable Objects (with SQLite)

The `SessionAgent` Durable Object (`src/agents/session.ts`) is the core stateful unit. Each active dental session gets its own DO instance with:

- **In-memory state**: 32-tooth odontogram array, voice log, undo stack, session metadata.
- **WebSocket server**: Accepts connections from one or more browser tabs, broadcasts state changes in real time (enabling multiscreen sync between dentist and assistant screens).
- **RPC methods** (`@callable` decorator): `initSession`, `updateTooth`, `processVoiceCommand`, `undo`, `generateSummary`, `speak`, `completeSession`.
- **Outbound WebSocket to ElevenLabs**: For real-time STT streaming in "scribe" mode.
- **Debounced persistence**: After each state change, a 5-second debounced timer persists the full teeth_data and voice_log as JSON to D1.

The DO uses SQLite (via the `new_sqlite_classes` migration) for internal agent state managed by the `agents` framework, while clinical data is persisted to D1 for global queryability.

### 3. D1 (SQL Database)

Cloudflare D1 serves as the global relational database storing:

- **patients**: id, name, date_of_birth, notes, created_at.
- **sessions**: id, patient_id, status, summary, teeth_data (JSON), voice_log (JSON), created_at, completed_at.

The Worker queries D1 on every API request for patient listings, session history, and dashboard aggregation. The SessionAgent DO writes to D1 on a debounced schedule to persist odontogram state across restarts.

### 4. Workers AI

Workers AI powers the natural language understanding (NLU) layer that converts raw voice transcripts into structured dental commands. The system uses a multi-model fallback chain:

1. **Primary**: `moonshotai/kimi-k2.5` -- fast, accurate structured output.
2. **Secondary**: `nvidia/nemotron-3-120b-a12b` -- high-capacity fallback.
3. **Tertiary**: Google Gemini (external API) -- ultimate fallback if Workers AI is unavailable.

Workers AI is invoked in three places:
- **Command parsing** (`dental-ai.ts`): Extract `{tooth, surfaces, condition, action}` from speech.
- **Report generation** (`report-ai.ts`): Produce structured clinical reports with findings, summaries, and treatment plans.
- **Patient RAG** (`patient-rag.ts`): Answer questions about patient history using session data as context.

### 5. KV (Key-Value Store)

A KV namespace (`CACHE`) is bound for caching frequently accessed data such as ISO 3950 tooth codes and treatment catalogs, reducing D1 query load for reference data.

### 6. R2 (Object Storage)

R2 stores two types of objects:

- **Audio recordings**: Full session audio captured from the microphone during voice sessions (WebM/Opus format), uploaded via `POST /api/sessions/:id/audio` and streamed back via `GET /api/audio/:key`.
- **Generated reports**: PDF clinical reports with odontograms and treatment plans (via Browser Rendering).

### 7. Browser Rendering

Used to generate printable PDF reports from the odontogram and session data. The Worker renders clinical reports into PDF format and stores them in R2 for download or printing.

### 8. Pages

The React SPA is deployed to Cloudflare Pages as static assets colocated with the Worker. The `wrangler.jsonc` configuration uses `not_found_handling: "single-page-application"` to route all non-API paths to `index.html`, with `run_worker_first` ensuring `/api/*` and `/agents/*` are handled by the Worker before falling through to static assets.

---

## ElevenLabs Integration (3 Services)

### 1. Conversational AI 2.0

ElevenLabs Conversational AI is the primary voice interface in agent mode. It operates as a full-duplex conversational agent that:

- **Listens** to the dentist via the browser microphone with real-time speech-to-text.
- **Understands** intent through its built-in LLM layer.
- **Calls tools** defined on the agent to update the odontogram -- the agent invokes `update_odontogram(tooth, surfaces, condition)` or `undo_last()` which are intercepted on the frontend and forwarded to the SessionAgent DO via RPC.
- **Speaks** confirmations and responses using its integrated TTS.

The frontend connects to ElevenLabs via a signed URL generated server-side (`GET /api/convai/signed-url`), keeping the API key secure. The `@elevenlabs/react` SDK provides:

- `ConversationProvider`: WebSocket connection manager.
- `useConversation()`: Hook for start/stop/status.
- Client tools: The frontend registers tool handlers that ElevenLabs calls when the agent decides to update the chart.

The agent is configured (via `scripts/update-agent.mjs`) to:
- Process commands silently without verbose confirmations after every tooth.
- Handle rapid-fire dictation without interrupting the dentist.
- Speak only on explicit requests (summaries, queries) or corrections.
- First message on connect: *"Ready."*

### 2. Realtime STT (Scribe v2)

Used in scribe mode as a lower-latency alternative to the full Conversational AI agent. The SessionAgent Durable Object opens an outbound WebSocket directly to the ElevenLabs Realtime Speech-to-Text API (`scribe_v2_realtime` model, PCM 16kHz audio format). As the dentist speaks, partial and committed transcripts are streamed back and broadcast to all connected clients. Committed transcripts are then passed to Workers AI for dental NLU parsing.

This mode gives the dentist direct control: every utterance is treated as a charting command with no agent reasoning layer in between. It is better suited to experienced users who know the command vocabulary.

### 3. TTS Streaming

ElevenLabs Text-to-Speech is used independently of the Conversational AI for all voice feedback:

- **Command confirmations**: After a voice command is processed in scribe mode, the SessionAgent streams audio of the confirmation message and sends it to the frontend as a base64 data URI for immediate playback.
- **Session summaries**: When the dentist requests a summary, the system narrates all findings: *"18 teeth have findings. Tooth 18: caries on the occlusal surface. Tooth 36: composite on mesial, occlusal, and distal..."*
- **Patient RAG responses**: Answers to questions about patient history in the PatientChat component are spoken aloud.

---

## Voice Pipeline in Detail

The end-to-end voice pipeline from speech to chart update:

```
Dentist speaks into microphone
    |
    v
[ElevenLabs Conversational AI / Realtime STT]
    |  WebSocket stream of transcripts
    v
[Cloudflare Worker API]
    |
    v
[Workers AI -- NLU Engine]
    |  LLM parses transcript with a 260-line dental system prompt
    |  Handles: STT corrections ("carries" -> "caries", "buckle" -> "vestibular")
    |  Parses: tooth numbers, surfaces (MOD, OV, etc.), conditions, actions
    |  Output: DentalCommand[] array
    v
[SessionAgent Durable Object]
    |  Applies commands to in-memory ToothState[] array
    |  Pushes previous state to undo stack
    |  Debounced persist to D1 (5s timer)
    v
[WebSocket broadcast to all connected clients]
    |
    v
[SVG Odontogram re-renders with new state]
    |
    v
[ElevenLabs TTS confirms: "Tooth 18, caries occlusal, registered."]
```

### NLU System Prompt

The Workers AI system prompt (`dental-ai.ts`) is a 260+ line instruction set that includes:

- Full ISO 3950 (FDI) tooth numbering reference.
- Surface notation rules: O (occlusal), M (mesial), D (distal), V (vestibular), L (lingual).
- Compound surface parsing: "MOD" expands to mesial + occlusal + distal.
- Common STT error corrections: "carries/carry's" to caries, "buckle/buckol" to vestibular, "oh" to O (occlusal).
- Tooth number normalization: "eighteen" to 18, "two-one" to 21.
- Action classification: add, remove, correct, undo, query.
- Domain rules: "missing" clears all surfaces, implant and RCT are mutually exclusive.

Output format:
```json
[
  {
    "action": "add",
    "tooth": 18,
    "surfaces": ["O"],
    "surfaceCondition": "caries",
    "labels": [],
    "raw": "tooth 18 caries on the occlusal"
  }
]
```

### Undo and Correction

The system supports voice-driven corrections:

- **"Undo"** / **"Cancel last"**: Pops the undo stack and reverts the last tooth change.
- **"Correct: it was distal, not mesial"**: The NLU engine generates a `correct` action that removes the wrong entry and applies the right one.
- Both produce spoken confirmations via TTS.

---

## Dental Domain Model

### Tooth Numbering (ISO 3950 / FDI)

Aural uses the international FDI two-digit notation:

```
Upper Right: 18 17 16 15 14 13 12 11  |  Upper Left: 21 22 23 24 25 26 27 28
Lower Right: 48 47 46 45 44 43 42 41  |  Lower Left: 31 32 33 34 35 36 37 38
```

### Surfaces (5 per tooth)

| Code | Name | Position |
|------|------|----------|
| O | Occlusal | Chewing surface (center) |
| M | Mesial | Toward midline |
| D | Distal | Away from midline |
| V | Vestibular | Facing cheek/lip |
| L | Lingual | Facing tongue/palate |

### Conditions

**Per-surface conditions** (applied to individual surfaces):
- Caries (red `#D4503A`)
- Composite restoration (blue `#5A96C8`)
- Amalgam restoration (gray `#7A7A7A`)
- Inlay (light steel `#88B4D0`)
- Onlay (medium steel `#6694B8`)

**Whole-tooth labels** (applied to entire tooth):
- Crown (amber `#E49545`)
- Bridge (warm orange `#D4884A`)
- Prosthesis (dark cedar `#8B6F5A`)
- Implant (deep sky `#4A86C2`)
- Root canal treatment (deep purple `#7A5A8C`)
- Missing (stone gray `#D8DDE5`, dashed outline with X marker)

**Mobility grades**: None, M1, M2, M3 (visualized as 1-3 curved lines below the tooth).

### Data Structures

```typescript
interface ToothState {
  number: number;                                    // FDI number (11-48)
  labels: ToothLabel[];                              // whole-tooth markers
  surfaces: Partial<Record<Surface, SurfaceCondition>>; // per-surface conditions
  mobility: Mobility;
  note?: string;
}

interface VoiceLogEntry {
  id: string;
  timestamp: string;   // elapsed time (MM:SS)
  transcript: string;  // original voice input
  parsed: string;      // human-readable interpretation
  type: "command" | "correction" | "confirmation";
}
```

---

## Frontend Deep Dive

### Pages

**Dashboard** (`src/pages/Dashboard.tsx`): The main landing page displaying a patient list with deterministic color-coded avatars, session statistics (total patients, sessions, active sessions), and a patient detail panel with session history. Patients can be created and sessions started, resumed, or viewed from here.

**VoiceSession** (`src/pages/VoiceSession.tsx`): The primary clinical interface. Layout includes:
- Top bar with patient info, session timer, and controls.
- Interactive SVG odontogram on the left.
- Condition legend, voice log transcript, and tooth detail panel on the right.
- Voice mode toggle (agent vs. scribe).
- Clicking a tooth opens a detail panel for manual editing of surfaces, labels, and mobility.
- Voice commands are processed through the SessionAgent and reflected on the odontogram in real time.
- Summary button triggers a full spoken narrative of all findings.

**SessionViewer** (`src/pages/SessionViewer.tsx`): Read-only view of completed sessions with the same odontogram visualization and full voice log history.

### Components

**Odontogram** (`src/components/Odontogram.tsx`): A fully custom SVG component rendering 32 teeth in the standard FDI dental arch layout. Each tooth is drawn as a circle divided into 5 clickable surface regions (4 outer quadrants + 1 inner circle). Surfaces are color-coded by condition. Special SVG markers overlay for crowns (ring), implants (screw), root canals (cross), and missing teeth (dashed outline). Selected teeth are highlighted. Supports click interaction for manual charting.

**ConvAIVoicePanel** (`src/components/ConvAIVoicePanel.tsx`): Wraps the ElevenLabs `@elevenlabs/react` SDK. Manages the WebSocket lifecycle to the Conversational AI agent, displays a running transcript of user and agent messages, captures full session audio via MediaRecorder (with echo cancellation disabled to capture agent audio too), and uploads recordings to R2 on disconnect.

**PatientChat** (`src/components/PatientChat.tsx`): A RAG-powered chat interface for asking questions about patient history. Supports both text and voice input. Queries are answered using Workers AI with full patient context (current findings + historical sessions) and responses are spoken aloud via TTS.

### Hooks

**useSession** (`src/hooks/useSession.ts`): Connects to the SessionAgent Durable Object via WebSocket using `AgentClient`. Initializes the session on connect, subscribes to state updates, and exposes RPC methods: `updateTooth`, `processVoice`, `appendVoiceLog`, `undo`, `speak`, `generateSummary`, `completeSession`.

**useConversationalAI** (`src/hooks/useConversationalAI.ts`): Tracks ElevenLabs agent connection state, accumulates transcripts, manages voice log entries, and provides tool callbacks (`onToolUpdateTooth`, `onToolUndo`) that bridge ElevenLabs agent tool calls to the SessionAgent DO.

---

## Backend Deep Dive

### Worker (src/server.ts)

The Worker acts as a pure orchestrator:
1. Parses the request URL and method.
2. For `/api/*` routes, queries D1 directly and returns JSON responses.
3. For `/agents/*` routes, delegates to `routeAgentRequest` which routes to the appropriate Durable Object.
4. CORS headers are applied to all responses.
5. The signed URL endpoint for ElevenLabs keeps the API key server-side.
6. Audio upload/download routes interact with R2 for session recordings.

### SessionAgent (src/agents/session.ts)

The Durable Object lifecycle:

1. **Initialization**: `initSession(sessionId, patientId, patientName)` creates the empty 32-tooth state array.
2. **Voice processing**: `processVoiceCommand(transcript)` sends the transcript to Workers AI, receives structured commands, applies them to state, pushes to undo stack, and returns a confirmation string.
3. **Manual editing**: `updateTooth(toothNumber, changes)` applies click-based edits from the UI.
4. **Undo**: Pops the undo stack, reverts the tooth to its previous state, returns confirmation.
5. **TTS**: `speak(text)` calls ElevenLabs TTS SDK, returns an MP3 data URI for browser playback.
6. **STT streaming**: `startTranscription()` opens an outbound WebSocket to ElevenLabs Realtime STT and forwards transcripts to connected clients.
7. **Completion**: `completeSession()` generates a summary, persists final state to D1, and closes connections.

All state mutations trigger `setState()` which broadcasts to connected WebSocket clients via the `agents` framework.

---

## AI Processing Layer

### Command Parsing (dental-ai.ts)

Converts free-form dental speech into structured commands. The 260-line system prompt ensures high accuracy by:
- Mapping common speech recognition errors to correct dental terms.
- Supporting natural language ("upper right third molar has caries" maps to tooth 18).
- Handling compound surface notation ("MOD" = mesial + occlusal + distal).
- Classifying actions (add, remove, correct, undo, query).

Uses a three-tier model fallback: Workers AI (kimi-k2.5) -> Workers AI (nemotron-3-120b-a12b) -> Google Gemini.

### Report Generation (report-ai.ts)

Produces Markdown clinical reports organized by:
- **Clinical Findings**: Narrative organized by quadrant (upper right, upper left, lower left, lower right) detailing each tooth with findings.
- **Summary**: Overall oral health status, finding count, common conditions, areas of concern.
- **Treatment Plan**: Grouped by urgency (immediate, short-term, long-term).

Temperature set to 0.3 for factual accuracy. Only reports what exists in the data, never invents findings.

### Patient RAG (patient-rag.ts)

Answers questions about patient history by building a context document from:
- Current session findings (live odontogram state).
- Historical sessions (dates, summaries, teeth data, voice logs limited to 15 entries per session).

Instructed to answer only based on provided data, be concise (answers are spoken aloud), and use ISO 3950 terminology.

---

## Database Schema

```sql
CREATE TABLE patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date_of_birth TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  summary TEXT,
  teeth_data TEXT,   -- JSON-serialized ToothState[] array
  voice_log TEXT,    -- JSON-serialized VoiceLogEntry[] array
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_sessions_patient ON sessions(patient_id);
```

`teeth_data` and `voice_log` are stored as JSON text blobs in D1, parsed on read. This keeps the schema simple while allowing the full odontogram and command history to travel as a single atomic unit.

---

## Project Structure

```
dentalapp/
  wrangler.jsonc              # Cloudflare bindings: AI, D1, KV, R2, Durable Objects
  schema.sql                  # D1 database schema
  vite.config.ts              # Vite + Cloudflare plugin + Tailwind
  package.json                # Dependencies and scripts
  index.html                  # SPA entry point
  scripts/
    update-agent.mjs          # ElevenLabs agent configuration updater
  src/
    server.ts                 # Cloudflare Worker entry point (API routes)
    App.tsx                   # React root with page routing
    main.tsx                  # React DOM mount
    agents/
      session.ts              # SessionAgent Durable Object (core stateful logic)
    components/
      Odontogram.tsx          # Interactive 32-tooth SVG dental chart
      ConvAIVoicePanel.tsx    # ElevenLabs Conversational AI wrapper
      PatientChat.tsx         # RAG-powered patient Q&A chat
    data/
      dental.ts               # Dental domain constants (FDI numbers, conditions, colors)
      types.ts                 # Shared TypeScript interfaces (Patient, Session)
    hooks/
      useSession.ts           # WebSocket connection to SessionAgent DO
      useConversationalAI.ts  # ElevenLabs agent state tracking
    lib/
      dental-ai.ts            # Workers AI NLU for voice command parsing
      elevenlabs.ts           # ElevenLabs SDK factory + stream helpers
      patient-rag.ts          # Patient history RAG with Workers AI
      report-ai.ts            # Clinical report generation with Workers AI
    pages/
      Dashboard.tsx           # Patient management and session history
      VoiceSession.tsx        # Live voice-controlled charting interface
      SessionViewer.tsx       # Read-only historical session viewer
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- A Cloudflare account with Workers, D1, KV, R2 enabled
- An ElevenLabs account with API access (Conversational AI + TTS)

### Installation

```bash
git clone <repository-url>
cd dentalapp
npm install
```

### Configure Environment

Create a `.dev.vars` file in the project root:

```
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=your_elevenlabs_agent_id
GOOGLE_AI_API_KEY=your_google_ai_api_key
```

### Initialize the Database

```bash
npm run db:init
```

This runs `schema.sql` against the local D1 instance.

### Run Locally

```bash
npm run dev
```

Vite starts the dev server with the Cloudflare plugin, providing local Workers, D1, KV, R2, and Durable Object emulation.

### Deploy

```bash
npm run deploy
```

Builds the React SPA and deploys both the Worker and static assets to Cloudflare.

---

## Environment Variables

| Variable | Description |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs API key for TTS and Conversational AI signed URLs |
| `ELEVENLABS_AGENT_ID` | ElevenLabs Conversational AI agent identifier |
| `GOOGLE_AI_API_KEY` | Google Gemini API key (fallback for Workers AI) |

These are configured as secrets in `wrangler.jsonc` and should be set via `wrangler secret put` for production.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4 |
| Backend | Cloudflare Workers, Durable Objects (SQLite) |
| Database | Cloudflare D1 (SQLite) |
| AI/NLU | Cloudflare Workers AI (Kimi K2.5, Nemotron), Google Gemini (fallback) |
| Voice STT | ElevenLabs Conversational AI 2.0, ElevenLabs Realtime STT (Scribe v2) |
| Voice TTS | ElevenLabs Text-to-Speech Streaming |
| Storage | Cloudflare R2 (audio, reports), Cloudflare KV (cache) |
| Agent Framework | `agents` (Cloudflare Durable Object agent framework) |
| Hosting | Cloudflare Pages |
| Validation | Zod |
| Icons | Lucide React |
