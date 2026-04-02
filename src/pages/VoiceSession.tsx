import { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  AudioLines,
  ArrowLeft,
  X,
  FileText,
  Clock,
  Undo2,
  Loader2,
  CheckCircle2,
  Sparkles,
  Printer,
  History,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import { useScribe, CommitStrategy } from "@elevenlabs/react";
import { type Patient, type Session, getInitials } from "../data/types";
import {
  conditionColors,
  conditionLabels,
  hasToothFinding,
  labelConditions,
  surfaceConditions,
  type ToothState,
  type VoiceLogEntry,
  type Condition,
  type SurfaceCondition,
  type Surface,
  type Mobility,
  type ToothLabel,
} from "../data/dental";
import Odontogram from "../components/Odontogram";
import ConvAIVoicePanel from "../components/ConvAIVoicePanel";
import PatientChat from "../components/PatientChat";
import { useSession } from "../hooks/useSession";

type VoiceMode = "scribe" | "agent";

/* ------------------------------------------------------------------ */
/*  Deterministic waveform                                             */
/* ------------------------------------------------------------------ */
const BARS = 20;
const barHeights = Array.from(
  { length: BARS },
  (_, i) => 8 + 16 * Math.sin((i / BARS) * Math.PI),
);
const barDurations = Array.from(
  { length: BARS },
  (_, i) => 0.6 + ((i * 7 + 5) % 9) * 0.05,
);

/* ------------------------------------------------------------------ */
/*  Voice Log Entry                                                    */
/* ------------------------------------------------------------------ */
function LogEntry({ entry }: { entry: VoiceLogEntry }) {
  const isCorrection = entry.type === "correction";
  const isFailed = entry.parsed === "No changes parsed";
  return (
    <div className="flex gap-3 py-2.5">
      <span className="shrink-0 text-[11px] tabular-nums text-sand-400 pt-0.5 w-8">
        {entry.timestamp}
      </span>
      <p className={`flex-1 min-w-0 text-[13px] leading-relaxed ${
        isFailed ? "text-sand-400 italic" : isCorrection ? "text-clay-500" : "text-sand-700"
      }`}>
        {entry.parsed}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Condition legend                                                   */
/* ------------------------------------------------------------------ */
function LegendMarker({ item }: { item: Condition | "mobility" }) {
  if (item === "mobility") {
    return (
      <svg viewBox="0 0 18 14" className="h-3.5 w-[18px]">
        <path d="M 3 3 Q 9 6 15 3" fill="none" stroke="#D4503A" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M 2 6.5 Q 9 9.8 16 6.5" fill="none" stroke="#D4503A" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M 1 10 Q 9 13.5 17 10" fill="none" stroke="#D4503A" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    );
  }

  if (surfaceConditions.includes(item as SurfaceCondition)) {
    return (
      <span
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: conditionColors[item] }}
      />
    );
  }

  if (item === "crown") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke={conditionColors.crown} strokeWidth="1.6" />
      </svg>
    );
  }

  if (item === "bridge") {
    return (
      <svg viewBox="0 0 18 14" className="h-3.5 w-[18px]">
        <path d="M 2 5 Q 9 11 16 5" fill="none" stroke={conditionColors.bridge} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }

  if (item === "prosthesis") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4">
        <circle cx="8" cy="8" r="5.5" fill="none" stroke={conditionColors.prosthesis} strokeWidth="1.5" strokeDasharray="2.2 2" />
      </svg>
    );
  }

  if (item === "implant") {
    return (
      <svg viewBox="0 0 14 18" className="h-4 w-3.5">
        <path d="M7 1v11" fill="none" stroke="#3A6FA0" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M3 2.5h8" fill="none" stroke="#3A6FA0" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M3.5 5.2h7" fill="none" stroke="#3A6FA0" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M4 7.9h6" fill="none" stroke="#3A6FA0" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M4.5 10.6h5" fill="none" stroke="#3A6FA0" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M5 12.5 7 16l2-3.5" fill="none" stroke="#3A6FA0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (item === "rct") {
    return (
      <svg viewBox="0 0 12 16" className="h-4 w-3">
        <line x1="3" y1="2" x2="3" y2="14" stroke={conditionColors.rct} strokeWidth="1.5" strokeLinecap="round" />
        <line x1="6" y1="3.5" x2="6" y2="12.5" stroke="#E08A7A" strokeWidth="1" strokeLinecap="round" />
        <line x1="9" y1="2" x2="9" y2="14" stroke={conditionColors.rct} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  // missing
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4">
      <circle cx="8" cy="8" r="5.75" fill="#ECEFF3" fillOpacity="0.4" stroke="#8D97AA" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

function Legend() {
  const surfaceItems: SurfaceCondition[] = [
    "caries",
    "composite",
    "amalgam",
    "inlay",
    "onlay",
  ];
  const labelItems: Array<ToothLabel | "mobility"> = [
    "crown",
    "bridge",
    "prosthesis",
    "implant",
    "rct",
    "missing",
    "mobility",
  ];

  return (
    <div className="space-y-2">
      {/* Surface conditions + label markers */}
      <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-5 gap-y-1.5">
        {surfaceItems.map((item) => (
          <div key={item} className="flex items-center gap-1.5 sm:gap-2">
            <LegendMarker item={item} />
            <span className="text-[11px] sm:text-[12px] font-medium text-sand-600">
              {conditionLabels[item]}
            </span>
          </div>
        ))}
        <span className="h-4 w-px bg-sand-200 hidden sm:block" />
        {labelItems.map((item) => (
          <div key={item} className="flex items-center gap-1.5 sm:gap-2">
            <LegendMarker item={item} />
            <span className="text-[11px] sm:text-[12px] font-medium text-sand-600">
              {item === "mobility" ? "Mobility" : conditionLabels[item]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tooth detail panel (interactive)                                   */
/* ------------------------------------------------------------------ */
function ToothDetail({
  tooth,
  onClose,
  onUpdate,
}: {
  tooth: ToothState;
  onClose: () => void;
  onUpdate: (updated: ToothState) => void;
}) {
  const surfaces: Surface[] = ["M", "D", "V", "L", "O"];
  const mobilityOptions: Mobility[] = ["none", "M1", "M2", "M3"];
  const isMissing = tooth.labels.includes("missing");

  function toggleLabel(label: ToothLabel) {
    if (tooth.labels.includes(label)) {
      onUpdate({
        ...tooth,
        labels: tooth.labels.filter((item) => item !== label),
      });
      return;
    }

    if (label === "missing") {
      onUpdate({
        ...tooth,
        labels: ["missing"],
        surfaces: {},
        mobility: "none",
      });
      return;
    }

    let nextLabels = tooth.labels.filter((item) => item !== "missing");

    if (label === "implant") {
      nextLabels = nextLabels.filter((item) => item !== "rct");
    }

    if (label === "rct") {
      nextLabels = nextLabels.filter((item) => item !== "implant");
    }

    onUpdate({
      ...tooth,
      labels: [...nextLabels, label],
    });
  }

  function toggleSurface(surface: Surface, condition: SurfaceCondition) {
    if (isMissing) return;

    const next = { ...tooth, surfaces: { ...tooth.surfaces } };
    if (next.surfaces[surface] === condition) {
      delete next.surfaces[surface];
    } else {
      next.surfaces[surface] = condition;
    }
    onUpdate(next);
  }

  function setMobility(m: Mobility) {
    if (isMissing) return;
    onUpdate({ ...tooth, mobility: m });
  }

  function setNote(note: string) {
    onUpdate({ ...tooth, note: note || undefined });
  }

  return (
    <div className="rounded-2xl glass-card-solid glow-card p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 sm:mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sand-900 text-[11px] font-bold text-white font-display">
            {tooth.number}
          </div>
          <h3 className="text-[15px] sm:text-[16px] font-bold font-display text-sand-900">
            Tooth {tooth.number}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-sand-400 hover:bg-sand-100 hover:text-sand-600 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Labels — whole-tooth conditions */}
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2.5">
          Labels
        </p>
        <p className="mb-2.5 text-[11px] text-sand-400">
          Multiple labels can coexist. Only "Missing" is exclusive, and Implant cannot coexist with RCT.
        </p>
        <div className="flex flex-wrap gap-2">
          {labelConditions.map((c) => {
            const active = tooth.labels.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleLabel(c)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
                  active
                    ? "border-sand-900 bg-sand-900 text-white"
                    : "border-sand-200 bg-white text-sand-600 hover:border-sand-400"
                }`}
              >
                {conditionLabels[c]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Surfaces grid — per-surface conditions */}
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2.5">
          Surfaces
        </p>
        <div className={isMissing ? "opacity-35" : undefined}>
          {/* Column headers */}
          <div className="grid grid-cols-[32px_repeat(5,1fr)] gap-x-1 mb-1">
            <span />
            {surfaceConditions.map((c) => (
              <span
                key={c}
                className="text-[10px] font-medium text-sand-500 text-center"
              >
                {conditionLabels[c]}
              </span>
            ))}
          </div>
          {/* Rows per surface */}
          {surfaces.map((s) => (
            <div
              key={s}
              className="grid grid-cols-[32px_repeat(5,1fr)] gap-x-1 items-center py-1.5 border-t border-sand-100"
            >
              <span className="text-[12px] font-semibold text-sand-600">
                {s}:
              </span>
              {surfaceConditions.map((c) => {
                const checked = tooth.surfaces[s] === c;
                return (
                  <label key={c} className="flex justify-center cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={isMissing}
                      checked={checked}
                      onChange={() => toggleSurface(s, c)}
                      className="h-4 w-4 rounded border-sand-300 text-sand-900 focus:ring-saffron-400 accent-sand-900 cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mobility */}
      <div className="mb-5">
        <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2.5">
          Mobility
        </p>
        <div className={`flex gap-1.5 ${isMissing ? "opacity-35" : ""}`}>
          {mobilityOptions.map((m) => {
            const active = tooth.mobility === m;
            return (
              <button
                key={m}
                disabled={isMissing}
                onClick={() => setMobility(m)}
                className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
                  active
                    ? "border-sand-900 bg-sand-900 text-white"
                    : "border-sand-200 bg-white text-sand-600 hover:border-sand-400"
                }`}
              >
                {m === "none" ? "None" : m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2.5">
          Notes
        </p>
        <textarea
          value={tooth.note || ""}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="Add clinician notes..."
          rows={3}
          className="w-full rounded-lg border border-sand-200 bg-white px-3 py-2 text-[13px] text-sand-700 placeholder:text-sand-300 focus:outline-none focus:border-saffron-400 focus:ring-1 focus:ring-saffron-400/30 resize-none"
        />
        <p className="text-[10px] text-sand-400 text-right mt-1">
          {(tooth.note || "").length}/500
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Patient History Panel                                              */
/* ------------------------------------------------------------------ */
interface HistorySession extends Session {
  summary: string | null;
}

interface SessionDetail {
  id: string;
  patient_name: string | null;
  status: string;
  summary: string | null;
  session_notes: string | null;
  teeth_data: ToothState[] | null;
  voice_log: VoiceLogEntry[] | null;
  created_at: string;
  completed_at: string | null;
}

function SessionDetailModal({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalTooth, setModalTooth] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => r.ok ? r.json() as Promise<SessionDetail> : null)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  const teeth = data?.teeth_data ?? [];
  const voiceLog = data?.voice_log ?? [];
  const findingsCount = teeth.filter(hasToothFinding).length;
  const modalToothData = modalTooth ? teeth.find((t) => t.number === modalTooth) ?? null : null;

  const dateStr = data ? new Date(data.created_at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }) : "";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-sand-950/40 backdrop-blur-sm overflow-y-auto py-6 sm:py-10">
      <div className="w-full max-w-4xl mx-3 sm:mx-4 rounded-2xl glass-card-solid glow-dark overflow-hidden animate-fade-in-up">
        {/* Modal header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 bg-white border-b border-sand-200/60 px-4 sm:px-6 py-3">
          <History className="h-4 w-4 text-sand-400" />
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold font-display text-sand-900">Past Session</h3>
            {dateStr && <p className="text-[11px] text-sand-500">{dateStr}</p>}
          </div>
          <div className="flex items-center gap-2">
            {findingsCount > 0 && (
              <span className="rounded-lg bg-saffron-50 border border-saffron-200/60 px-2 py-1 text-[11px] font-semibold text-saffron-600 tabular-nums">
                {findingsCount} findings
              </span>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-sand-400 hover:bg-sand-100 hover:text-sand-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-saffron-500" />
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-[14px] text-sand-400">Failed to load session.</p>
          </div>
        ) : (
          <div className="p-4 sm:p-6 space-y-4">
            {/* Summary */}
            {data.summary && (
              <div className="rounded-xl border border-sand-200/80 bg-white p-4">
                <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2">Summary</p>
                <p className="text-[13px] text-sand-700 leading-relaxed">{data.summary}</p>
              </div>
            )}

            {data.session_notes && (
              <div className="rounded-xl border border-sand-200/80 bg-white p-4">
                <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2">Session notes</p>
                <p className="text-[13px] text-sand-700 leading-relaxed whitespace-pre-wrap">{data.session_notes}</p>
              </div>
            )}

            {/* Odontogram */}
            {teeth.length > 0 && (
              <div className="rounded-xl glass-card-solid overflow-hidden">
                <div className="px-4 sm:px-5 pt-4 pb-2">
                  <h4 className="text-[14px] font-bold font-display text-sand-900 mb-2">Odontogram</h4>
                </div>
                <div className="px-2 sm:px-4 pb-4 overflow-x-auto">
                  <div className="min-w-[600px]">
                    <Odontogram
                      teeth={teeth}
                      selectedTooth={modalTooth}
                      onSelectTooth={(n) => setModalTooth(modalTooth === n ? null : n)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Selected tooth detail (read-only) */}
            {modalToothData && hasToothFinding(modalToothData) && (
              <div className="rounded-xl border border-sand-200/80 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sand-900 text-[10px] font-bold text-white">
                      {modalToothData.number}
                    </span>
                    <span className="text-[14px] font-bold font-display text-sand-900">Tooth {modalToothData.number}</span>
                  </div>
                  <button onClick={() => setModalTooth(null)} className="rounded-lg p-1 text-sand-400 hover:bg-sand-100 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-4 text-[12px] text-sand-600">
                  {modalToothData.labels.length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-sand-400 uppercase block mb-1">Labels</span>
                      {modalToothData.labels.map((l) => conditionLabels[l]).join(", ")}
                    </div>
                  )}
                  {Object.keys(modalToothData.surfaces).length > 0 && (
                    <div>
                      <span className="text-[10px] font-semibold text-sand-400 uppercase block mb-1">Surfaces</span>
                      {Object.entries(modalToothData.surfaces).map(([s, c]) => `${conditionLabels[c]} (${s})`).join(", ")}
                    </div>
                  )}
                  {modalToothData.mobility !== "none" && (
                    <div>
                      <span className="text-[10px] font-semibold text-sand-400 uppercase block mb-1">Mobility</span>
                      {modalToothData.mobility}
                    </div>
                  )}
                  {modalToothData.note && (
                    <div>
                      <span className="text-[10px] font-semibold text-sand-400 uppercase block mb-1">Note</span>
                      {modalToothData.note}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Findings list */}
            {findingsCount > 0 && (
              <div className="rounded-xl glass-card-solid overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-sand-100">
                  <h4 className="text-[13px] font-bold font-display text-sand-700">All Findings</h4>
                </div>
                <div className="divide-y divide-sand-100 px-4 sm:px-5 max-h-[250px] overflow-y-auto">
                  {teeth.filter(hasToothFinding).map((t) => {
                    const parts: string[] = [];
                    for (const label of t.labels) parts.push(conditionLabels[label]);
                    for (const [surface, condition] of Object.entries(t.surfaces)) {
                      parts.push(`${conditionLabels[condition as Condition]} (${surface})`);
                    }
                    if (t.mobility !== "none") parts.push(`Mobility ${t.mobility}`);
                    return (
                      <button
                        key={t.number}
                        onClick={() => setModalTooth(modalTooth === t.number ? null : t.number)}
                        className={`flex items-center gap-3 py-2 w-full text-left transition-colors rounded-lg -mx-1 px-1 ${
                          modalTooth === t.number ? "bg-saffron-50/60" : "hover:bg-sand-50"
                        }`}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sand-100 text-[11px] font-bold text-sand-600 tabular-nums">
                          {t.number}
                        </span>
                        <p className="flex-1 min-w-0 text-[12px] text-sand-600 truncate">
                          {parts.join(", ")}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Voice log */}
            {voiceLog.length > 0 && (
              <div className="rounded-xl glass-card-solid overflow-hidden">
                <div className="px-4 sm:px-5 py-3 border-b border-sand-100">
                  <h4 className="text-[13px] font-bold font-display text-sand-700">Voice Log</h4>
                  <span className="text-[10px] text-sand-400">{voiceLog.length} entries</span>
                </div>
                <div className="divide-y divide-sand-100 px-4 sm:px-5 max-h-[200px] overflow-y-auto">
                  {voiceLog.map((entry) => (
                    <div key={entry.id} className="flex gap-3 py-2">
                      <span className="shrink-0 text-[10px] tabular-nums text-sand-400 pt-0.5 w-7">{entry.timestamp}</span>
                      <p className={`flex-1 min-w-0 text-[12px] leading-relaxed ${
                        entry.parsed === "No changes parsed" ? "text-sand-400 italic" : "text-sand-600"
                      }`}>{entry.parsed}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PatientHistoryPanel({
  patientId,
  patientName,
  currentSessionId,
  currentTeeth,
  currentSessionNotes,
}: {
  patientId: string;
  patientName: string;
  currentSessionId: string;
  currentTeeth: ToothState[];
  currentSessionNotes: string;
}) {
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [viewingSession, setViewingSession] = useState<string | null>(null);
  const [showSessions, setShowSessions] = useState(false);

  useEffect(() => {
    fetch(`/api/patients/${patientId}/sessions`)
      .then((r) => r.ok ? r.json() as Promise<HistorySession[]> : [])
      .then((data) => {
        setSessions(data.filter((s) => s.id !== currentSessionId));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patientId, currentSessionId]);

  const pastSessions = sessions.filter((s) => s.status === "completed");

  return (
    <>
    <div className="h-[460px] sm:h-[520px] rounded-2xl glass-card-solid glow-card overflow-hidden flex flex-col min-h-0">
      {/* Past sessions collapsible header */}
      {!loading && pastSessions.length > 0 && (
        <div className="border-b border-sand-100/50">
          <button
            onClick={() => setShowSessions((v) => !v)}
            className="flex items-center gap-2 w-full px-4 sm:px-5 py-2.5 text-left hover:bg-sand-50/50 transition-colors"
          >
            <History className="h-3.5 w-3.5 text-sand-400" />
            <span className="text-[12px] font-bold font-display text-sand-600">
              Past sessions
            </span>
            <span className="rounded-md bg-sand-50 border border-sand-100 px-1.5 py-0.5 text-[10px] font-semibold text-sand-500 tabular-nums">
              {pastSessions.length}
            </span>
            {showSessions ? (
              <ChevronDown className="h-3 w-3 text-sand-400 ml-auto" />
            ) : (
              <ChevronRight className="h-3 w-3 text-sand-400 ml-auto" />
            )}
          </button>
          {showSessions && (
            <div className="px-4 sm:px-5 pb-3 space-y-1.5 max-h-[180px] overflow-y-auto scrollbar-none">
              {pastSessions.map((s) => {
                const date = new Date(s.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
                const isExpanded = expanded === s.id;
                return (
                  <div key={s.id} className="rounded-lg border border-sand-100 overflow-hidden">
                    <button
                      onClick={() => setExpanded(isExpanded ? null : s.id)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-sand-50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-sand-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-sand-400 shrink-0" />
                      )}
                      <Clock className="h-3 w-3 text-sand-400 shrink-0" />
                      <span className="text-[12px] font-medium text-sand-600">{date}</span>
                      <span className="ml-auto text-[10px] text-voice-500 font-medium">
                        Completed
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="px-3 pb-2.5 pt-0.5 space-y-2">
                        {s.summary ? (
                          <p className="text-[11px] text-sand-500 leading-relaxed">{s.summary}</p>
                        ) : (
                          <p className="text-[11px] text-sand-400 italic">No summary available.</p>
                        )}
                        <button
                          onClick={() => setViewingSession(s.id)}
                          className="flex items-center gap-1.5 rounded-md border border-sand-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-sand-600 hover:bg-sand-50 hover:border-sand-300 transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                          View full session
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Chat */}
      <div className="flex-1 min-h-0">
        <PatientChat
          patientId={patientId}
          patientName={patientName}
          currentTeeth={currentTeeth}
          currentSessionNotes={currentSessionNotes}
        />
      </div>
    </div>

    {/* Session detail modal */}
    {viewingSession && (
      <SessionDetailModal
        sessionId={viewingSession}
        onClose={() => setViewingSession(null)}
      />
    )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Simple Markdown renderer for reports                               */
/* ------------------------------------------------------------------ */
function ReportMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 mb-3 text-[13px] text-sand-700 leading-relaxed">
          {currentList.map((item, i) => (
            <li key={i}>{item.replace(/\*\*(.*?)\*\*/g, "").length === item.replace(/\*\*/g, "").length ? item : item.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? <strong key={j} className="font-semibold text-sand-800">{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>
            )}</li>
          ))}
        </ul>,
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      flushList();
      elements.push(<h2 key={i} className="text-[15px] font-bold font-display text-sand-900 mt-5 mb-2 first:mt-0">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(<h3 key={i} className="text-[14px] font-semibold font-display text-sand-800 mt-4 mb-1.5">{line.slice(4)}</h3>);
    } else if (line.match(/^[-*] /)) {
      currentList.push(line.replace(/^[-*] /, ""));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      const parts = line.split(/(\*\*[^*]+\*\*)/g);
      elements.push(
        <p key={i} className="text-[13px] text-sand-700 leading-relaxed mb-2">
          {parts.map((part, j) =>
            part.startsWith("**") && part.endsWith("**") ? <strong key={j} className="font-semibold text-sand-800">{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>
          )}
        </p>,
      );
    }
  }
  flushList();
  return <div>{elements}</div>;
}

/* ------------------------------------------------------------------ */
/*  Voice Session Page                                                 */
/* ------------------------------------------------------------------ */
export default function VoiceSession({
  patient,
  onEnd,
  onBack,
  existingSessionId,
}: {
  patient: Patient;
  onEnd: () => void;
  onBack: () => void;
  existingSessionId?: string;
}) {
  const [sessionId, setSessionId] = useState<string | null>(existingSessionId ?? null);
  const fetchedRef = useRef(false);

  // Fetch or create a persistent session ID from D1 (skip if resuming an existing session)
  useEffect(() => {
    if (existingSessionId) return;
    // Guard against StrictMode double-fire
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    fetch(`/api/patients/${patient.id}/active-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: patient.name }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ id: string }>;
      })
      .then((data) => setSessionId(data.id))
      .catch((err) => {
        console.error("Failed to fetch active session:", err);
        setSessionId(`session-${patient.id}-${Date.now()}`);
      });
  }, [patient.id, patient.name, existingSessionId]);

  if (!sessionId) {
    return (
      <div className="grain page-bg min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-sand-500 animate-fade-in-up">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl glass-card-solid glow-saffron">
            <Loader2 className="h-5 w-5 animate-spin text-saffron-500" />
          </div>
          <span className="text-[14px] font-medium">Loading session...</span>
        </div>
      </div>
    );
  }

  return <VoiceSessionInner patient={patient} onEnd={onEnd} onBack={onBack} sessionId={sessionId} />;
}

function VoiceSessionInner({
  patient,
  onEnd,
  onBack,
  sessionId,
}: {
  patient: Patient;
  onEnd: () => void;
  onBack: () => void;
  sessionId: string;
}) {
  const {
    teeth,
    sessionNotes,
    voiceLog,
    connected,
    updateTooth,
    updateSessionNotes,
    processVoice,
    appendVoiceLog,
    undo,
    speak,
    completeSession,
  } = useSession(sessionId, patient.id, patient.name);

  const [selectedTooth, setSelectedTooth] = useState<number | null>(18);
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("scribe");
  const [voiceActive, setVoiceActive] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [startTime] = useState(() => Date.now());
  const [agentActive, setAgentActive] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closing, setClosing] = useState(false);

  // Report state
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const odontogramRef = useRef<HTMLDivElement>(null);

  const anyMicActive = voiceActive || agentActive;
  const [elapsed, setElapsed] = useState("00:00");
  // Track last processed committed transcript to avoid re-processing
  const lastProcessedRef = useRef("");
  // Ref to track processing state for modal close logic
  const processingRef = useRef(false);

  // Check for existing report on mount
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/report`)
      .then((r) => r.ok ? r.json() as Promise<{ report: string | null }> : null)
      .then((data) => { if (data?.report) setReport(data.report); })
      .catch(() => {});
  }, [sessionId]);

  const generateReportHandler = useCallback(async () => {
    setReportLoading(true);
    setReportError(null);
    try {
      const resp = await fetch(`/api/sessions/${sessionId}/report`, { method: "POST" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = (await resp.json()) as { report: string; cached: boolean };
      setReport(data.report);
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setReportError((err as Error).message);
    } finally {
      setReportLoading(false);
    }
  }, [sessionId]);

  const printReport = useCallback(() => {
    if (!report) return;

    let odontogramHtml = "";
    const svgEl = odontogramRef.current?.querySelector("svg");
    if (svgEl) {
      const clone = svgEl.cloneNode(true) as SVGElement;
      clone.querySelectorAll("[style*=cursor]").forEach((el) => {
        (el as HTMLElement).style.cursor = "default";
      });
      clone.setAttribute("width", "100%");
      clone.setAttribute("height", "auto");
      const svgStr = new XMLSerializer().serializeToString(clone);
      const legendItems = [
        { color: "#D4503A", label: "Caries / RCT" },
        { color: "#5A96C8", label: "Composite" },
        { color: "#7A7A7A", label: "Amalgam" },
        { color: "#88B4D0", label: "Inlay" },
        { color: "#6694B8", label: "Onlay" },
        { color: "#E49545", label: "Crown" },
        { color: "#C77B30", label: "Bridge" },
        { color: "#B37886", label: "Prosthesis" },
        { color: "#4A86C2", label: "Implant" },
        { color: "#D8DDE5", label: "Missing" },
      ];
      const legendHtml = legendItems
        .map((item) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${item.color};"></span><span>${item.label}</span></span>`)
        .join("");

      odontogramHtml = `
        <div style="margin-bottom:28px;">
          <h2 style="font-size:16px;color:#2a303a;margin-bottom:8px;">Odontogram</h2>
          <div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px 8px;background:#fafafa;">
            ${svgStr}
          </div>
          <div style="margin-top:8px;font-size:11px;color:#6b7588;line-height:2;">${legendHtml}</div>
        </div>
        <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;">
      `;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>Clinical Report - ${patient.name}</title>
<style>
  body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #1a1a2e; line-height: 1.6; }
  h1 { font-size: 20px; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; }
  h2 { font-size: 16px; color: #2a303a; margin-top: 24px; }
  h3 { font-size: 14px; color: #3f4754; margin-top: 16px; }
  p { font-size: 13px; margin: 8px 0; }
  ul { font-size: 13px; padding-left: 24px; }
  li { margin: 4px 0; }
  strong { color: #2a303a; }
  .meta { font-size: 12px; color: #6b7588; margin-bottom: 24px; }
  svg { max-width: 100%; height: auto; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>Clinical Dental Report</h1>
<div class="meta">Patient: ${patient.name} | Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
${odontogramHtml}
${report.replace(/## (.*)/g, "<h2>$1</h2>").replace(/### (.*)/g, "<h3>$1</h3>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^- (.*)/gm, "<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>").replace(/\n\n/g, "</p><p>").replace(/^(?!<[hul])/gm, "<p>").replace(/<p><\/p>/g, "")}
</body></html>`);
    printWindow.document.close();
    printWindow.print();
  }, [report, patient.name]);

  // Scribe mic recording (mirrors ConvAI recording pattern)
  const scribeMicRecorderRef = useRef<MediaRecorder | null>(null);
  const scribeMicChunksRef = useRef<Blob[]>([]);
  const scribeMicStreamRef = useRef<MediaStream | null>(null);

  const startScribeMicRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: true },
      });
      scribeMicStreamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      scribeMicChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) scribeMicChunksRef.current.push(e.data);
      };
      recorder.start(1000);
      scribeMicRecorderRef.current = recorder;
    } catch (err) {
      console.warn("[Scribe] Could not start mic recording:", err);
    }
  }, []);

  const stopScribeMicRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = scribeMicRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const blob = new Blob(scribeMicChunksRef.current, { type: "audio/webm" });
        scribeMicChunksRef.current = [];
        resolve(blob.size > 0 ? blob : null);
      };
      recorder.stop();
      scribeMicRecorderRef.current = null;
      scribeMicStreamRef.current?.getTracks().forEach((t) => t.stop());
      scribeMicStreamRef.current = null;
    });
  }, []);

  const saveScribeRecording = useCallback(async () => {
    const blob = await stopScribeMicRecording();
    if (!blob) return;
    try {
      await fetch(`/api/sessions/${sessionId}/audio`, {
        method: "POST",
        headers: { "Content-Type": "audio/webm" },
        body: blob,
      });
    } catch (err) {
      console.error("Failed to save scribe recording:", err);
    }
  }, [stopScribeMicRecording, sessionId]);

  // Client-side STT via ElevenLabs useScribe
  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    commitStrategy: CommitStrategy.VAD,
    vadSilenceThresholdSecs: 1.5,
    languageCode: "en",
    onCommittedTranscript: (data) => {
      const text = data.text?.trim();
      if (!text || text.length < 2) return;
      // Filter garbled text
      if (!/^[\x20-\x7E]+$/.test(text)) return;
      console.log("[scribe] committed:", text);
      // Process via DO
      if (lastProcessedRef.current === text) return;
      lastProcessedRef.current = text;
      setLastHeard(text);
      setProcessing(true);
      processingRef.current = true;
      processVoice(text)
        .then((result) => {
          if (result.speak) {
            speak(result.text).then((dataUri) => {
              const audio = new Audio(dataUri);
              audio.play().catch(() => {});
            }).catch(() => {});
          }
        })
        .finally(() => {
          setProcessing(false);
          processingRef.current = false;
          setTimeout(() => setLastHeard(""), 3000);
        });
    },
  });

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - startTime) / 1000);
      const m = String(Math.floor(seconds / 60)).padStart(2, "0");
      const s = String(seconds % 60).padStart(2, "0");
      setElapsed(`${m}:${s}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  // Start/stop microphone capture via useScribe
  const toggleVoice = useCallback(async () => {
    if (voiceActive) {
      scribe.disconnect();
      setVoiceActive(false);
      saveScribeRecording();
    } else {
      try {
        const resp = await fetch("/api/scribe-token");
        if (!resp.ok) throw new Error("Failed to get scribe token");
        const data = await resp.json() as { token: string };
        await scribe.connect({
          token: data.token,
          microphone: {
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        setVoiceActive(true);
        startScribeMicRecording();
      } catch (err) {
        console.error("Failed to start transcription:", err);
      }
    }
  }, [voiceActive, scribe, saveScribeRecording, startScribeMicRecording]);

  const selectedToothData = selectedTooth
    ? teeth.find((t) => t.number === selectedTooth) ?? null
    : null;

  const toothsWithConditions = teeth.filter(hasToothFinding).length;
  const hasReportableContent = toothsWithConditions > 0 || sessionNotes.trim().length > 0;

  return (
    <div className="grain page-bg min-h-screen">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-30 glass-card-solid glass-blur border-b border-sand-200/40">
        <div className="mx-auto max-w-7xl px-3 sm:px-5 lg:px-6">
          {/* Row 1: Back + patient + close */}
          <div className="flex items-center gap-2 sm:gap-3 pt-2.5 pb-1.5 sm:pt-3 sm:pb-2">
            <button
              onClick={() => {
                if (voiceActive) {
                  scribe.disconnect();
                  setVoiceActive(false);
                }
                saveScribeRecording();
                onBack();
              }}
              className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] font-medium text-sand-500 hover:bg-sand-100/80 hover:text-sand-700 transition-colors shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div className="h-5 w-px bg-sand-200/60 hidden sm:block" />

            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-sand-900 to-sand-800 text-[10px] font-bold text-saffron-300 font-display shadow-sm">
                {getInitials(patient.name)}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] sm:text-[14px] font-semibold text-sand-900 font-display truncate leading-tight">
                  {patient.name}
                </p>
                <p className="text-[10px] text-sand-400 leading-tight mt-0.5 hidden sm:block">
                  Voice session
                </p>
              </div>
            </div>

            {/* Close session */}
            <button
              onClick={() => setShowCloseModal(true)}
              disabled={anyMicActive}
              title={anyMicActive ? "Stop the microphone before closing" : "Close this session"}
              className={`flex items-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 text-[12px] font-semibold transition-all shrink-0 ${
                anyMicActive
                  ? "bg-sand-100 text-sand-400 cursor-not-allowed border border-sand-200/60"
                  : "bg-gradient-to-r from-clay-500 to-clay-600 text-white hover:from-clay-600 hover:to-clay-700 shadow-md shadow-clay-500/15"
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Close session</span>
              <span className="sm:hidden">Close</span>
            </button>
          </div>

          {/* Row 2: Status badges + mode toggle + voice toggle */}
          <div className="flex items-center gap-1.5 sm:gap-2 pb-2.5 sm:pb-3 overflow-x-auto scrollbar-none">
            {/* Live indicator dot */}
            <div className="flex items-center gap-1.5 rounded-lg bg-voice-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-voice-600 border border-voice-200/50 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-voice-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-voice-400" />
              </span>
              <span className="hidden xs:inline">Live</span>
            </div>

            {/* Timer */}
            <div className="flex items-center gap-1.5 rounded-lg bg-sand-100/80 px-2.5 py-1.5 text-[11px] tabular-nums font-medium text-sand-600 border border-sand-200/40 shrink-0">
              <Clock className="h-3 w-3 text-sand-400" />
              {elapsed}
            </div>

            {/* Findings count */}
            <div className="flex items-center gap-1.5 rounded-lg bg-saffron-50/80 px-2.5 py-1.5 text-[11px] font-semibold text-saffron-600 border border-saffron-200/50 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-saffron-400" />
              {toothsWithConditions} <span className="hidden sm:inline">findings</span>
            </div>

            {/* Spacer */}
            <div className="flex-1 min-w-1" />

            {/* Mode toggle */}
            <div className="flex rounded-xl bg-sand-100/80 p-0.5 border border-sand-200/50 shrink-0">
              <button
                onClick={() => setVoiceMode("scribe")}
                className={`rounded-[10px] px-3 sm:px-3.5 py-1.5 text-[11px] font-semibold transition-all ${
                  voiceMode === "scribe"
                    ? "bg-white text-sand-800 shadow-sm ring-1 ring-sand-200/30"
                    : "text-sand-500 hover:text-sand-700"
                }`}
              >
                Scribe
              </button>
              <button
                onClick={() => setVoiceMode("agent")}
                className={`rounded-[10px] px-3 sm:px-3.5 py-1.5 text-[11px] font-semibold transition-all ${
                  voiceMode === "agent"
                    ? "bg-white text-sand-800 shadow-sm ring-1 ring-sand-200/30"
                    : "text-sand-500 hover:text-sand-700"
                }`}
              >
                Agent
              </button>
            </div>

            {/* Voice toggle (scribe mode only) */}
            {voiceMode === "scribe" && (
              <button
                onClick={toggleVoice}
                disabled={!connected}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 sm:px-4 py-2 text-[12px] font-semibold transition-all shrink-0 ${
                  voiceActive
                    ? "bg-gradient-to-r from-sand-900 to-sand-800 text-white shadow-lg shadow-sand-900/20 ring-1 ring-saffron-400/20"
                    : "bg-gradient-to-r from-saffron-400 to-saffron-500 text-white hover:from-saffron-500 hover:to-saffron-600 shadow-md shadow-saffron-400/20"
                } ${!connected ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <Mic className={`h-3.5 w-3.5 ${voiceActive ? "text-saffron-300" : ""}`} />
                {voiceActive ? "Listening" : "Start mic"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ---- Main layout ---- */}
      <div className="mx-auto max-w-7xl px-3 sm:px-5 lg:px-6 py-4 sm:py-5 lg:py-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-5">
          {/* ---- Left: Odontogram ---- */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Odontogram card */}
            <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
              {/* Accent strip */}
              <div className="h-[3px] bg-gradient-to-r from-saffron-300 via-voice-300 to-clay-300 opacity-60" />
              <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-sand-100/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[15px] sm:text-[16px] font-bold font-display text-sand-900">
                    Odontogram
                  </h2>
                  {selectedToothData && (
                    <span className="text-[11px] font-medium text-saffron-600 bg-saffron-50 border border-saffron-200/60 px-2 py-0.5 rounded-md">
                      Tooth {selectedToothData.number} selected
                    </span>
                  )}
                </div>
                <Legend />
              </div>
              <div ref={odontogramRef} className="px-2 sm:px-4 pb-4 sm:pb-5 overflow-x-auto">
                <div className="min-w-[700px]">
                  <Odontogram
                    teeth={teeth}
                    selectedTooth={selectedTooth}
                    onSelectTooth={(n) =>
                      setSelectedTooth(selectedTooth === n ? null : n)
                    }
                  />
                </div>
              </div>
            </div>

            {/* Tooth detail */}
            {selectedToothData && (
              <ToothDetail
                tooth={selectedToothData}
                onClose={() => setSelectedTooth(null)}
                onUpdate={updateTooth}
              />
            )}

            <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
                <FileText className="h-3.5 w-3.5 text-sand-400" />
                <h3 className="text-[13px] font-bold font-display text-sand-700">
                  Session notes
                </h3>
                <span className="ml-auto rounded-md bg-sand-50 border border-sand-100 px-2 py-0.5 text-[10px] font-semibold text-sand-500 tabular-nums">
                  {sessionNotes.length}/2000
                </span>
              </div>
              <div className="px-4 sm:px-5 py-4 space-y-2.5">
                <textarea
                  value={sessionNotes}
                  onChange={(e) => {
                    updateSessionNotes(e.target.value, "replace", false).catch(() => {});
                  }}
                  maxLength={2000}
                  placeholder="Add general notes for the whole visit: symptoms, patient concerns, treatment context, or any observation not tied to a single tooth..."
                  rows={4}
                  className="w-full rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-[13px] text-sand-700 placeholder:text-sand-300 focus:outline-none focus:border-saffron-400 focus:ring-1 focus:ring-saffron-400/30 resize-none"
                />
                <p className="text-[11px] text-sand-400 leading-relaxed">
                  Voice tools can also add to this field when the note applies to the whole session rather than one tooth.
                </p>
              </div>
            </div>

            {/* Report section — show when there are findings */}
            {hasReportableContent && (
              <div ref={reportRef} className="rounded-2xl glass-card-solid glow-card overflow-hidden">
                <div className="h-[3px] bg-gradient-to-r from-saffron-400 via-saffron-300 to-clay-300 opacity-50" />
                <div className="flex items-center gap-2 border-b border-sand-100 px-4 sm:px-6 py-3 sm:py-4">
                  <Sparkles className="h-4 w-4 text-saffron-500" />
                  <h2 className="text-[15px] sm:text-[16px] font-bold font-display text-sand-900">Clinical Report</h2>
                  <span className="text-[10px] font-medium text-sand-400 bg-sand-50 border border-sand-100 px-1.5 py-0.5 rounded">AI</span>
                  {report && (
                    <button
                      onClick={printReport}
                      className="ml-auto flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-sand-500 hover:bg-sand-50 hover:text-sand-700 transition-colors border border-sand-200/60"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Print</span>
                    </button>
                  )}
                </div>
                <div className="px-4 sm:px-6 py-4 sm:py-5">
                  {report ? (
                    <ReportMarkdown content={report} />
                  ) : reportLoading ? (
                    <div className="flex flex-col items-center gap-3 py-10">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron-50 border border-saffron-200/60">
                        <Loader2 className="h-5 w-5 animate-spin text-saffron-500" />
                      </div>
                      <p className="text-[13px] text-sand-500 font-medium">Generating report with AI...</p>
                      <p className="text-[11px] text-sand-400">This may take a few seconds</p>
                    </div>
                  ) : reportError ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <p className="text-[13px] text-clay-600">Failed to generate report</p>
                      <p className="text-[11px] text-sand-400">{reportError}</p>
                      <button
                        onClick={generateReportHandler}
                        className="flex items-center gap-2 rounded-xl bg-saffron-400 px-4 py-2 text-[13px] font-medium text-white hover:bg-saffron-500 transition-colors shadow-md shadow-saffron-400/20"
                      >
                        Try again
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron-50 border border-saffron-200/60">
                        <Sparkles className="h-5 w-5 text-saffron-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-[14px] font-semibold text-sand-700 mb-1">Generate Clinical Report</p>
                        <p className="text-[12px] text-sand-400 max-w-[300px]">
                          AI will analyze the current findings and generate a professional clinical report.
                        </p>
                      </div>
                      <button
                        onClick={generateReportHandler}
                        className="flex items-center gap-2 rounded-xl bg-saffron-400 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-saffron-500 active:bg-saffron-600 transition-all shadow-md shadow-saffron-400/20 mt-1"
                      >
                        <Sparkles className="h-4 w-4" />
                        Generate report
                      </button>
                    </div>
                  )}
                </div>
                {report && (
                  <div className="border-t border-sand-100 px-4 sm:px-6 py-3 flex items-center gap-2">
                    <button
                      onClick={generateReportHandler}
                      disabled={reportLoading}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium text-sand-500 hover:bg-sand-50 hover:text-sand-700 transition-colors border border-sand-200/60 disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      Regenerate
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ---- Right: Voice panel ---- */}
          <div className="w-full lg:w-[380px] lg:shrink-0 space-y-4 lg:space-y-0">
            {/* Agent panel — always mounted, hidden when not active */}
            <div className={voiceMode === "agent" ? "" : "hidden"}>
              <ConvAIVoicePanel updateTooth={updateTooth} updateSessionNotes={updateSessionNotes} undo={undo} appendVoiceLog={appendVoiceLog} voiceLog={voiceLog} sessionId={sessionId} patientId={patient.id} currentTeeth={teeth} currentSessionNotes={sessionNotes} onAgentActiveChange={setAgentActive} />
            </div>
            {/* Scribe panel */}
            <div className={voiceMode === "scribe" ? "" : "hidden"}>
            <div className="flex flex-col gap-3 sm:gap-4">
            {/* Voice status card */}
            <div
              className={`rounded-2xl p-4 sm:p-5 transition-all duration-300 ${
                voiceActive
                  ? "bg-gradient-to-br from-sand-900 via-sand-900 to-sand-950 glow-dark ring-1 ring-saffron-400/10"
                  : "glass-card-solid glow-card"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                    voiceActive ? "bg-saffron-400/20" : "bg-sand-50"
                  }`}
                >
                  <AudioLines
                    className={`h-4.5 w-4.5 ${
                      voiceActive ? "text-saffron-300" : "text-sand-400"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[13px] sm:text-[14px] font-semibold ${
                      voiceActive ? "text-white" : "text-sand-700"
                    }`}
                  >
                    {voiceActive ? "Voice active" : "Microphone off"}
                  </p>
                  <p
                    className={`text-[11px] sm:text-[12px] ${
                      voiceActive ? "text-sand-400" : "text-sand-500"
                    }`}
                  >
                    {voiceActive
                      ? "Speak naturally to chart findings"
                      : "Use the button above to start listening"}
                  </p>
                </div>
                {voiceActive && (
                  <div className="flex h-2 w-2 shrink-0">
                    <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-saffron-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-saffron-400" />
                  </div>
                )}
              </div>

              {/* Waveform */}
              {voiceActive && (
                <div className="flex items-end justify-center gap-[3px] h-9 mt-4">
                  {barHeights.map((h, i) => (
                    <div
                      key={i}
                      className="w-[2.5px] rounded-full"
                      style={{
                        height: `${h}px`,
                        background: 'linear-gradient(to top, rgba(228,149,69,0.25), rgba(228,149,69,0.6))',
                        animation: `waveform ${barDurations[i]}s ease-in-out infinite`,
                        animationDelay: `${i * 0.06}s`,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Live transcript card */}
            <div className="rounded-2xl glass-card-solid glow-card p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1.5 w-1.5 rounded-full bg-voice-400 animate-pulse" />
                <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider">
                  Live transcript
                </p>
              </div>
              <div className="min-h-[44px]">
                {processing && lastHeard ? (
                  <div className="flex items-start gap-2.5">
                    <Loader2 className="h-4 w-4 text-saffron-500 animate-spin mt-0.5 shrink-0" />
                    <p className="text-[13px] text-sand-600 leading-relaxed">
                      {lastHeard}
                    </p>
                  </div>
                ) : scribe.partialTranscript ? (
                  <p className="text-[13px] text-sand-500 leading-relaxed italic">
                    {scribe.partialTranscript}
                  </p>
                ) : lastHeard ? (
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-voice-500 shrink-0" />
                    <p className="text-[13px] text-voice-600 leading-relaxed font-medium">
                      {lastHeard}
                    </p>
                  </div>
                ) : (
                  <p className="text-[12px] text-sand-400 italic">
                    {voiceActive ? "Listening..." : "Start the mic to see live transcript"}
                  </p>
                )}
              </div>
            </div>

            {/* Undo button */}
            <button
              onClick={async () => {
                const msg = await undo();
                speak(msg).then((uri) => new Audio(uri).play().catch(() => {})).catch(() => {});
              }}
              className="flex items-center justify-center gap-2 rounded-xl border border-sand-200/60 glass-card hover:bg-white/80 px-4 py-2.5 text-[13px] font-medium text-sand-600 hover:border-sand-300 active:bg-sand-100/80 transition-all"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo last
            </button>

            {/* Action log */}
            <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
                <FileText className="h-3.5 w-3.5 text-saffron-400" />
                <h3 className="text-[13px] font-bold font-display text-sand-700">
                  Actions
                </h3>
                <span className="ml-auto rounded-md bg-sand-50 border border-sand-100 px-2 py-0.5 text-[10px] font-semibold text-sand-500 tabular-nums">
                  {voiceLog.length}
                </span>
              </div>
              <div className="divide-y divide-sand-100 px-4 sm:px-5 max-h-[320px] lg:max-h-[400px] overflow-y-auto">
                {voiceLog.length === 0 && !processing && (
                  <p className="py-8 text-center text-[12px] text-sand-400">
                    {connected ? "No actions yet. Start speaking to chart findings." : "Connecting..."}
                  </p>
                )}
                {voiceLog.map((entry) => (
                  <LogEntry key={entry.id} entry={entry} />
                ))}
                {processing && lastHeard && (
                  <div className="flex gap-3 py-2.5">
                    <span className="shrink-0 pt-0.5 w-8">
                      <Loader2 className="h-3.5 w-3.5 text-saffron-500 animate-spin" />
                    </span>
                    <p className="flex-1 min-w-0 text-[13px] text-saffron-600 leading-relaxed">
                      Processing...
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Patient History */}
            <PatientHistoryPanel
              patientId={patient.id}
              patientName={patient.name}
              currentSessionId={sessionId}
              currentTeeth={teeth}
              currentSessionNotes={sessionNotes}
            />
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Close session confirmation modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-sand-950/40 backdrop-blur-sm">
          <div className="w-full sm:mx-4 sm:w-auto sm:min-w-[380px] sm:max-w-sm rounded-t-2xl sm:rounded-2xl glass-card-solid p-5 sm:p-6 glow-dark animate-fade-in-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clay-50 border border-clay-200/60">
                <CheckCircle2 className="h-5 w-5 text-clay-500" />
              </div>
              <div>
                <h3 className="text-[15px] sm:text-[16px] font-bold font-display text-sand-900">
                  Close session?
                </h3>
                <p className="text-[12px] sm:text-[13px] text-sand-500 leading-relaxed mt-1">
                  All findings will be saved. You won't be able to add more data after closing.
                </p>
              </div>
            </div>
            {processing && (
              <div className="flex items-center gap-2.5 rounded-xl bg-saffron-50 border border-saffron-200/60 px-3.5 py-2.5 mb-4">
                <Loader2 className="h-4 w-4 text-saffron-500 animate-spin shrink-0" />
                <p className="text-[12px] text-saffron-600 font-medium">Waiting for pending voice command...</p>
              </div>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowCloseModal(false)}
                disabled={closing}
                className="flex-1 rounded-xl border border-sand-200 bg-white px-4 py-2.5 text-[13px] font-medium text-sand-600 hover:bg-sand-50 active:bg-sand-100 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setClosing(true);
                  // Wait for any pending LLM processing to finish
                  while (processingRef.current) {
                    await new Promise((r) => setTimeout(r, 300));
                  }
                  await saveScribeRecording();
                  await completeSession();
                  onEnd();
                }}
                disabled={closing}
                className="flex-1 rounded-xl bg-clay-500 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-clay-600 active:bg-clay-700 shadow-md shadow-clay-500/20 transition-all disabled:opacity-70"
              >
                {closing ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Closing...
                  </span>
                ) : (
                  "Close session"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
