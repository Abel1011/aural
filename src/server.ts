import { routeAgentRequest } from "agents";
import { generateReport } from "./lib/report-ai";
import { askAboutPatient, type SessionRecord } from "./lib/patient-rag";
import { seedDemoData } from "./lib/demo-seed";
import { createClient, streamToDataUri } from "./lib/elevenlabs";
import type { ToothState, VoiceLogEntry } from "./data/dental";

export { SessionAgent } from "./agents/session";

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // API routes
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env, url);
    }

    // Agent WebSocket routes (handled by agents framework)
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) return agentResponse;

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

function inferAudioFileName(contentType: string): string {
  if (contentType.includes("wav")) return "recording.wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) {
    return "recording.mp3";
  }
  if (contentType.includes("ogg")) return "recording.ogg";
  if (contentType.includes("mp4") || contentType.includes("m4a")) {
    return "recording.m4a";
  }
  return "recording.webm";
}

async function transcribeWithElevenLabs(
  apiKey: string,
  audioData: ArrayBuffer,
  contentType: string,
): Promise<string | null> {
  const formData = new FormData();
  formData.append("model_id", "scribe_v2");
  formData.append("timestamps_granularity", "none");
  formData.append("tag_audio_events", "false");
  formData.append("file_format", "other");
  formData.append(
    "file",
    new Blob([audioData], { type: contentType }),
    inferAudioFileName(contentType),
  );

  const resp = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
    },
    body: formData,
  });

  if (!resp.ok) {
    const errorText = await resp.text();
    console.error("[transcribe] ElevenLabs Scribe error:", errorText);
    return null;
  }

  const data = (await resp.json()) as { text?: string };
  return data.text?.trim() ?? null;
}

let sessionNotesSchemaPromise: Promise<void> | null = null;

async function ensureSessionNotesColumn(env: Env): Promise<void> {
  if (!sessionNotesSchemaPromise) {
    sessionNotesSchemaPromise = (async () => {
      const columns = await env.DB.prepare("PRAGMA table_info(sessions)").all<{
        name: string;
      }>();
      const hasSessionNotes = (columns.results ?? []).some(
        (column) => column.name === "session_notes",
      );

      if (!hasSessionNotes) {
        await env.DB.prepare(
          "ALTER TABLE sessions ADD COLUMN session_notes TEXT",
        ).run();
      }
    })().catch((err) => {
      sessionNotesSchemaPromise = null;
      throw err;
    });
  }

  try {
    await sessionNotesSchemaPromise;
  } catch {
    // D1 may not be available in local dev; queries below will continue best-effort.
  }
}

