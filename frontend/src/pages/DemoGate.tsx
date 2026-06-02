import { useState } from 'react'
import { api } from '../services/api'
import type { Session } from '../App'

export default function DemoGate({ onAuthenticated }: { onAuthenticated: (s: Session) => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth', { password })
      onAuthenticated({
        sessionId: res.data.session_id,
        actionsRemaining: res.data.actions_remaining,
      })
    } catch {
      setError('Invalid password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center"
         style={{ background: 'var(--stratagent-dark)' }}>

      {/* Logo mark */}
      <div className="mb-8 text-center">
        <div className="text-5xl font-black tracking-tighter mb-2"
             style={{ color: 'var(--stratagent-gold)' }}>
          STRATAGENT
        </div>
        <div style={{ color: 'var(--stratagent-muted)' }} className="text-sm tracking-widest uppercase">
          The Intelligence Behind Agentic Sales
        </div>
      </div>

      {/* Auth card */}
      <form onSubmit={handleSubmit}
            className="w-full max-w-sm rounded-xl p-8"
            style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>

        <div className="mb-6">
          <label className="block text-xs uppercase tracking-widest mb-2"
                 style={{ color: 'var(--stratagent-muted)' }}>
            Access Code
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter access code"
            className="w-full px-4 py-3 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--stratagent-dark)',
              border: '1px solid var(--stratagent-border)',
              color: 'var(--stratagent-text)',
            }}
            autoFocus
          />
          {error && (
            <p className="mt-2 text-xs" style={{ color: 'var(--stratagent-red)' }}>{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-40"
          style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
          {loading ? 'Authenticating...' : 'Enter STRATAGENT'}
        </button>
      </form>

      {/* Footer */}
      <div className="mt-12 text-center text-xs" style={{ color: 'var(--stratagent-muted)' }}>
        Strategic Sales International ApS · Roskilde, Denmark<br />
        Gemini XPRIZE 2026
      </div>
    </div>
  )
}
