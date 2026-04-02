/* Shared types matching D1 schema */

export interface Patient {
  id: string;
  name: string;
  date_of_birth: string | null;
  notes: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  patient_id: string;
  status: "active" | "completed";
  summary: string | null;
  session_notes: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Derive two-letter initials from a full name */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/** Deterministic hue class based on patient id */
const hueOptions = [
  "from-clay-400 to-clay-600",
  "from-saffron-400 to-saffron-600",
  "from-voice-400 to-voice-600",
  "from-sand-600 to-sand-800",
  "from-sand-900 to-sand-800",
];

export function getPatientHue(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return hueOptions[Math.abs(hash) % hueOptions.length];
}
