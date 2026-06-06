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
      setError('Invalid access code.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center"
         style={{ background: '#0a0a0f' }}>

      <div className="mb-8 text-center">
        <img
          src="/stratagent-logo.png"
          alt="STRATAGENT — The Intelligence Behind Agentic Sales"
          style={{ width: '360px', maxWidth: '88vw', margin: '0 auto' }}
        />
      </div>

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
            disabled={loading}
          />
          {error && (
            <p className="mt-2 text-xs" style={{ color: '#ef4444' }}>{error}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !password}
          className="w-full py-3 rounded-lg font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" style={{ color: '#000' }}
                   xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                        stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Authenticating...
            </>
          ) : (
            'Enter STRATAGENT'
          )}
        </button>

        {loading && (
          <p className="mt-4 text-xs text-center" style={{ color: 'var(--stratagent-muted)' }}>
            Connecting to intelligence layer...
          </p>
        )}
      </form>

      <div className="mt-12 text-center text-xs" style={{ color: 'var(--stratagent-muted)' }}>
        Strategic Sales International ApS &middot; Roskilde, Denmark<br />
        Gemini XPRIZE 2026
      </div>
    </div>
  )
}