async function handleApiRequest(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }

  try {
    await ensureSessionNotesColumn(env);
    await seedDemoData(env);

    // GET /api/dashboard — aggregated stats + recent sessions for the dashboard
    if (url.pathname === "/api/dashboard" && request.method === "GET") {
      const [patients, sessions, activeSessions, recentSessions] =
        await Promise.all([
          env.DB.prepare("SELECT COUNT(*) as count FROM patients").first<{
            count: number;
          }>(),
          env.DB.prepare("SELECT COUNT(*) as count FROM sessions").first<{
            count: number;
          }>(),
          env.DB.prepare(
            "SELECT COUNT(*) as count FROM sessions WHERE status = 'active'",
          ).first<{ count: number }>(),
          env.DB.prepare(
            "SELECT s.id, s.patient_id, s.status, s.summary, s.created_at, s.completed_at, p.name as patient_name FROM sessions s LEFT JOIN patients p ON s.patient_id = p.id ORDER BY s.created_at DESC LIMIT 5",
          ).all<{
            id: string;
            patient_id: string;
            status: string;
            summary: string | null;
            created_at: string;
            completed_at: string | null;
            patient_name: string | null;
          }>(),
        ]);
      return Response.json(
        {
          totalPatients: patients?.count ?? 0,
          totalSessions: sessions?.count ?? 0,
          activeSessions: activeSessions?.count ?? 0,
          recentSessions: recentSessions.results ?? [],
        },
        { headers: cors },
      );
    }

    // GET /api/patients — list all patients
    if (url.pathname === "/api/patients" && request.method === "GET") {
      const result = await env.DB.prepare(
        "SELECT * FROM patients ORDER BY created_at DESC",
      ).all();
      return Response.json(result.results, { headers: cors });
    }

    // POST /api/patients — create patient
    if (url.pathname === "/api/patients" && request.method === "POST") {
      const body = (await request.json()) as {
        name: string;
        date_of_birth?: string;
        notes?: string;
      };
      if (!body.name || typeof body.name !== "string") {
        return Response.json(
          { error: "name is required" },
          { status: 400, headers: cors },
        );
      }
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO patients (id, name, date_of_birth, notes) VALUES (?, ?, ?, ?)",
      )
        .bind(id, body.name, body.date_of_birth ?? null, body.notes ?? null)
        .run();
      return Response.json({ id, name: body.name }, { headers: cors });
    }

    // GET /api/patients/:id/sessions — list sessions for a patient
    const sessionsMatch = url.pathname.match(
      /^\/api\/patients\/([^/]+)\/sessions$/,
    );
    if (sessionsMatch && request.method === "GET") {
      const patientId = sessionsMatch[1];
      const result = await env.DB.prepare(
        "SELECT * FROM sessions WHERE patient_id = ? ORDER BY created_at DESC",
      )
        .bind(patientId)
        .all();
      return Response.json(result.results, { headers: cors });
    }

    // POST /api/patients/:id/sessions — create session
    const createSessionMatch = url.pathname.match(
      /^\/api\/patients\/([^/]+)\/sessions$/,
    );
    if (createSessionMatch && request.method === "POST") {
      const patientId = createSessionMatch[1];
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO sessions (id, patient_id, status) VALUES (?, ?, 'active')",
      )
        .bind(id, patientId)
        .run();
      return Response.json({ id, patient_id: patientId, status: "active" }, { headers: cors });
    }

    // POST /api/patients/:id/active-session — find or create an active session for a patient
    const activeSessionMatch = url.pathname.match(
      /^\/api\/patients\/([^/]+)\/active-session$/,
    );
    if (activeSessionMatch && request.method === "POST") {
      const patientId = activeSessionMatch[1];

      // Read patient name from body (optional)
      let patientName = patientId;
      try {
        const body = (await request.json()) as { name?: string };
        if (body.name) patientName = body.name;
      } catch { /* no body is fine */ }

      // Ensure patient exists in D1 (upsert)
      await env.DB.prepare(
        "INSERT OR IGNORE INTO patients (id, name) VALUES (?, ?)",
      )
        .bind(patientId, patientName)
        .run();

      // Check if there's already an active session — return it if so (idempotent)
      const existing = await env.DB.prepare(
        "SELECT id FROM sessions WHERE patient_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
      )
        .bind(patientId)
        .first<{ id: string }>();

      if (existing) {
        return Response.json({ id: existing.id, patient_id: patientId, status: "active" }, { headers: cors });
      }

      // Create a new session
      const id = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO sessions (id, patient_id, status) VALUES (?, ?, 'active')",
      )
        .bind(id, patientId)
        .run();
      return Response.json({ id, patient_id: patientId, status: "active" }, { headers: cors });
    }

    // GET /api/sessions/:id — get session details (including teeth data for completed sessions)
    const sessionDetailMatch = url.pathname.match(
      /^\/api\/sessions\/([^/]+)$/,
    );
    if (sessionDetailMatch && request.method === "GET") {
      const sessionId = sessionDetailMatch[1];
      const session = await env.DB.prepare(
        "SELECT s.*, p.name as patient_name FROM sessions s LEFT JOIN patients p ON s.patient_id = p.id WHERE s.id = ?",
      )
        .bind(sessionId)
        .first<{
          id: string;
          patient_id: string;
          status: string;
          summary: string | null;
          session_notes: string | null;
          teeth_data: string | null;
          voice_log: string | null;
          created_at: string;
          completed_at: string | null;
          patient_name: string | null;
        }>();
      if (!session) {
        return Response.json({ error: "Session not found" }, { status: 404, headers: cors });
      }
      return Response.json({
        ...session,
        teeth_data: session.teeth_data ? JSON.parse(session.teeth_data) : null,
        voice_log: session.voice_log ? JSON.parse(session.voice_log) : null,
      }, { headers: cors });
    }

    // PUT /api/sessions/:id/complete — mark session complete
    const completeMatch = url.pathname.match(
      /^\/api\/sessions\/([^/]+)\/complete$/,
    );
    if (completeMatch && request.method === "PUT") {
      const sessionId = completeMatch[1];
      await env.DB.prepare(
        "UPDATE sessions SET status = 'completed', completed_at = datetime('now') WHERE id = ?",
      )
        .bind(sessionId)
        .run();
      return Response.json({ id: sessionId, status: "completed" }, { headers: cors });
    }

    // GET /api/convai/signed-url — generate a signed URL for ElevenLabs Conversational AI
    if (url.pathname === "/api/convai/signed-url" && request.method === "GET") {
      const agentId = env.ELEVENLABS_AGENT_ID;
      if (!agentId) {
        return Response.json(
          { error: "ELEVENLABS_AGENT_ID not configured" },
          { status: 500, headers: cors },
        );
      }
      const resp = await fetch(
        `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`,
        {
          method: "GET",
          headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
        },
      );
      if (!resp.ok) {
        const text = await resp.text();
        return Response.json(
          { error: `ElevenLabs API error: ${text}` },
          { status: resp.status, headers: cors },
        );
      }
      const data = await resp.json() as { signed_url: string };
      return Response.json(data, { headers: cors });
    }

    // GET /api/convai/agent-id — return agent ID for public (no-auth) fallback
    if (url.pathname === "/api/convai/agent-id" && request.method === "GET") {
      const agentId = env.ELEVENLABS_AGENT_ID;
      if (!agentId) {
        return Response.json(
          { error: "ELEVENLABS_AGENT_ID not configured" },
          { status: 500, headers: cors },
        );
      }
      return Response.json({ agent_id: agentId }, { headers: cors });
    }

    // POST /api/sessions/:id/audio — upload audio recording to R2
    const audioUploadMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/audio$/);
    if (audioUploadMatch && request.method === "POST") {
      const sid = audioUploadMatch[1];
      const contentType = request.headers.get("Content-Type") ?? "audio/webm";
      const ext = contentType.includes("wav") ? "wav" : "webm";
      const body = await request.arrayBuffer();
      const timestamp = Date.now();
      const key = `audio/${sid}/${timestamp}.${ext}`;
      await env.REPORTS.put(key, body, {
        httpMetadata: { contentType },
        customMetadata: { sessionId: sid },
      });
      const audioUrl = `/api/audio/${encodeURIComponent(key)}`;
      return Response.json({ key, url: audioUrl }, { headers: cors });
    }

    // GET /api/sessions/:id/audio — list audio recordings for a session
    if (audioUploadMatch && request.method === "GET") {
      const sid = audioUploadMatch[1];
      const prefix = `audio/${sid}/`;
      const list = await env.REPORTS.list({ prefix });
      const recordings = list.objects.map((obj) => ({
        key: obj.key,
        url: `/api/audio/${encodeURIComponent(obj.key)}`,
        size: obj.size,
        uploaded: obj.uploaded.toISOString(),
      }));
      return Response.json({ recordings }, { headers: cors });
    }

    // GET /api/audio/:key — stream audio file from R2
    const audioServeMatch = url.pathname.match(/^\/api\/audio\/(.+)$/);
    if (audioServeMatch && request.method === "GET") {
      const key = decodeURIComponent(audioServeMatch[1]);
      const obj = await env.REPORTS.get(key);
      if (!obj) {
        return Response.json({ error: "Not found" }, { status: 404, headers: cors });
      }
      return new Response(obj.body, {
        headers: {
          ...cors,
          "Content-Type": obj.httpMetadata?.contentType ?? "audio/wav",
          "Content-Length": String(obj.size),
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // POST /api/patients/:id/ask — answer a question about a patient using their history (structured RAG)
    const askMatch = url.pathname.match(/^\/api\/patients\/([^/]+)\/ask$/);
    if (askMatch && request.method === "POST") {
      const patientId = askMatch[1];
      const body = (await request.json()) as {
        question: string;
        currentTeeth?: ToothState[];
        currentSessionNotes?: string;
      };

      if (!body.question || typeof body.question !== "string") {
        return Response.json({ error: "question is required" }, { status: 400, headers: cors });
      }

      // Fetch patient info
      const patient = await env.DB.prepare("SELECT name FROM patients WHERE id = ?")
        .bind(patientId)
        .first<{ name: string }>();
      const patientName = patient?.name ?? "Unknown";

      // Fetch all sessions for this patient
      const result = await env.DB.prepare(
        "SELECT id, status, summary, session_notes, teeth_data, voice_log, created_at, completed_at FROM sessions WHERE patient_id = ? ORDER BY created_at DESC",
      )
        .bind(patientId)
        .all<SessionRecord>();

      const sessions = result.results ?? [];

      const answer = await askAboutPatient(
        env.AI,
        body.question,
        patientName,
        sessions,
        body.currentTeeth,
        body.currentSessionNotes,
        env.GOOGLE_AI_API_KEY,
      );

      return Response.json({ answer }, { headers: cors });
    }

    // POST /api/sessions/:id/report — generate clinical report using LLM
    const reportMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/report$/);
    if (reportMatch && request.method === "POST") {
      const sid = reportMatch[1];

      // Check if report already exists in R2
      const existingReport = await env.REPORTS.get(`reports/${sid}.md`);
      if (existingReport) {
        const text = await existingReport.text();
        return Response.json({ report: text, cached: true }, { headers: cors });
      }

      // Fetch session data from D1
      const session = await env.DB.prepare(
        "SELECT s.*, p.name as patient_name FROM sessions s LEFT JOIN patients p ON s.patient_id = p.id WHERE s.id = ?",
      )
        .bind(sid)
        .first<{
          id: string;
          patient_id: string;
          status: string;
          summary: string | null;
          session_notes: string | null;
          teeth_data: string | null;
          voice_log: string | null;
          created_at: string;
          completed_at: string | null;
          patient_name: string | null;
        }>();

      if (!session) {
        return Response.json({ error: "Session not found" }, { status: 404, headers: cors });
      }

      const teeth: ToothState[] = session.teeth_data ? JSON.parse(session.teeth_data) : [];
      const voiceLog: VoiceLogEntry[] = session.voice_log ? JSON.parse(session.voice_log) : [];
      const patientName = session.patient_name ?? "Unknown";
      const sessionDate = new Date(session.created_at).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const report = await generateReport(
        env.AI,
        teeth,
        voiceLog,
        patientName,
        sessionDate,
        session.session_notes ?? undefined,
        env.GOOGLE_AI_API_KEY,
      );

      // Store report in R2 for caching
      await env.REPORTS.put(`reports/${sid}.md`, report, {
        httpMetadata: { contentType: "text/markdown" },
        customMetadata: { sessionId: sid },
      });

      return Response.json({ report, cached: false }, { headers: cors });
    }

    // GET /api/sessions/:id/report — retrieve cached report
    if (reportMatch && request.method === "GET") {
      const sid = reportMatch[1];
      const obj = await env.REPORTS.get(`reports/${sid}.md`);
      if (!obj) {
        return Response.json({ report: null }, { headers: cors });
      }
      const text = await obj.text();
      return Response.json({ report: text }, { headers: cors });
    }

    // GET /api/scribe-token — generate a single-use token for client-side STT
    if (url.pathname === "/api/scribe-token" && request.method === "GET") {
      const resp = await fetch(
        "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
        {
          method: "POST",
          headers: {
            "xi-api-key": env.ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
          },
        },
      );
      if (!resp.ok) {
        const text = await resp.text();
        return Response.json(
          { error: `ElevenLabs token error: ${text}` },
          { status: resp.status, headers: cors },
        );
      }
      const data = await resp.json();
      return Response.json(data, { headers: cors });
    }

    // POST /api/transcribe — Whisper STT via Cloudflare Workers AI
    if (url.pathname === "/api/transcribe" && request.method === "POST") {
      const audioData = await request.arrayBuffer();
      const contentType = request.headers.get("Content-Type") ?? "audio/webm";
      if (!audioData || audioData.byteLength === 0) {
        return Response.json({ error: "No audio data" }, { status: 400, headers: cors });
      }

      try {
        const result = await env.AI.run("@cf/openai/whisper" as Parameters<Ai["run"]>[0], {
          audio: [...new Uint8Array(audioData)],
        });
        const text = (result as { text?: string })?.text?.trim() ?? "";
        if (text) {
          return Response.json({ text, provider: "cloudflare-whisper" }, { headers: cors });
        }

        console.warn("[transcribe] Whisper returned empty text, trying ElevenLabs fallback");
      } catch (err) {
        console.error("[transcribe] Whisper error:", err);
      }

      const fallbackText = await transcribeWithElevenLabs(
        env.ELEVENLABS_API_KEY,
        audioData,
        contentType,
      );

      if (fallbackText) {
        return Response.json({ text: fallbackText, provider: "elevenlabs-scribe-v2" }, { headers: cors });
      }

      return Response.json(
        { error: "Transcription failed in both Whisper and ElevenLabs Scribe v2" },
        { status: 500, headers: cors },
      );
    }

    // POST /api/tts — ElevenLabs text-to-speech, returns audio data URI
    if (url.pathname === "/api/tts" && request.method === "POST") {
      const body = (await request.json()) as { text: string };
      if (!body.text || typeof body.text !== "string") {
        return Response.json({ error: "text is required" }, { status: 400, headers: cors });
      }

      try {
        const client = createClient(env.ELEVENLABS_API_KEY);
        const audioStream = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
          text: body.text,
          model_id: "eleven_turbo_v2_5",
          output_format: "mp3_44100_64",
        });
        const dataUri = await streamToDataUri(audioStream as unknown as ReadableStream);
        return Response.json({ audio: dataUri }, { headers: cors });
      } catch (err) {
        console.error("[tts] ElevenLabs error:", err);
        return Response.json({ error: "TTS failed" }, { status: 500, headers: cors });
      }
    }

    return Response.json(
      { error: "Not found" },
      { status: 404, headers: cors },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json(
      { error: message },
      { status: 500, headers: cors },
    );
  }
}
