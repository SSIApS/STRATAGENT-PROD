import { Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import DemoGate from './pages/DemoGate'
import Dashboard from './pages/Dashboard'
import KnowledgeBase from './pages/KnowledgeBase'
import FieldIntelligence from './pages/FieldIntelligence'
import ActiveWatch from './pages/ActiveWatch'
import OutputEngine from './pages/OutputEngine'
import Layout from './components/shared/Layout'

export interface Session {
  sessionId: string
  actionsRemaining: number
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)

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
        <Route path="/output/:profileId" element={<OutputEngine session={session} />} />
      </Routes>
    </Layout>
  )
}
