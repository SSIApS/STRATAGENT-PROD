import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setSession } from '../services/api'
import type { Session } from '../App'
import ConvergenceIndex from '../components/FieldIntelligence/ConvergenceIndex'

export default function FieldIntelligence({ session }: { session: Session }) {
  const [supplierId, setSupplierId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const navigate = useNavigate()

  setSession(session.sessionId)

  async function research() {
    setLoading(true)
    try {
      const res = await api.post('/field-intelligence/research', {
        supplier_id: supplierId,
        company_name: companyName,
      })
      setResult(res.data)
    } catch (e: any) {
      alert(e.response?.data?.detail?.message || e.response?.data?.detail || 'Research failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--stratagent-text)' }}>
        Field Intelligence
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--stratagent-muted)' }}>
        Research a prospect. STRATAGENT finds their world, scores alignment, and tells you exactly how to approach them.
      </p>

      {!result ? (
        <div className="p-6 rounded-xl space-y-4"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2"
                   style={{ color: 'var(--stratagent-muted)' }}>
              Supplier ID (from Knowledge Base)
            </label>
            <input
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              placeholder="Paste supplier ID"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--stratagent-dark)',
                border: '1px solid var(--stratagent-border)',
                color: 'var(--stratagent-text)',
              }}
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2"
                   style={{ color: 'var(--stratagent-muted)' }}>
              Prospect Company Name
            </label>
            <input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Equinor ASA"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--stratagent-dark)',
                border: '1px solid var(--stratagent-border)',
                color: 'var(--stratagent-text)',
              }}
            />
          </div>
          <button
            onClick={research}
            disabled={loading || !supplierId || !companyName}
            className="w-full py-3 rounded-lg font-semibold text-sm disabled:opacity-40"
            style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            {loading ? 'Researching prospect...' : 'Run Field Intelligence'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <ConvergenceIndex
            score={result.convergence_index}
            company={result.company_name}
            reasoning={result.profile?.convergence_index?.reasoning}
            recommendedPath={result.recommended_path}
          />

          {/* Relationship Profile */}
          <div className="p-6 rounded-xl space-y-4"
               style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
            <div className="text-xs uppercase tracking-widest mb-2"
                 style={{ color: 'var(--stratagent-muted)' }}>
              Relationship Profile
            </div>
            {[
              ['Company Overview', result.profile?.company_overview],
              ['Operational Context', result.profile?.operational_context],
              ['Buying Trigger', result.profile?.buying_trigger],
              ['Active Projects', result.profile?.active_projects],
              ['Recent News', result.profile?.recent_news],
            ].map(([label, value]) => value && (
              <div key={label as string}>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-gold)' }}>
                  {label}
                </div>
                <div className="text-sm" style={{ color: 'var(--stratagent-text)' }}>{value}</div>
              </div>
            ))}

            {result.profile?.decision_maker?.name && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-gold)' }}>
                  Decision Maker
                </div>
                <div className="text-sm" style={{ color: 'var(--stratagent-text)' }}>
                  {result.profile.decision_maker.name} · {result.profile.decision_maker.title}
                  {result.profile.decision_maker.linkedin && (
                    <a href={result.profile.decision_maker.linkedin}
                       target="_blank" rel="noreferrer"
                       className="ml-2 underline"
                       style={{ color: 'var(--stratagent-blue)' }}>
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Honest gate */}
          {result.honest_gate && (
            <div className="p-4 rounded-xl text-sm"
                 style={{ background: '#1c1400', border: '1px solid var(--stratagent-gold-dim)', color: 'var(--stratagent-gold)' }}>
              {result.honest_gate}
            </div>
          )}

          {/* Generate output */}
          {result.convergence_index >= 60 && (
            <button
              onClick={() => navigate(`/output/${result.profile_id}`)}
              className="w-full py-3 rounded-lg font-semibold text-sm"
              style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              Generate {result.recommended_path?.replace('_', ' ')} →
            </button>
          )}

          <button onClick={() => setResult(null)}
                  className="w-full py-2 rounded-lg text-sm"
                  style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
            Research Another Prospect
          </button>
        </div>
      )}
    </div>
  )
}
