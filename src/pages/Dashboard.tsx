import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  ArrowUpRight,
  Search,
  Plus,
  Clock,
  X,
  User,
  Loader2,
  Users,
  Radio,
  Zap,
  Monitor,
  FileText,
  MessageCircle,
  ChevronRight,
  CalendarDays,
  Activity,
} from "lucide-react";
import {
  type Patient,
  type Session,
  getInitials,
  getPatientHue,
} from "../data/types";

/* ------------------------------------------------------------------ */
/*  Deterministic waveform                                             */
/* ------------------------------------------------------------------ */
const WAVE_BARS = 28;
const waveHeights = Array.from({ length: WAVE_BARS }, (_, i) => {
  const center = WAVE_BARS / 2;
  const dist = Math.abs(i - center) / center;
  return 40 * (1 - dist * 0.55);
});
const waveDurations = Array.from(
  { length: WAVE_BARS },
  (_, i) => 0.7 + ((i * 7 + 3) % 11) * 0.045,
);

/* ------------------------------------------------------------------ */
/*  Custom logo: tooth silhouette with sound waves                     */
/* ------------------------------------------------------------------ */
function VocalChartLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 44 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <rect width="44" height="40" rx="12" fill="#161A22" />
      {/* Tooth silhouette — shifted left */}
      <path
        d="M13 12C11 12 9.5 13.8 9.5 16c0 2 .8 3.5 1.5 5.5.7 2 1 4 1.5 6.5.3 1.5 1 2 1.8 2s1.2-.8 1.5-2c.4-1.5.6-2.5 1.2-2.5s.8 1 1.2 2.5c.3 1.2.7 2 1.5 2s1.5-.5 1.8-2c.5-2.5.8-4.5 1.5-6.5.7-2 1.5-3.5 1.5-5.5 0-2.2-1.5-4-3.5-4-.8 0-1.5.3-2 .8-.5-.5-1.2-.8-2-.8z"
        fill="#E49545"
        opacity="0.9"
      />
      {/* Sound waves — spaced right with gap from tooth */}
      <path
        d="M28 16c1 1 1.6 2.5 1.6 4s-.6 3-1.6 4"
        stroke="#E49545"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M31.5 13.5c1.8 1.8 2.8 4.2 2.8 6.7s-1 4.9-2.8 6.7"
        stroke="#E49545"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M35 11c2.5 2.5 3.8 5.7 3.8 9.2S37.5 27 35 29.5"
        stroke="#E49545"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.25"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard stats type                                               */
/* ------------------------------------------------------------------ */
interface DashboardStats {
  totalPatients: number;
  totalSessions: number;
  activeSessions: number;
  recentSessions: {
    id: string;
    patient_id: string;
    status: string;
    summary: string | null;
    created_at: string;
    completed_at: string | null;
    patient_name: string | null;
  }[];
}

/* ------------------------------------------------------------------ */
/*  Avatar gradient map                                                */
/* ------------------------------------------------------------------ */
const hueMap: Record<string, string> = {
  "from-clay-400 to-clay-600": "bg-gradient-to-br from-clay-400 to-clay-600",
  "from-saffron-400 to-saffron-600":
    "bg-gradient-to-br from-saffron-400 to-saffron-600",
  "from-voice-400 to-voice-600":
    "bg-gradient-to-br from-voice-400 to-voice-600",
  "from-sand-600 to-sand-800": "bg-gradient-to-br from-sand-600 to-sand-800",
  "from-sand-900 to-sand-800": "bg-gradient-to-br from-sand-900 to-sand-800",
};

