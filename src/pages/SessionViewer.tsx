import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Loader2, FileText, Clock, X, Mic, Play, Pause, AudioLines, Sparkles, Printer, Trash2, AlertTriangle } from "lucide-react";
import {
  conditionColors,
  conditionLabels,
  hasToothFinding,
  surfaceConditions,
  type ToothState,
  type Condition,
  type SurfaceCondition,
  type Surface,
  type ToothLabel,
} from "../data/dental";
import { getInitials } from "../data/types";
import type { VoiceLogEntry } from "../data/dental";
import Odontogram from "../components/Odontogram";

/* ------------------------------------------------------------------ */
/*  Legend (read-only, same as VoiceSession)                           */
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
    return <span className="h-3 w-3 rounded-full" style={{ backgroundColor: conditionColors[item] }} />;
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
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4">
      <circle cx="8" cy="8" r="5.75" fill="#ECEFF3" fillOpacity="0.4" stroke="#8D97AA" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="2.5 2.5" />
    </svg>
  );
}

function Legend() {
  const surfaceItems: SurfaceCondition[] = ["caries", "composite", "amalgam", "inlay", "onlay"];
  const labelItems: Array<ToothLabel | "mobility"> = ["crown", "bridge", "prosthesis", "implant", "rct", "missing", "mobility"];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
        {surfaceItems.map((item) => (
          <div key={item} className="flex items-center gap-2">
            <LegendMarker item={item} />
            <span className="text-[12px] font-medium text-sand-600">{conditionLabels[item]}</span>
          </div>
        ))}
        <span className="h-4 w-px bg-sand-200" />
        {labelItems.map((item) => (
          <div key={item} className="flex items-center gap-2">
            <LegendMarker item={item} />
            <span className="text-[12px] font-medium text-sand-600">
              {item === "mobility" ? "Mobility" : conditionLabels[item]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Read-only tooth detail                                             */
/* ------------------------------------------------------------------ */
function ToothDetailReadOnly({ tooth, onClose }: { tooth: ToothState; onClose: () => void }) {
  const surfaces: Surface[] = ["M", "D", "V", "L", "O"];

  return (
    <div className="rounded-[18px] glass-card-solid glow-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[16px] font-bold font-display text-sand-900">Tooth {tooth.number}</h3>
        <button onClick={onClose} className="rounded-lg p-1 text-sand-400 hover:bg-sand-100 hover:text-sand-600 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Labels */}
      {tooth.labels.length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2">Labels</p>
          <div className="flex flex-wrap gap-2">
            {tooth.labels.map((label) => (
              <span key={label} className="rounded-lg border border-sand-300 bg-sand-50 px-3 py-1.5 text-[12px] font-medium text-sand-700">
                {conditionLabels[label]}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Surfaces */}
      {Object.keys(tooth.surfaces).length > 0 && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2">Surfaces</p>
          <div className="space-y-1.5">
            {surfaces.map((s) => {
              const condition = tooth.surfaces[s];
              if (!condition) return null;
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-[12px] font-semibold text-sand-600 w-5">{s}</span>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: conditionColors[condition] }} />
                  <span className="text-[12px] text-sand-600">{conditionLabels[condition]}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mobility */}
      {tooth.mobility !== "none" && (
        <div className="mb-4">
          <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2">Mobility</p>
          <span className="rounded-lg border border-clay-200 bg-clay-50 px-3 py-1.5 text-[12px] font-medium text-clay-700">
            {tooth.mobility}
          </span>
        </div>
      )}

      {/* Notes */}
      {tooth.note && (
        <div>
          <p className="text-[11px] font-semibold text-sand-500 uppercase tracking-wider mb-2">Notes</p>
          <p className="text-[13px] text-sand-700 leading-relaxed">{tooth.note}</p>
        </div>
      )}

      {!hasToothFinding(tooth) && (
        <p className="text-[13px] text-sand-400 italic">No findings recorded for this tooth.</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Audio recording player                                             */
/* ------------------------------------------------------------------ */
function AudioRecordingPlayer({ url, label }: { url: string; label: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-2 rounded-xl border border-sand-200 bg-white/60 px-3 py-2 text-[12px] text-sand-600 hover:bg-sand-100 transition-colors w-full"
    >
      {playing ? (
        <Pause className="h-3.5 w-3.5 text-saffron-500 shrink-0" />
      ) : (
        <Play className="h-3.5 w-3.5 text-sand-500 shrink-0" />
      )}
      <span className="flex-1 text-left truncate">{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Simple Markdown renderer                                           */
/* ------------------------------------------------------------------ */
function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="list-disc list-inside space-y-1 mb-3 text-[13px] text-sand-700 leading-relaxed">
          {currentList.map((item, i) => (
            <li key={i}><InlineMarkdown text={item} /></li>
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
      elements.push(
        <h2 key={i} className="text-[15px] font-bold font-display text-sand-900 mt-5 mb-2 first:mt-0">
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={i} className="text-[14px] font-semibold font-display text-sand-800 mt-4 mb-1.5">
          {line.slice(4)}
        </h3>,
      );
    } else if (line.match(/^[-*] /)) {
      currentList.push(line.replace(/^[-*] /, ""));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      elements.push(
        <p key={i} className="text-[13px] text-sand-700 leading-relaxed mb-2">
          <InlineMarkdown text={line} />
        </p>,
      );
    }
  }
  flushList();

  return <div>{elements}</div>;
}

/** Render inline bold/italic markdown */
function InlineMarkdown({ text }: { text: string }) {
  // Split on **bold** patterns
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-semibold text-sand-800">{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Session data shape from API                                        */
/* ------------------------------------------------------------------ */
interface SessionData {
  id: string;
  patient_id: string;
  patient_name: string | null;
  status: string;
  summary: string | null;
  session_notes: string | null;
  teeth_data: ToothState[] | null;
  voice_log: VoiceLogEntry[] | null;
  created_at: string;
  completed_at: string | null;
}

/* ------------------------------------------------------------------ */
/*  Session Viewer (read-only)                                         */
/* ------------------------------------------------------------------ */
export default function SessionViewer({
  sessionId,
  onBack,
}: {
  sessionId: string;
  onBack: () => void;
}) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [recordings, setRecordings] = useState<Array<{ key: string; url: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingSession, setDeletingSession] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Report state
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const odontogramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<SessionData>;
      })
      .then(setSession)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // Fetch audio recordings from R2
    fetch(`/api/sessions/${sessionId}/audio`)
      .then((r) => r.ok ? r.json() as Promise<{ recordings: Array<{ key: string; url: string }> }> : null)
      .then((data) => {
        if (data?.recordings?.length) setRecordings(data.recordings);
      })
      .catch(() => {});

    // Check if report already exists
    fetch(`/api/sessions/${sessionId}/report`)
      .then((r) => r.ok ? r.json() as Promise<{ report: string | null }> : null)
      .then((data) => {
        if (data?.report) setReport(data.report);
      })
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
      // Scroll to report
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err) {
      setReportError((err as Error).message);
    } finally {
      setReportLoading(false);
    }
  }, [sessionId]);

  const deleteSessionHandler = useCallback(async () => {
    setDeletingSession(true);
    setDeleteError(null);

    try {
      const resp = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!resp.ok) {
        const data = (await resp.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `HTTP ${resp.status}`);
      }

      setShowDeleteConfirm(false);
      onBack();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeletingSession(false);
    }
  }, [onBack, sessionId]);

  const printReport = useCallback(() => {
    if (!report || !session) return;
    const patientName = session.patient_name ?? "Unknown";
    const dateStr = new Date(session.created_at).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    // Serialize odontogram SVG if available
    let odontogramHtml = "";
    const svgEl = odontogramRef.current?.querySelector("svg");
    if (svgEl) {
      const clone = svgEl.cloneNode(true) as SVGElement;
      // Remove selection highlights and interactivity styles
      clone.querySelectorAll("[style*=cursor]").forEach((el) => {
        (el as HTMLElement).style.cursor = "default";
      });
      clone.setAttribute("width", "100%");
      clone.setAttribute("height", "auto");
      const svgStr = new XMLSerializer().serializeToString(clone);

      // Build a small legend for the print
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
        .map((it) => `<span style="display:inline-flex;align-items:center;gap:5px;margin-right:14px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${it.color};"></span><span>${it.label}</span></span>`)
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
<html><head><title>Clinical Report - ${patientName}</title>
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
<div class="meta">Patient: ${patientName} | Date: ${dateStr}</div>
${odontogramHtml}
${report.replace(/## (.*)/g, "<h2>$1</h2>").replace(/### (.*)/g, "<h3>$1</h3>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^- (.*)/gm, "<li>$1</li>").replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>").replace(/\n\n/g, "</p><p>").replace(/^(?!<[hul])/gm, "<p>").replace(/<p><\/p>/g, "")}
</body></html>`);
    printWindow.document.close();
    printWindow.print();
  }, [report, session]);

  if (loading) {
    return (
      <div className="grain page-bg min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 animate-fade-in-up">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl glass-card-solid glow-saffron">
            <Loader2 className="h-5 w-5 animate-spin text-saffron-500" />
          </div>
          <span className="text-[14px] font-medium text-sand-500">Loading session...</span>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="grain page-bg min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-[14px] text-sand-500">{error ?? "Session not found"}</p>
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-medium text-sand-600 hover:bg-sand-100 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      </div>
    );
  }

  const teeth = session.teeth_data ?? [];
  const voiceLog = session.voice_log ?? [];
  const patientName = session.patient_name ?? "Unknown";
  const findingsCount = teeth.filter(hasToothFinding).length;
  const hasReportableContent = findingsCount > 0 || Boolean(session.session_notes?.trim());
  const selectedToothData = selectedTooth ? teeth.find((t) => t.number === selectedTooth) ?? null : null;

  const dateStr = new Date(session.created_at).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="grain page-bg min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-card-solid glass-blur border-b border-sand-200/40">
        <div className="mx-auto max-w-7xl px-3 sm:px-5 lg:px-6">
          <div className="flex items-center gap-2 sm:gap-3 py-2.5 sm:py-3">
            <button onClick={onBack} className="flex items-center gap-1 rounded-xl px-2 sm:px-3 py-2 text-[13px] font-medium text-sand-500 hover:bg-sand-100 hover:text-sand-700 transition-colors shrink-0">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back</span>
            </button>
            <div className="h-5 w-px bg-sand-200 hidden sm:block" />
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sand-900 text-[10px] font-bold text-saffron-300 font-display">
                {getInitials(patientName)}
              </div>
              <p className="text-[13px] sm:text-[14px] font-semibold text-sand-900 font-display truncate">
                {patientName}
              </p>
            </div>

            <div className="flex-1 min-w-2" />

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              {session.status === "completed" && (
                <button
                  onClick={() => {
                    setDeleteError(null);
                    setShowDeleteConfirm(true);
                  }}
                  className="flex items-center gap-1 sm:gap-1.5 rounded-lg border border-clay-200/70 bg-white px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-[12px] font-medium text-clay-600 hover:bg-clay-50 hover:border-clay-300 transition-colors"
                >
                  <Trash2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              )}
              <div className="flex items-center gap-1 sm:gap-1.5 rounded-lg bg-sand-50 px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-[12px] text-sand-500 border border-sand-100">
                <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">{dateStr}</span>
                <span className="sm:hidden">{new Date(session.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              </div>
              <span className="rounded-lg bg-saffron-50 border border-saffron-200/60 px-2 sm:px-2.5 py-1.5 text-[11px] font-semibold text-saffron-600 tabular-nums">
                {findingsCount} <span className="hidden sm:inline">findings</span>
              </span>
              <span className="rounded-lg bg-voice-50 border border-voice-200/60 px-2 sm:px-2.5 py-1.5 text-[11px] font-medium text-voice-600">
                Completed
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="mx-auto max-w-7xl px-3 sm:px-5 lg:px-6 py-4 sm:py-5 lg:py-6">
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-5">
          {/* Left: Odontogram + Report */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Odontogram card */}
            <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
              <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-sand-100/50">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[15px] sm:text-[16px] font-bold font-display text-sand-900">Odontogram</h2>
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
                  {teeth.length > 0 ? (
                    <Odontogram
                      teeth={teeth}
                      selectedTooth={selectedTooth}
                      onSelectTooth={(n) => setSelectedTooth(selectedTooth === n ? null : n)}
                    />
                  ) : (
                    <div className="flex items-center justify-center py-20">
                      <p className="text-[14px] text-sand-400 italic">No odontogram data saved for this session.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tooth detail (read-only) */}
            {selectedToothData && (
              <ToothDetailReadOnly tooth={selectedToothData} onClose={() => setSelectedTooth(null)} />
            )}

            {/* Clinical Report */}
            <div ref={reportRef} className="rounded-2xl glass-card-solid glow-card overflow-hidden">
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
                  <MarkdownContent content={report} />
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
                  <div className="flex flex-col items-center gap-3 py-10">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron-50 border border-saffron-200/60">
                      <Sparkles className="h-5 w-5 text-saffron-500" />
                    </div>
                    <div className="text-center">
                      <p className="text-[14px] font-semibold text-sand-700 mb-1">Generate Clinical Report</p>
                      <p className="text-[12px] text-sand-400 max-w-[300px]">
                        AI will analyze the session findings and generate a professional clinical report with treatment recommendations.
                      </p>
                    </div>
                    <button
                      onClick={generateReportHandler}
                      disabled={!hasReportableContent}
                      className="flex items-center gap-2 rounded-xl bg-saffron-400 px-5 py-2.5 text-[13px] font-semibold text-white hover:bg-saffron-500 active:bg-saffron-600 transition-all shadow-md shadow-saffron-400/20 disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                    >
                      <Sparkles className="h-4 w-4" />
                      Generate report
                    </button>
                    {!hasReportableContent && (
                      <p className="text-[11px] text-sand-400 italic">No findings or session notes to report</p>
                    )}
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
          </div>

          {/* Right: Summary + Findings + Log panels */}
          <div className="w-full lg:w-[360px] lg:shrink-0 flex flex-col gap-3 sm:gap-4">
            {/* Summary */}
            <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
                <FileText className="h-3.5 w-3.5 text-sand-400" />
                <h3 className="text-[13px] font-bold font-display text-sand-700">Session summary</h3>
              </div>
              <div className="px-4 sm:px-5 py-4">
                {session.summary ? (
                  <p className="text-[13px] text-sand-700 leading-relaxed">{session.summary}</p>
                ) : (
                  <p className="text-[13px] text-sand-400 italic">No summary available.</p>
                )}
              </div>
            </div>

            {session.session_notes && (
              <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
                  <FileText className="h-3.5 w-3.5 text-sand-400" />
                  <h3 className="text-[13px] font-bold font-display text-sand-700">Session notes</h3>
                </div>
                <div className="px-4 sm:px-5 py-4">
                  <p className="text-[13px] text-sand-700 leading-relaxed whitespace-pre-wrap">{session.session_notes}</p>
                </div>
              </div>
            )}

            {/* Findings list */}
            {teeth.length > 0 && (
              <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
                  <FileText className="h-3.5 w-3.5 text-sand-400" />
                  <h3 className="text-[13px] font-bold font-display text-sand-700">Findings</h3>
                  <span className="ml-auto rounded-md bg-sand-50 border border-sand-100 px-2 py-0.5 text-[10px] font-semibold text-sand-500 tabular-nums">
                    {findingsCount}
                  </span>
                </div>
                <div className="divide-y divide-sand-100 px-4 sm:px-5 max-h-[400px] overflow-y-auto">
                  {findingsCount === 0 && (
                    <p className="py-6 text-center text-[12px] text-sand-400">
                      No findings in this session.
                    </p>
                  )}
                  {teeth.filter(hasToothFinding).map((tooth) => {
                    const parts: string[] = [];
                    for (const label of tooth.labels) {
                      parts.push(conditionLabels[label]);
                    }
                    for (const [surface, condition] of Object.entries(tooth.surfaces)) {
                      parts.push(`${conditionLabels[condition as Condition]} (${surface})`);
                    }
                    if (tooth.mobility !== "none") {
                      parts.push(`Mobility ${tooth.mobility}`);
                    }
                    return (
                      <button
                        key={tooth.number}
                        onClick={() => setSelectedTooth(selectedTooth === tooth.number ? null : tooth.number)}
                        className={`flex items-center gap-3 py-2.5 w-full text-left transition-colors rounded-lg -mx-2 px-2 ${
                          selectedTooth === tooth.number ? "bg-saffron-50/60" : "hover:bg-sand-50"
                        }`}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sand-100 text-[11px] font-bold text-sand-600 tabular-nums">
                          {tooth.number}
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

            {/* Voice log / transcript */}
            {voiceLog.length > 0 && (
              <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
                  <Mic className="h-3.5 w-3.5 text-sand-400" />
                  <h3 className="text-[13px] font-bold font-display text-sand-700">Voice log</h3>
                  <span className="ml-auto rounded-md bg-sand-50 border border-sand-100 px-2 py-0.5 text-[10px] font-semibold text-sand-500 tabular-nums">
                    {voiceLog.length}
                  </span>
                </div>
                <div className="divide-y divide-sand-100 px-4 sm:px-5 max-h-[320px] overflow-y-auto">
                  {voiceLog.map((entry) => {
                    const isCorrection = entry.type === "correction";
                    const isFailed = entry.parsed === "No changes parsed";
                    return (
                      <div key={entry.id} className="flex gap-3 py-2.5">
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
                  })}
                </div>
              </div>
            )}

            {/* Audio recordings from R2 */}
            {recordings.length > 0 && (
              <div className="rounded-2xl glass-card-solid glow-card overflow-hidden">
                <div className="flex items-center gap-2 border-b border-sand-100/50 px-4 sm:px-5 py-3">
                  <AudioLines className="h-3.5 w-3.5 text-sand-400" />
                  <h3 className="text-[13px] font-bold font-display text-sand-700">Recordings</h3>
                  <span className="ml-auto rounded-md bg-sand-50 border border-sand-100 px-2 py-0.5 text-[10px] font-semibold text-sand-500 tabular-nums">
                    {recordings.length}
                  </span>
                </div>
                <div className="p-3 space-y-2">
                  {recordings.map((rec, i) => (
                    <AudioRecordingPlayer key={rec.key} url={rec.url} label={`Recording ${i + 1}`} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close delete confirmation"
            onClick={() => {
              if (!deletingSession) {
                setShowDeleteConfirm(false);
                setDeleteError(null);
              }
            }}
            className="absolute inset-0 bg-sand-950/35 backdrop-blur-[2px]"
          />

          <div className="relative w-full max-w-md rounded-[24px] glass-card-solid border border-white/70 p-5 sm:p-6 shadow-[0_32px_80px_-28px_rgba(18,22,30,0.35)]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-clay-50 border border-clay-200/70 text-clay-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold font-display text-sand-900">Delete session?</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-sand-500">
                  This will permanently remove the completed session, its voice recordings, and the cached clinical report.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-sand-200/70 bg-white/70 px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-sand-400">Session</p>
              <p className="mt-1 text-[14px] font-semibold text-sand-800">{patientName}</p>
              <p className="text-[12px] text-sand-500">{dateStr}</p>
            </div>

            {deleteError && (
              <div className="mt-4 rounded-xl border border-clay-200 bg-clay-50 px-3 py-2 text-[12px] text-clay-700">
                {deleteError}
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2.5">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteError(null);
                }}
                disabled={deletingSession}
                className="rounded-xl border border-sand-200 bg-white px-4 py-2 text-[13px] font-medium text-sand-600 hover:bg-sand-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={deleteSessionHandler}
                disabled={deletingSession}
                className="flex items-center gap-2 rounded-xl bg-clay-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-clay-600 transition-colors disabled:opacity-50"
              >
                {deletingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
