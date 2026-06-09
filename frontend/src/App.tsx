import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import DemoGate from './pages/DemoGate'
import Dashboard from './pages/Dashboard'
import KnowledgeBase from './pages/KnowledgeBase'
import FieldIntelligence from './pages/FieldIntelligence'
import ActiveWatch from './pages/ActiveWatch'
import OutputEngine from './pages/OutputEngine'
import StratAScout from './pages/StratAScout'
import StratALink from './pages/StratALink'
import Strategist from './pages/Strategist'
import Layout from './components/shared/Layout'

export interface Session {
  sessionId: string
  actionsRemaining: number
}

// Local-dev / automation bypass for the demo access-code gate.
// Set VITE_SKIP_DEMO_GATE=true in a local .env to skip the lock screen
// (e.g. for the scheduled Active Watch scan, which opens a fresh,
// unauthenticated browser tab every morning). Supplies a stand-in session —
// the backend auto-creates a Firestore demo_sessions doc for any session id
// it hasn't seen, so this works exactly like a real login.
const AUTO_SESSION: Session = { sessionId: 'local-automation-session', actionsRemaining: 999999 }

export default function App() {
  const skipGate = import.meta.env.VITE_SKIP_DEMO_GATE === 'true'
  const [session, setSession] = useState<Session | null>(skipGate ? AUTO_SESSION : null)

  if (!session) {
    return <DemoGate onAuthenticated={setSession} />
  }

  return (
    <Layout session={session} onSessionUpdate={setSession}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard session={session} />} />
        <Route path="/knowledge-base" element={<KnowledgeBase session={session} />} />
        <Route path="/knowledge-base/:supplierId" element={<KnowledgeBase session={session} />} />
        <Route path="/field-intelligence" element={<FieldIntelligence session={session} />} />
        <Route path="/active-watch" element={<ActiveWatch session={session} />} />
        <Route path="/stratascout" element={<StratAScout session={session} />} />
        <Route path="/output" element={<OutputEngine session={session} />} />
        <Route path="/stratalink" element={<StratALink session={session} />} />
        <Route path="/strategist" element={<Strategist session={session} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  )
}