/* ------------------------------------------------------------------ */
/*  Patient Card                                                       */
/* ------------------------------------------------------------------ */
function PatientCard({
  patient,
  selected,
  onSelect,
}: {
  patient: Patient;
  selected: boolean;
  onSelect: () => void;
}) {
  const bg = hueMap[getPatientHue(patient.id)] ?? "bg-sand-700";
  const avatar = getInitials(patient.name);

  return (
    <button
      onClick={onSelect}
      className={`relative group flex w-full items-center gap-4 rounded-[20px] p-5 text-left transition-all duration-300 outline-none overflow-hidden ${
        selected
          ? "glass-card-solid ring-1 ring-saffron-200/40 shadow-[0_0_24px_-6px_rgba(228,149,69,0.18),0_1px_3px_rgba(0,0,0,0.04)]"
          : "glass-card hover:bg-white/80 hover:-translate-y-0.5 glow-card"
      }`}
    >
      {/* Top accent strip when selected */}
      {selected && (
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-saffron-300 via-saffron-400 to-saffron-300" />
      )}

      <div className="relative">
        <div
          className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl text-[13px] font-bold tracking-wider text-white ring-2 ring-white/80 shadow-sm ${bg}`}
        >
          {avatar}
        </div>
        {selected && (
          <div className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-saffron-400 border-2 border-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-sand-900 truncate font-display tracking-tight">
          {patient.name}
        </p>
        <div className="mt-1.5 flex items-center gap-2.5 flex-wrap">
          {patient.date_of_birth && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-sand-100/80 px-2 py-0.5 text-[11px] font-medium text-sand-500">
              <CalendarDays className="h-3 w-3 text-sand-400" />
              {patient.date_of_birth}
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-[11px] text-sand-400">
            <Activity className="h-3 w-3" />
            {new Date(patient.created_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>

      {/* Hover arrow */}
      <ChevronRight className={`h-4 w-4 shrink-0 transition-all duration-300 ${
        selected ? "text-saffron-400" : "text-sand-300 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"
      }`} />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Session row (for patient detail panel)                             */
/* ------------------------------------------------------------------ */
function SessionRow({ session, onView, onResume }: { session: Session; onView: (id: string) => void; onResume: (id: string) => void }) {
  const isActive = session.status === "active";
  const dateStr = new Date(session.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <button
      onClick={() => isActive ? onResume(session.id) : onView(session.id)}
      className="flex items-center gap-3 py-3 w-full text-left transition-colors hover:bg-sand-100/60 px-4 rounded-none first:rounded-t-[14px] last:rounded-b-[14px]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand-200/60 text-[11px] font-bold text-sand-600 font-display">
        <Clock className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-sand-700">
          {dateStr}
        </p>
        {session.summary && (
          <p className="text-[11px] text-sand-400 truncate">{session.summary}</p>
        )}
      </div>
      {isActive ? (
        <span className="flex items-center gap-1.5 rounded-full bg-voice-50 border border-voice-200 px-2.5 py-0.5 text-[11px] font-semibold text-voice-600">
          <span className="h-1.5 w-1.5 rounded-full bg-voice-400 animate-pulse" />
          Live
        </span>
      ) : (
        <span className="rounded-full bg-sand-100 px-2.5 py-0.5 text-[11px] font-medium text-sand-500">
          Done
        </span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Patient detail panel                                               */
/* ------------------------------------------------------------------ */
function PatientDetail({
  patient,
  sessions,
  onStartSession,
  onViewSession,
  onResumeSession,
  onClose,
}: {
  patient: Patient;
  sessions: Session[];
  onStartSession: () => void;
  onViewSession: (id: string) => void;
  onResumeSession: (id: string) => void;
  onClose: () => void;
}) {
  const bg = hueMap[getPatientHue(patient.id)] ?? "bg-sand-700";
  const avatar = getInitials(patient.name);

  return (
    <div className="rounded-[22px] glass-card-solid glow-card overflow-hidden">
      {/* Accent strip */}
      <div className="h-[3px] bg-gradient-to-r from-saffron-300 via-saffron-400 to-saffron-300" />

      <div className="flex flex-col sm:flex-row gap-6 p-6">
        {/* Patient info + CTA */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] text-[14px] font-bold tracking-wider text-white ring-2 ring-white/80 shadow-sm ${bg}`}
              >
                {avatar}
              </div>
              <div>
                <h3 className="text-[20px] font-extrabold font-display text-sand-900 tracking-tight">
                  {patient.name}
                </h3>
                <div className="mt-1 flex items-center gap-3 text-[12px] text-sand-500">
                  {patient.date_of_birth && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {patient.date_of_birth}
                    </span>
                  )}
                  <span className="text-sand-400">
                    Added{" "}
                    {new Date(patient.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-sand-400 hover:bg-sand-100 hover:text-sand-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center rounded-lg bg-sand-100 px-2.5 py-1 text-[11px] font-medium text-sand-500">
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
            </span>
            {patient.notes && (
              <span className="inline-flex items-center rounded-lg bg-saffron-50 border border-saffron-200/60 px-2.5 py-1 text-[11px] font-semibold text-saffron-600 truncate max-w-xs">
                {patient.notes}
              </span>
            )}
          </div>

          {/* Start session CTA */}
          <button
            onClick={onStartSession}
            className="group mt-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-sand-900 to-sand-800 px-7 py-3.5 text-[14px] font-bold text-white glow-dark transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_30px_-8px_rgba(22,26,34,0.3)] active:translate-y-0"
          >
            <Mic className="h-4 w-4 text-saffron-300" />
            Start voice session
            <ArrowUpRight className="h-4 w-4 text-sand-400 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        </div>

        {/* Past sessions */}
        <div className="w-full sm:w-[280px] shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <Clock className="h-3.5 w-3.5 text-sand-400" />
            <h4 className="text-[12px] font-bold font-display text-sand-600 tracking-tight">
              Session history
            </h4>
          </div>
          {sessions.length > 0 ? (
            <div className="divide-y divide-sand-200/60 rounded-[14px] border border-sand-200/80 bg-sand-50/50 overflow-hidden">
              {sessions.map((s) => (
                <SessionRow key={s.id} session={s} onView={onViewSession} onResume={onResumeSession} />
              ))}
            </div>
          ) : (
            <div className="rounded-[14px] border border-sand-200/80 bg-sand-50/50 px-4 py-6 text-center">
              <p className="text-[12px] text-sand-400">No sessions yet</p>
              <p className="text-[11px] text-sand-300 mt-0.5">
                Start one to begin charting
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  New patient form (inline)                                          */
/* ------------------------------------------------------------------ */
function NewPatientForm({
  onAdd,
  onCancel,
}: {
  onAdd: (patient: Patient) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const resp = await fetch("/api/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          date_of_birth: dob || undefined,
        }),
      });
      if (!resp.ok) throw new Error("Failed to create patient");
      const data = (await resp.json()) as { id: string; name: string };
      const patient: Patient = {
        id: data.id,
        name: data.name,
        date_of_birth: dob || null,
        notes: null,
        created_at: new Date().toISOString(),
      };
      onAdd(patient);
    } catch (err) {
      console.error("Failed to create patient:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[22px] glass-card-solid glow-card overflow-hidden">
      <div className="h-[3px] bg-gradient-to-r from-sand-300 via-sand-400 to-sand-300" />
      <div className="flex items-start justify-between mb-5 p-6 pb-0">
        <h3 className="text-[18px] font-extrabold font-display text-sand-900 tracking-tight">
          New patient
        </h3>
        <button
          onClick={onCancel}
          className="rounded-lg p-1.5 text-sand-400 hover:bg-sand-100 hover:text-sand-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap px-6 pb-6">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[11px] font-medium text-sand-500 uppercase tracking-wider mb-1.5">
            Full name
          </label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Maria Gonzalez"
            className="w-full rounded-xl border border-sand-200/80 bg-white/80 py-2.5 px-3.5 text-[14px] text-sand-800 placeholder:text-sand-300 outline-none input-premium"
          />
        </div>
        <div className="w-36">
          <label className="block text-[11px] font-medium text-sand-500 uppercase tracking-wider mb-1.5">
            Date of birth
          </label>
          <input
            type="date"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
            className="w-full rounded-xl border border-sand-200/80 bg-white/80 py-2.5 px-3.5 text-[14px] text-sand-800 placeholder:text-sand-300 outline-none input-premium"
          />
        </div>
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="rounded-xl bg-sand-900 px-5 py-2.5 text-[13px] font-bold text-white transition-all hover:bg-sand-800 disabled:bg-sand-200 disabled:text-sand-400 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Add patient"}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                          */
/* ------------------------------------------------------------------ */
interface DashboardProps {
  onStartSession: (patient: Patient) => void;
  onViewSession: (sessionId: string) => void;
  onResumeSession: (patient: Patient, sessionId: string) => void;
}

export default function Dashboard({ onStartSession, onViewSession, onResumeSession }: DashboardProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [patientSessions, setPatientSessions] = useState<Session[]>([]);
  const [showNewPatient, setShowNewPatient] = useState(false);
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);

  // Fetch patients + dashboard stats on mount
  useEffect(() => {
    Promise.all([
      fetch("/api/patients")
        .then((r) => r.json())
        .then((data) => setPatients(data as Patient[])),
      fetch("/api/dashboard")
        .then((r) => r.json())
        .then((data) => setStats(data as DashboardStats)),
    ])
      .catch((err) => console.error("Failed to load dashboard:", err))
      .finally(() => setLoading(false));
  }, []);

  // Fetch sessions when a patient is selected
  const fetchSessions = useCallback(async (patientId: string) => {
    try {
      const resp = await fetch(`/api/patients/${patientId}/sessions`);
      if (resp.ok) {
        const data = (await resp.json()) as Session[];
        setPatientSessions(data);
      }
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }, []);

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedData = patients.find((p) => p.id === selectedPatient) ?? null;

  // Find active sessions from stats
  const activeSessions = stats?.recentSessions.filter(
    (s) => s.status === "active",
  ) ?? [];

  function handleSelectPatient(id: string) {
    setShowNewPatient(false);
    if (selectedPatient === id) {
      setSelectedPatient(null);
      setPatientSessions([]);
    } else {
      setSelectedPatient(id);
      fetchSessions(id);
    }
  }

  function handleNewPatient() {
    setSelectedPatient(null);
    setPatientSessions([]);
    setShowNewPatient(true);
  }

  function handleAddPatient(patient: Patient) {
    setPatients((prev) => [patient, ...prev]);
    setShowNewPatient(false);
    setSelectedPatient(patient.id);
    setPatientSessions([]);
  }

  return (
    <div className="grain page-bg min-h-screen">
      {/* ---- Nav ---- */}
      <header className="sticky top-0 z-30 glass-card-solid glass-blur border-b border-sand-200/40">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between px-6 lg:px-8 py-3.5">
          <div className="flex items-center gap-3.5">
            <VocalChartLogo />
            <div>
              <span className="text-[22px] tracking-tight font-display">
                <span className="font-extrabold text-sand-900">Au</span><span className="font-extrabold text-saffron-500">ral</span>
              </span>
              <p className="text-[10px] text-sand-400 tracking-[0.18em] uppercase font-medium -mt-0.5">
                Voice-first dental charting
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {activeSessions.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full bg-voice-50/80 border border-voice-200/60 px-3.5 py-1.5 text-[11px] font-semibold text-voice-600 glow-voice">
                <span className="h-1.5 w-1.5 rounded-full bg-voice-400 animate-pulse" />
                {activeSessions.length} active
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1080px] px-6 lg:px-8 pb-20">
        {/* ---- Active Session Banner ---- */}
        {activeSessions.length > 0 && (
          <section className="mt-6">
            {activeSessions.map((s) => {
              const patient = patients.find((p) => p.id === s.patient_id);
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    if (patient) onResumeSession(patient, s.id);
                  }}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-voice-200/60 bg-voice-50/80 px-6 py-4 mb-3 text-left transition-all duration-300 hover:bg-voice-100/80 glow-voice"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-voice-200/60">
                    <Radio className="h-4 w-4 text-voice-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-voice-700 font-display">
                      Active session{s.patient_name ? ` with ${s.patient_name}` : ""}
                    </p>
                    <p className="text-[11px] text-voice-500 mt-0.5">
                      Started {new Date(s.created_at).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}
                      {s.summary ? ` — ${s.summary}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-voice-600">
                    Resume
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                </button>
              );
            })}
          </section>
        )}

        {/* ---- Hero ---- */}
        <section className="relative mt-6 overflow-hidden rounded-[28px] bg-sand-950 px-10 py-14 sm:px-14 sm:py-18 glow-dark">
          {/* Gradient mesh */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-saffron-400/15 blur-[120px]" />
            <div className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-clay-400/10 blur-[100px]" />
            <div className="absolute top-1/2 left-1/3 h-56 w-56 rounded-full bg-voice-400/8 blur-[90px]" />
          </div>
          {/* Subtle grid overlay */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-10">
            <div className="max-w-lg">
              <div className="mb-6 inline-flex items-center gap-2.5 rounded-full bg-white/[0.06] border border-white/[0.08] px-4 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-saffron-400 animate-pulse" />
                <span className="text-[11px] font-semibold text-sand-300/80 tracking-[0.2em] uppercase">
                  Voice-first odontogram
                </span>
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight font-display text-white sm:text-[44px] sm:leading-[1.1]">
                Speak your findings.
                <br />
                <span className="bg-gradient-to-r from-saffron-300 via-saffron-400 to-saffron-300 bg-clip-text text-transparent">
                  Chart updates instantly.
                </span>
              </h1>

              <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-sand-400">
                Select a patient, start a voice session, and dictate conditions
                naturally. The odontogram fills itself.
              </p>
            </div>

            <div className="flex items-end justify-center gap-[3px] h-20 shrink-0">
              {waveHeights.map((h, i) => (
                <div
                  key={i}
                  className="w-[3px] rounded-full"
                  style={{
                    height: `${h}px`,
                    background: `linear-gradient(to top, rgba(228,149,69,0.2), rgba(228,149,69,0.5))`,
                    animation: `waveform ${waveDurations[i]}s ease-in-out infinite`,
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        {/* ---- Features ---- */}
        <section className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 stagger-children">
          {[
            {
              icon: Mic,
              title: "Voice control",
              desc: "Hands-free charting powered by ElevenLabs Conversational AI.",
              iconBg: "bg-saffron-50 text-saffron-500",
              accent: "group-hover:shadow-[0_0_20px_-4px_rgba(228,149,69,0.15)]",
            },
            {
              icon: Zap,
              title: "Real-time AI",
              desc: "Workers AI parses teeth, surfaces & conditions on every utterance.",
              iconBg: "bg-voice-50 text-voice-500",
              accent: "group-hover:shadow-[0_0_20px_-4px_rgba(62,176,154,0.15)]",
            },
            {
              icon: Radio,
              title: "Audio feedback",
              desc: "ElevenLabs TTS confirms every action so you never look away from the patient.",
              iconBg: "bg-clay-50 text-clay-500",
              accent: "group-hover:shadow-[0_0_20px_-4px_rgba(179,120,134,0.15)]",
            },
            {
              icon: MessageCircle,
              title: "Ask history",
              desc: "Query any patient's full dental history with a voice-powered AI agent.",
              iconBg: "bg-saffron-50 text-saffron-600",
              accent: "group-hover:shadow-[0_0_20px_-4px_rgba(228,149,69,0.15)]",
            },
            {
              icon: Monitor,
              title: "Live sync",
              desc: "Chair-side and desk screens stay in sync via WebSocket in real time.",
              iconBg: "bg-voice-50 text-voice-600",
              accent: "group-hover:shadow-[0_0_20px_-4px_rgba(62,176,154,0.15)]",
            },
            {
              icon: FileText,
              title: "PDF reports",
              desc: "One-click AI clinical reports with the full odontogram included.",
              iconBg: "bg-sand-100 text-sand-600",
              accent: "group-hover:shadow-[0_0_20px_-4px_rgba(22,26,34,0.08)]",
            },
          ].map((feat) => (
            <div
              key={feat.title}
              className={`group rounded-2xl glass-card p-5 transition-all duration-300 hover:bg-white/80 hover:-translate-y-0.5 ${feat.accent}`}
            >
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${feat.iconBg} ring-1 ring-inset ring-sand-200/40`}>
                <feat.icon className="h-4 w-4" />
              </div>
              <h3 className="mt-3.5 text-[13px] font-bold font-display text-sand-900 tracking-tight">
                {feat.title}
              </h3>
              <p className="mt-1.5 text-[11px] leading-relaxed text-sand-500">
                {feat.desc}
              </p>
            </div>
          ))}
        </section>

        {/* ---- Patient Selection ---- */}
        <section className="mt-12">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h2 className="text-[22px] font-extrabold font-display text-sand-900 tracking-tight">
                  Patients
                </h2>
                {!loading && patients.length > 0 && (
                  <span className="inline-flex items-center justify-center h-6 min-w-[24px] rounded-full bg-sand-200/70 px-2 text-[11px] font-bold text-sand-600 font-display">
                    {patients.length}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[13px] text-sand-500">
                Select a patient to view history or start a session
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sand-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-48 rounded-xl border border-sand-200/80 bg-white/60 py-2.5 pl-9 pr-4 text-[13px] text-sand-800 placeholder:text-sand-400 outline-none input-premium"
                />
              </div>
              <button
                onClick={handleNewPatient}
                className="flex items-center gap-1.5 rounded-xl bg-sand-900 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-sand-800"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
            {loading ? (
              <div className="col-span-full flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-sand-400" />
              </div>
            ) : filtered.length > 0 ? (
              filtered.map((patient) => (
                <PatientCard
                  key={patient.id}
                  patient={patient}
                  selected={selectedPatient === patient.id}
                  onSelect={() => handleSelectPatient(patient.id)}
                />
              ))
            ) : patients.length === 0 ? (
              /* ---- Empty state illustration ---- */
              <div className="col-span-full flex flex-col items-center py-16 animate-fade-in-up">
                <div className="relative mb-6">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-sand-200/40 ring-1 ring-sand-200/60">
                    <Users className="h-9 w-9 text-sand-400" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-xl bg-saffron-100 border-2 border-white">
                    <Plus className="h-4 w-4 text-saffron-500" />
                  </div>
                </div>
                <h3 className="text-[16px] font-bold font-display text-sand-700 tracking-tight">
                  No patients yet
                </h3>
                <p className="mt-1 text-[13px] text-sand-400 max-w-xs text-center">
                  Add your first patient to start a voice-powered dental session.
                </p>
                <button
                  onClick={handleNewPatient}
                  className="mt-5 flex items-center gap-2 rounded-xl bg-gradient-to-r from-sand-900 to-sand-800 px-6 py-3 text-[13px] font-bold text-white transition-all duration-300 hover:-translate-y-0.5 glow-dark"
                >
                  <Plus className="h-4 w-4" />
                  Add first patient
                </button>
              </div>
            ) : (
              <p className="col-span-full py-12 text-center text-[14px] text-sand-400">
                No patients match your search.
              </p>
            )}
          </div>
        </section>

        {/* ---- Detail Panel (patient selected or new patient form) ---- */}
        {(selectedData || showNewPatient) && (
          <section className="mt-6">
            {showNewPatient ? (
              <NewPatientForm
                onAdd={handleAddPatient}
                onCancel={() => setShowNewPatient(false)}
              />
            ) : selectedData ? (
              <PatientDetail
                patient={selectedData}
                sessions={patientSessions}
                onStartSession={() => onStartSession(selectedData)}
                onViewSession={onViewSession}
                onResumeSession={(sessionId) => onResumeSession(selectedData, sessionId)}
                onClose={() => setSelectedPatient(null)}
              />
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}
