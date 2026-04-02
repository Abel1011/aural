-- VocalChart D1 Schema
-- Global registry of patients and sessions

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date_of_birth TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  summary TEXT,
  session_notes TEXT,
  teeth_data TEXT,
  voice_log TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_patient ON sessions(patient_id);
