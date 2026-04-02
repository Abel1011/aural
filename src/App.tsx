import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import VoiceSession from "./pages/VoiceSession";
import SessionViewer from "./pages/SessionViewer";
import type { Patient } from "./data/types";

function App() {
  const [activePatient, setActivePatient] = useState<Patient | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

  if (viewingSessionId) {
    return (
      <SessionViewer
        sessionId={viewingSessionId}
        onBack={() => setViewingSessionId(null)}
      />
    );
  }

  if (activePatient) {
    return (
      <VoiceSession
        patient={activePatient}
        existingSessionId={activeSessionId}
        onBack={() => {
          setActivePatient(null);
          setActiveSessionId(undefined);
        }}
        onEnd={() => {
          setActivePatient(null);
          setActiveSessionId(undefined);
        }}
      />
    );
  }

  return (
    <Dashboard
      onStartSession={(patient) => {
        setActiveSessionId(undefined);
        setActivePatient(patient);
      }}
      onViewSession={setViewingSessionId}
      onResumeSession={(patient, sessionId) => {
        setActiveSessionId(sessionId);
        setActivePatient(patient);
      }}
    />
  );
}

export default App;
