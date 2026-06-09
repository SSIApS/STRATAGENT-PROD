import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api, setSession } from '../services/api'
import type { Session } from '../App'
import ConvergenceIndex from '../components/FieldIntelligence/ConvergenceIndex'

// Signal type display config
const SIGNAL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  TENDER:            { label: 'Tender',           color: '#7c3aed', bg: '#1e0a45' },
  LEADERSHIP_CHANGE: { label: 'Leadership',        color: '#0ea5e9', bg: '#0c1a2e' },
  CAPEX:             { label: 'CapEx',             color: '#f59e0b', bg: '#1c1400' },
  BUDGET:            { label: 'Budget',            color: '#22c55e', bg: '#071a0e' },
  SUSTAINABILITY:    { label: 'Sustainability',    color: '#10b981', bg: '#031a10' },
  STRATEGIC_SHIFT:   { label: 'Strategic Shift',  color: '#f97316', bg: '#1c0d00' },
  NEWS_EVENT:        { label: 'News',              color: '#94a3b8', bg: '#0f1623' },
  SOCIAL_SIGNAL:     { label: 'Social Signal',    color: '#a855f7', bg: '#1a0a2e' },
}

const STRENGTH_DOT: Record<string, string> = {
  HIGH:   '#22c55e',
  MEDIUM: '#f59e0b',
  LOW:    '#64748b',
}

function BuyingSignals({ signals, approachWindow }: { signals: any[]; approachWindow?: string }) {
  if (!signals || signals.length === 0) return null

  return (
    <div className="p-6 rounded-xl space-y-3"
         style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
          Buying Signals
        </div>
        <div className="text-xs px-2 py-0.5 rounded-full font-semibold"
             style={{ background: '#1c1400', color: 'var(--stratagent-gold)', border: '1px solid #92400e' }}>
          {signals.length} signal{signals.length !== 1 ? 's' : ''} detected
        </div>
      </div>

      {signals.map((signal: any, i: number) => {
        const cfg = SIGNAL_CONFIG[signal.type] || SIGNAL_CONFIG['NEWS_EVENT']
        const dot = STRENGTH_DOT[signal.strength] || STRENGTH_DOT['LOW']
        return (
          <div key={i} className="p-3 rounded-lg"
               style={{ background: cfg.bg, border: `1px solid ${cfg.color}33` }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{ background: cfg.color + '22', color: cfg.color }}>
                {cfg.label}
              </span>
              <span className="flex items-center gap-1 text-xs" style={{ color: '#94a3b8' }}>
                <svg width="8" height="8" viewBox="0 0 8 8">
                  <circle cx="4" cy="4" r="4" fill={dot} />
                </svg>
                {signal.strength}
              </span>
              {signal.timing && (
                <span className="text-xs ml-auto" style={{ color: '#64748b' }}>
                  {signal.timing}
                </span>
              )}
            </div>
            <div className="text-sm" style={{ color: 'var(--stratagent-text)' }}>
              {signal.signal}
            </div>
            {signal.source && (
              <a href={signal.source} target="_blank" rel="noreferrer"
                 className="text-xs mt-1 block underline"
                 style={{ color: '#64748b' }}>
                Source ↗
              </a>
            )}
          </div>
        )
      })}

      {approachWindow && approachWindow !== 'null' && (
        <div className="mt-2 p-3 rounded-lg text-sm"
             style={{ background: '#071a0e', border: '1px solid #166534', color: '#4ade80' }}>
          <span className="font-semibold text-xs uppercase tracking-wider mr-2" style={{ color: '#22c55e' }}>
            Approach Window:
          </span>
          {approachWindow}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Markdown renderer — converts ## headings, **bold**, * bullets to JSX
// Used for output panel display and browser print
// ---------------------------------------------------------------------------
function MarkdownBlock({ text }: { text: string }) {
  const renderInline = (line: string, key: string | number) => {
    const parts = line.split(/(\*\*[^*\n]+\*\*)/)
    return (
      <span key={key}>
        {parts.map((p, j) =>
          p.startsWith('**') && p.endsWith('**')
            ? <strong key={j} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</strong>
            : p
        )}
      </span>
    )
  }

  const elements: React.ReactNode[] = []
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const s = line.trim()

    if (!s || /^[-*_]{3,}$/.test(s)) continue

    if (s.startsWith('## ')) {
      elements.push(<div key={i} style={{ color: '#E87A00', fontWeight: 700, fontSize: '1.05rem', marginTop: '1rem', marginBottom: '0.3rem' }}>{s.slice(3)}</div>)
    } else if (s.startsWith('### ')) {
      elements.push(<div key={i} style={{ color: '#E87A00', fontWeight: 700, fontSize: '0.9rem', marginTop: '0.8rem', marginBottom: '0.2rem' }}>{s.slice(4)}</div>)
    } else if (s.startsWith('#### ')) {
      elements.push(<div key={i} style={{ color: '#E87A00', fontWeight: 600, fontSize: '0.85rem', marginTop: '0.5rem' }}>{s.slice(5)}</div>)
    } else if (/^\s{0,8}[*-]\s/.test(line)) {
      const depth = (line.length - line.trimStart().length) >= 4 ? 1 : 0
      const content = line.replace(/^\s*[*-]\s+/, '')
      elements.push(
        <div key={i} style={{ display: 'flex', gap: '0.5rem', paddingLeft: `${0.5 + depth * 1.2}rem`, marginBottom: '0.15rem' }}>
          <span style={{ color: '#E87A00', flexShrink: 0, marginTop: '0.05rem' }}>•</span>
          <span>{renderInline(content, i)}</span>
        </div>
      )
    } else {
      elements.push(<div key={i} style={{ marginBottom: '0.35rem' }}>{renderInline(s, i)}</div>)
    }
  }

  return <div className="select-all" style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{elements}</div>
}

export default function FieldIntelligence({ session }: { session: Session }) {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [outputLoading, setOutputLoading] = useState(false)
  const [outputResult, setOutputResult] = useState<any>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [includeBuyingSignals, setIncludeBuyingSignals] = useState(false)
  const [includeReasoning, setIncludeReasoning] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [profileHistory, setProfileHistory] = useState<any[]>([])
  const [showProfilePicker, setShowProfilePicker] = useState(false)
  const [researchQueue, setResearchQueue] = useState<any[]>([])
  const [queueActionId, setQueueActionId] = useState<string | null>(null)
  const [synergyFlags, setSynergyFlags] = useState<any[]>([])
  const [synergyLoading, setSynergyLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  setSession(session.sessionId)

  useEffect(() => {
    api.get('/knowledge-base/').then(res => {
      const list = res.data || []
      setSuppliers(list)
      // Pre-fill from router state (STRATASCOUT or STRATADAR promote)
      const state = location.state as { supplier_id?: string; company_name?: string } | null
      if (state?.supplier_id) {
        setSupplierId(state.supplier_id)
        localStorage.setItem('fi_last_supplier', state.supplier_id)
      } else if (!supplierId && list.length === 1) {
        const id = list[0].supplier_id || list[0].id
        setSupplierId(id)
        localStorage.setItem('fi_last_supplier', id)
      }
      if (state?.company_name) {
        setCompanyName(state.company_name)
        localStorage.setItem('fi_last_company', state.company_name)
      }
    }).catch(() => {})
  }, [])

  // When supplier changes, fetch their saved research history (for the picker).
  // We only AUTO-restore a result when STRATASCOUT/STRATADAR explicitly promoted
  // a specific company into FI -- otherwise the form starts blank, and Jason can
  // browse/reopen any past run from the "Past Research" picker below.
  useEffect(() => {
    if (!supplierId) return
    if (result && result.supplier_id === supplierId) return // already showing right supplier
    const promotedCompany = (location.state as any)?.company_name
    api.get('/field-intelligence/profiles/' + supplierId)
      .then(res => {
        const profiles = (res.data || []).slice().sort((a: any, b: any) =>
          (b.updated_at || 0) - (a.updated_at || 0)
        )
        setProfileHistory(profiles)
        if (profiles.length === 0) return
        if (promotedCompany) {
          const match = profiles.find((p: any) => p.company_name === promotedCompany)
          if (match) loadProfileIntoResult(match)
        }
      })
      .catch(() => {})
  }, [supplierId])

  // Load the Retry Queue -- failed research attempts saved so nothing typed is lost
  // when the AI service returns a transient 503 (high demand).
  function refreshResearchQueue() {
    if (!supplierId) return
    api.get('/field-intelligence/research-queue/' + supplierId)
      .then(res => setResearchQueue(res.data || []))
      .catch(() => {})
  }

  useEffect(() => {
    refreshResearchQueue()
  }, [supplierId])

  async function retryQueueEntry(entryId: string) {
    setQueueActionId(entryId)
    try {
      const res = await api.post('/field-intelligence/research-queue/' + entryId + '/retry')
      setResult(res.data)
      refreshResearchQueue()
    } catch (e: any) {
      const detail = e.response?.data?.detail
      alert((detail && detail.message) || detail || 'Retry failed -- still overloaded, try again shortly')
      refreshResearchQueue()
    } finally {
      setQueueActionId(null)
    }
  }

  async function dismissQueueEntry(entryId: string) {
    setQueueActionId(entryId)
    try {
      await api.delete('/field-intelligence/research-queue/' + entryId)
      setResearchQueue(q => q.filter(item => item.id !== entryId))
    } catch {
      refreshResearchQueue()
    } finally {
      setQueueActionId(null)
    }
  }

  function formatQueueDate(value: any): string {
    if (!value) return ''
    try {
      const ms = value > 1e12 ? value : value * 1000
      return new Date(ms).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  function loadProfileIntoResult(p: any) {
    setResult({
      profile_id: p.profile_id,
      company_name: p.company_name,
      convergence_index: p.convergence_index,
      recommended_path: p.recommended_path,
      profile: p.profile,
      supplier_id: p.supplier_id,
      _restored: true,
    })
    setOutputResult(null)
    setCompanyName(p.company_name || '')
    setShowProfilePicker(false)
  }

  function formatProfileDate(value: any): string {
    if (!value) return ''
    try {
      const ms = value > 1e12 ? value : value * 1000
      return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    } catch {
      return ''
    }
  }

  const selectedSupplier = suppliers.find(
    s => (s.supplier_id || s.id) === supplierId
  )

  async function generateOutput() {
    if (!result?.profile_id) return
    setOutputLoading(true)
    setOutputResult(null)
    try {
      const res = await api.post('/output/generate', { profile_id: result.profile_id })
      setOutputResult(res.data)
    } catch (e: any) {
      alert(e.response?.data?.detail?.message || e.response?.data?.detail || 'Output generation failed')
    } finally {
      setOutputLoading(false)
    }
  }

  async function exportBrief() {
    if (!outputResult) return
    setExportLoading(true)
    try {
      const res = await api.post(
        '/output/export',
        {
          profile_id: result?.profile_id || '',
          label: outputResult.label,
          company_name: outputResult.company_name,
          convergence_index: outputResult.convergence_index,
          supplier_name: selectedSupplier?.company_name || '',
          output: outputResult.output,
          include_buying_signals: includeBuyingSignals,
          include_reasoning: includeReasoning,
        },
        { responseType: 'blob' }
      )
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      const cd = res.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      link.download = match ? match[1] : `STRATAGENT_${outputResult.company_name}.docx`
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      // When responseType:'blob', error body is a Blob — read it to show real message
      if (e.response?.data instanceof Blob) {
        const text = await e.response.data.text()
        try {
          const json = JSON.parse(text)
          alert('Export failed: ' + (json.detail || text))
        } catch {
          alert('Export failed: ' + text)
        }
      } else {
        alert('Export failed: ' + (e.response?.data?.detail || e.message || 'unknown error'))
      }
    } finally {
      setExportLoading(false)
    }
  }

  async function research() {
    setLoading(true)
    setSynergyFlags([])
    try {
      const res = await api.post('/field-intelligence/research', {
        supplier_id: supplierId,
        company_name: companyName,
      })
      setResult(res.data)
      // STRATAMESH runs as a background task -- poll for results
      if (res.data?.profile_id) pollSynergy(res.data.profile_id)
    } catch (e: any) {
      const detail = e.response?.data?.detail
      alert((detail && detail.message) || detail || 'Research failed')
      refreshResearchQueue()
    } finally {
      setLoading(false)
    }
  }

  async function pollSynergy(profileId: string, attempts = 0) {
    if (attempts > 8) return  // Give up after ~40s
    setSynergyLoading(true)
    try {
      const res = await api.get('/field-intelligence/synergy/' + profileId)
      if (res.data?.flags?.length > 0) {
        setSynergyFlags(res.data.flags)
        setSynergyLoading(false)
      } else if (res.data?.status === 'pending' || res.data?.flag_count === 0) {
        // Still processing or genuinely no flags -- retry after delay
        setTimeout(() => pollSynergy(profileId, attempts + 1), 5000)
      } else {
        setSynergyLoading(false)
      }
    } catch {
      setSynergyLoading(false)
    }
  }

  const profileRows: [string, string | undefined][] = [
    ['Company Overview', result?.profile?.company_overview],
    ['Operational Context', result?.profile?.operational_context],
    ['Buying Trigger', result?.profile?.buying_trigger],
    ['Active Projects', result?.profile?.active_projects],
    ['Current Suppliers', result?.profile?.current_suppliers],
    ['Recent News', result?.profile?.recent_news],
  ]

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--stratagent-text)' }}>
        Field Intelligence
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--stratagent-muted)' }}>
        Research a prospect. STRATAGENT finds their world, scores alignment, and surfaces buying signals.
      </p>

      {!result ? (
        <div className="p-6 rounded-xl space-y-4"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2"
                   style={{ color: 'var(--stratagent-muted)' }}>
              Selling On Behalf Of
            </label>
            {suppliers.length === 0 ? (
              <div className="px-4 py-3 rounded-lg text-sm"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                No suppliers in Knowledge Base yet -- add one first.
              </div>
            ) : (
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--stratagent-dark)',
                  border: '1px solid var(--stratagent-border)',
                  color: supplierId ? 'var(--stratagent-text)' : 'var(--stratagent-muted)',
                }}
              >
                <option value="" disabled>Select supplier</option>
                {suppliers.map(s => {
                  const depth = s.intelligence_depth?.total != null
                    ? ' -- ' + Math.round(s.intelligence_depth.total) + ' depth'
                    : ''
                  return (
                    <option key={s.supplier_id || s.id} value={s.supplier_id || s.id}>
                      {s.company_name}{depth}
                    </option>
                  )
                })}
              </select>
            )}
            {selectedSupplier && (selectedSupplier.intelligence_depth?.total ?? 0) < 50 && (
              <div className="mt-2 text-xs px-3 py-2 rounded-lg"
                   style={{ background: '#2d1a00', color: '#f59e0b', border: '1px solid #92400e' }}>
                Intelligence Depth is {Math.round(selectedSupplier.intelligence_depth?.total ?? 0)} -- needs 50+ to run Field Intelligence. Add more sources in the Knowledge Base.
              </div>
            )}
          </div>

          {profileHistory.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--stratagent-border)' }}>
              <button
                type="button"
                onClick={() => setShowProfilePicker(s => !s)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                style={{ background: 'var(--stratagent-dark)' }}>
                <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
                  Past Research for {selectedSupplier?.company_name || 'this supplier'}
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs normal-case tracking-normal"
                        style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                    {profileHistory.length} saved
                  </span>
                </span>
                <span className="text-xs" style={{ color: 'var(--stratagent-gold)' }}>
                  {showProfilePicker ? 'Hide' : 'Browse'}
                </span>
              </button>
              {showProfilePicker && (
                <div className="px-3 py-2 space-y-1.5" style={{ background: 'var(--stratagent-panel)' }}>
                  {profileHistory.map((p: any) => (
                    <button
                      key={p.profile_id}
                      type="button"
                      onClick={() => loadProfileIntoResult(p)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-left"
                      style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                      <div>
                        <div className="font-semibold text-sm" style={{ color: 'var(--stratagent-text)' }}>
                          {p.company_name}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                          {formatProfileDate(p.updated_at)}
                        </div>
                      </div>
                      {p.convergence_index != null && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: '#1c1400', color: 'var(--stratagent-gold)', border: '1px solid #92400e' }}>
                          CI {p.convergence_index}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {researchQueue.length > 0 && (
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #92400e' }}>
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#2d1a00' }}>
                <span className="text-xs uppercase tracking-widest" style={{ color: '#f59e0b' }}>
                  Retry Queue -- {researchQueue.length} request{researchQueue.length === 1 ? '' : 's'} saved after AI overload
                </span>
              </div>
              <div className="px-3 py-2 space-y-1.5" style={{ background: 'var(--stratagent-panel)' }}>
                {researchQueue.map((q: any) => (
                  <div key={q.id}
                       className="flex items-center justify-between px-3 py-2 rounded-lg"
                       style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                    <div>
                      <div className="font-semibold text-sm" style={{ color: 'var(--stratagent-text)' }}>
                        {q.company_name}
                      </div>
                      <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                        Last attempt {formatQueueDate(q.last_attempt_at || q.requested_at)} -- {(q.error || '').includes('503') || (q.error || '').toLowerCase().includes('high demand')
                          ? 'AI service overloaded (503)'
                          : 'failed -- ' + (q.error || 'unknown error').slice(0, 80)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => retryQueueEntry(q.id)}
                        disabled={queueActionId === q.id}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40"
                        style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                        {queueActionId === q.id ? 'Retrying...' : 'Retry'}
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissQueueEntry(q.id)}
                        disabled={queueActionId === q.id}
                        className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40"
                        style={{ background: 'transparent', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2"
                   style={{ color: 'var(--stratagent-muted)' }}>
              Prospect Company Name
            </label>
            <input
              value={companyName}
              onChange={e => { setCompanyName(e.target.value); localStorage.setItem('fi_last_company', e.target.value) }}
              onKeyDown={e => {
                if (e.key === 'Enter' && supplierId && companyName && (selectedSupplier?.intelligence_depth?.total ?? 0) >= 50 && !loading) {
                  research()
                }
              }}
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
            disabled={loading || !supplierId || !companyName || (selectedSupplier?.intelligence_depth?.total ?? 0) < 50}
            className="w-full py-3 rounded-lg font-semibold text-sm disabled:opacity-40"
            style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#000" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round"/>
                </svg>
                Researching prospect + scanning for buying signals...
              </span>
            ) : 'Run Field Intelligence'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">

          {/* Result header — current prospect + actions */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl"
               style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
            <div>
              <span className="text-xs uppercase tracking-widest mr-2" style={{ color: 'var(--stratagent-muted)' }}>
                {result._restored ? 'Last Research:' : 'Researched:'}
              </span>
              <span className="font-semibold text-sm" style={{ color: 'var(--stratagent-text)' }}>
                {result.company_name}
              </span>
              {suppliers.find(s => (s.supplier_id || s.id) === result.supplier_id) && (
                <span className="ml-2 text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                  via {suppliers.find(s => (s.supplier_id || s.id) === result.supplier_id)?.company_name}
                </span>
              )}
              <div className="mt-1">
                {result.profile?.website ? (
                  <a href={result.profile.website} target="_blank" rel="noopener noreferrer"
                     className="text-xs hover:underline" style={{ color: 'var(--stratagent-muted)' }}>
                    {result.profile.website.replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>No URL found</span>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setResult(null)
                setOutputResult(null)
                setCompanyName('')
                localStorage.removeItem('fi_last_company')
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-gold)' }}>
              + New Research
            </button>
          </div>

          <ConvergenceIndex
            score={result.convergence_index}
            company={result.company_name}
            reasoning={result.profile?.convergence_index?.reasoning}
            recommendedPath={result.recommended_path}
          />

          {/* Output action — contextual label based on CI */}
          {result.convergence_index >= 60 && !outputResult && (
            <div className="p-4 rounded-xl flex items-center justify-between"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold-dim)' }}>
              <div>
                <div className="text-xs uppercase tracking-widest mb-0.5" style={{ color: 'var(--stratagent-gold)' }}>
                  {result.convergence_index >= 90 ? 'CONVERGENCE PROPOSAL ready' :
                   result.convergence_index >= 75 ? 'MUTUAL VALUE BRIEF ready' :
                   'FIRST SIGNAL ready'}
                </div>
                <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                  {result.convergence_index >= 90 ? 'Email + full technical proposal + RFQ framework' :
                   result.convergence_index >= 75 ? 'Email + value brief + qualifying questions' :
                   'Insight email -- opens the door without walking through it'}
                </div>
              </div>
              <button
                onClick={generateOutput}
                disabled={outputLoading}
                className="ml-4 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40 whitespace-nowrap"
                style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                {outputLoading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="#000" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round"/>
                    </svg>
                    Generating...
                  </span>
                ) : 'Generate'}
              </button>
            </div>
          )}

          {/* Output result panel */}
          {outputResult && (
            <div className="stratagent-print-zone p-6 rounded-xl space-y-5"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold-dim)' }}>

              {/* Screen header — hidden on print (print-header takes over) */}
              <div className="flex items-center justify-between print:hidden">
                <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-gold)' }}>
                  {outputResult.label}
                </div>
                <button
                  onClick={() => setOutputResult(null)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: 'var(--stratagent-muted)', background: 'var(--stratagent-dark)' }}>
                  Clear
                </button>
              </div>

              {/* Print header — only visible when printing */}
              <div className="stratagent-print-header">
                <h1>{outputResult.label}</h1>
                <p>
                  Prospect: {outputResult.company_name} &nbsp;|&nbsp;
                  Supplier: {selectedSupplier?.company_name || ''} &nbsp;|&nbsp;
                  SD: {outputResult.convergence_index}/100 &nbsp;|&nbsp;
                  {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p>Prepared by: Jason L. Smith | Strategic Sales International ApS | jls@strategic.dk</p>
              </div>

              {outputResult.output?.email && (
                <div className="stratagent-print-section">
                  <div className="text-xs font-semibold mb-2 print:hidden" style={{ color: 'var(--stratagent-gold)' }}>Outreach Email</div>
                  <h2>Outreach Email</h2>
                  <div className="rounded-lg p-4"
                       style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)' }}>
                    <MarkdownBlock text={outputResult.output.email} />
                  </div>
                </div>
              )}

              {outputResult.output?.brief && (
                <div className="stratagent-print-section">
                  <div className="text-xs font-semibold mb-2 print:hidden" style={{ color: 'var(--stratagent-gold)' }}>Value Brief</div>
                  <h2>Value Brief</h2>
                  <div className="rounded-lg p-4"
                       style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)' }}>
                    <MarkdownBlock text={outputResult.output.brief} />
                  </div>
                </div>
              )}

              {outputResult.output?.proposal && (
                <div className="stratagent-print-section">
                  <div className="text-xs font-semibold mb-2 print:hidden" style={{ color: 'var(--stratagent-gold)' }}>Technical Proposal</div>
                  <h2>Technical Proposal</h2>
                  <div className="rounded-lg p-4"
                       style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)' }}>
                    <MarkdownBlock text={outputResult.output.proposal} />
                  </div>
                </div>
              )}

              {outputResult.output?.engagement_brief && (
                <div className="stratagent-print-section">
                  <div className="text-xs font-semibold mb-2 print:hidden" style={{ color: 'var(--stratagent-gold)' }}>Engagement Brief / RFQ</div>
                  <h2>Engagement Brief / RFQ Framework</h2>
                  <div className="rounded-lg p-4"
                       style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)' }}>
                    <MarkdownBlock text={outputResult.output.engagement_brief} />
                  </div>
                </div>
              )}

              {outputResult.output?.qualifying_questions?.length > 0 && (
                <div className="stratagent-print-section">
                  <div className="text-xs font-semibold mb-2 print:hidden" style={{ color: 'var(--stratagent-gold)' }}>Qualifying Questions</div>
                  <h2>Qualifying Questions</h2>
                  <div className="rounded-lg p-4"
                       style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)' }}>
                    {outputResult.output.qualifying_questions.map((q: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.6rem', fontSize: '0.875rem' }}>
                        <span style={{ color: '#E87A00', fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                        <span>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Print footer */}
              <div className="stratagent-print-footer">
                <div className="stratagent-print-footer-inner">
                  <img src="/stratagent-logo-standard.png" alt="STRATAGENT" className="stratagent-print-footer-logo" style={{ height: '28px', width: 'auto' }} />
                  <div className="stratagent-print-footer-divider" />
                  <div className="stratagent-print-footer-text">
                    <div>Jason L. Smith &nbsp;·&nbsp; Strategic Sales International ApS &nbsp;·&nbsp; info@strategic.dk &nbsp;·&nbsp; www.strategic-dk.com &nbsp;·&nbsp; +45 24 99 23 93</div>
                    <div>CVR: 41945621 &nbsp;·&nbsp; Roskilde, Denmark &nbsp;·&nbsp; STRATAGENT — The Intelligence Behind Agentic Sales &nbsp;·&nbsp; Confidential</div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 print:hidden" style={{ marginBottom: '0.5rem' }}>
                <label className="text-xs flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--stratagent-text)' }}>
                  <input
                    type="checkbox"
                    checked={includeBuyingSignals}
                    onChange={(e) => setIncludeBuyingSignals(e.target.checked)}
                  />
                  Include Buying Signals in export
                </label>
                <label className="text-xs flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--stratagent-text)' }}>
                  <input
                    type="checkbox"
                    checked={includeReasoning}
                    onChange={(e) => setIncludeReasoning(e.target.checked)}
                  />
                  Include Score Reasoning in export
                </label>
              </div>

              <div className="flex items-center gap-3 print:hidden">
                <button
                  onClick={generateOutput}
                  className="text-xs px-3 py-1.5 rounded font-semibold"
                  style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-gold)' }}>
                  Regenerate
                </button>
                <button
                  onClick={exportBrief}
                  disabled={exportLoading}
                  className="text-xs px-3 py-1.5 rounded font-semibold flex items-center gap-1.5"
                  style={{ background: 'var(--stratagent-gold)', color: '#000', opacity: exportLoading ? 0.6 : 1 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {exportLoading ? 'Exporting...' : 'Export .docx'}
                </button>
                <button
                  onClick={() => {
                    const supplier = selectedSupplier?.company_name || 'SSI'
                    const prospect = outputResult.company_name || 'Prospect'
                    const label = outputResult.label || 'BRIEF'
                    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    const prev = document.title
                    document.title = `STRATAGENT — ${supplier} → ${prospect} — ${label} — ${dateStr}`
                    window.print()
                    document.title = prev
                  }}
                  className="text-xs px-3 py-1.5 rounded font-semibold flex items-center gap-1.5"
                  style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-gold)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9"/>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                    <rect x="6" y="14" width="12" height="8"/>
                  </svg>
                  Print / Save PDF
                </button>
              </div>
            </div>
          )}

          <BuyingSignals
            signals={result.profile?.buying_signals || []}
            approachWindow={result.profile?.approach_window}
          />

          <div className="p-6 rounded-xl space-y-4"
               style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
            <div className="text-xs uppercase tracking-widest mb-2"
                 style={{ color: 'var(--stratagent-muted)' }}>
              Relationship Profile
            </div>
            {profileRows.map(([label, value]) => {
              if (!value) return null
              return (
                <div key={label}>
                  <div className="text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-gold)' }}>
                    {label}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--stratagent-text)' }}>{value}</div>
                </div>
              )
            })}
            {result.profile?.decision_maker?.name && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-gold)' }}>
                  Decision Maker
                </div>
                <div className="text-sm" style={{ color: 'var(--stratagent-text)' }}>
                  {result.profile.decision_maker.name} -- {result.profile.decision_maker.title}
                  {result.profile.decision_maker.linkedin && (
                    <a href={result.profile.decision_maker.linkedin.startsWith('http') ? result.profile.decision_maker.linkedin : 'https://' + result.profile.decision_maker.linkedin}
                       target="_blank" rel="noreferrer"
                       className="ml-2 underline"
                       style={{ color: 'var(--stratagent-blue)' }}>
                      LinkedIn
                    </a>
                  )}
                </div>
              </div>
            )}
            {result.profile?.confidence_notes && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-muted)' }}>
                  Confidence Notes
                </div>
                <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                  {result.profile.confidence_notes}
                </div>
              </div>
            )}
          </div>

          {/* Historical Signal Record */}
          {result.profile?.historical_signals?.length > 0 && (
            <div className="rounded-xl overflow-hidden"
                 style={{ border: '1px solid var(--stratagent-border)' }}>
              <button
                onClick={() => setHistoryExpanded(h => !h)}
                className="w-full flex items-center justify-between px-5 py-3 text-left"
                style={{ background: 'var(--stratagent-panel)' }}>
                <div className="flex items-center gap-3">
                  <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
                    Historical Record
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)' }}>
                    {result.profile.historical_signals.length} past signal{result.profile.historical_signals.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                  {historyExpanded ? 'collapse' : 'expand'}
                </span>
              </button>
              {historyExpanded && (
                <div className="px-5 pb-4 space-y-3 pt-3"
                     style={{ background: 'var(--stratagent-dark)' }}>
                  <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                    Signals older than 18 months. Useful as background context -- not current buying triggers.
                  </p>
                  {result.profile.historical_signals.map((sig: any, i: number) => (
                    <div key={i} className="px-4 py-3 rounded-lg opacity-60"
                         style={{ border: '1px solid var(--stratagent-border)', background: 'var(--stratagent-panel)' }}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded"
                              style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)' }}>
                          {sig.type}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{sig.timing}</span>
                      </div>
                      <div className="text-sm" style={{ color: 'var(--stratagent-muted)' }}>{sig.signal}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result.honest_gate && (
            <div className="p-4 rounded-xl text-sm"
                 style={{ background: '#1c1400', border: '1px solid var(--stratagent-gold-dim)', color: 'var(--stratagent-gold)' }}>
              {result.honest_gate}
            </div>
          )}

          {result.alternatives && result.alternatives.length > 0 && (
            <div className="p-6 rounded-xl space-y-3"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-muted)' }}>
                Stronger Alternatives
              </div>
              {result.alternatives.map((alt: any, i: number) => (
                <div key={i} className="p-3 rounded-lg"
                     style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm" style={{ color: 'var(--stratagent-text)' }}>
                      {alt.company_name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: '#1c1400', color: 'var(--stratagent-gold)' }}>
                      ~{alt.estimated_convergence} CI
                    </span>
                  </div>
                  <div className="text-xs mb-0.5" style={{ color: 'var(--stratagent-muted)' }}>{alt.country}</div>
                  <div className="text-xs" style={{ color: 'var(--stratagent-text)' }}>{alt.reason}</div>
                  {alt.buying_trigger && (
                    <div className="text-xs mt-1" style={{ color: '#f59e0b' }}>⚡ {alt.buying_trigger}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {result.adjacent_opportunities && result.adjacent_opportunities.length > 0 && (
            <div className="p-5 rounded-xl space-y-3"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid #a855f733' }}>
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-widest" style={{ color: '#a855f7' }}>
                  STRATALINK -- Adjacent Opportunities
                </div>
                <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: '#a855f722', color: '#a855f7', border: '1px solid #a855f744' }}>
                  {result.adjacent_opportunities.length} partner{result.adjacent_opportunities.length !== 1 ? 's' : ''}
                </span>
              </div>
              {result.adjacent_opportunities.map((opp: any, i: number) => (
                <div key={i} className="p-3 rounded-lg"
                     style={{ background: '#1a0a2e', border: '1px solid #a855f733' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm" style={{ color: 'var(--stratagent-text)' }}>
                      {opp.partner_name}
                    </span>
                    {opp.commission_rate && (
                      <span className="text-xs" style={{ color: '#a855f7' }}>
                        {opp.commission_rate}% commission
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                    {opp.rationale}
                  </div>
                  {opp.intro_angle && (
                    <div className="text-xs mt-1" style={{ color: '#a855f7' }}>
                      Intro: {opp.intro_angle}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── STRATAMESH -- Cross-Supplier Synergy Flags ── */}
          {(synergyLoading || synergyFlags.length > 0) && (
            <div className="p-5 rounded-xl space-y-3"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid #f59e0b33' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest font-semibold"
                       style={{ color: 'var(--stratagent-gold)' }}>
                    STRATAMESH — Cross-Supplier Opportunities
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                    Other SSI suppliers who may also have a case with this prospect
                  </p>
                </div>
                {synergyLoading && synergyFlags.length === 0 && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                    <span style={{
                      display: 'inline-block', width: '10px', height: '10px',
                      border: '2px solid #f59e0b33', borderTopColor: 'var(--stratagent-gold)',
                      borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                    }} />
                    Scanning...
                  </div>
                )}
                {synergyFlags.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded"
                        style={{ background: '#1c140022', color: 'var(--stratagent-gold)', border: '1px solid #92400e' }}>
                    {synergyFlags.length} match{synergyFlags.length !== 1 ? 'es' : ''}
                  </span>
                )}
              </div>

              {synergyFlags.map((flag: any, i: number) => {
                const scoreColor = flag.score >= 70 ? '#22c55e' : flag.score >= 55 ? '#f59e0b' : '#94a3b8'
                return (
                  <div key={i} className="p-3 rounded-lg flex items-start justify-between gap-3"
                       style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold" style={{ color: 'var(--stratagent-text)' }}>
                          {flag.supplier_name}
                        </span>
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded"
                              style={{ background: scoreColor + '22', color: scoreColor, border: `1px solid ${scoreColor}44` }}>
                          {flag.score}
                        </span>
                      </div>
                      <p className="text-xs" style={{ color: 'var(--stratagent-text)' }}>
                        {flag.rationale}
                      </p>
                      {flag.signal_hook && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                          Hook: {flag.signal_hook}
                        </p>
                      )}
                    </div>
                    <button
                      disabled
                      title="Full cross-supplier brief — on request"
                      className="text-xs px-2 py-1 rounded flex-shrink-0 opacity-40 cursor-not-allowed"
                      style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                      Build Brief
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {result.park_recommendation && (
            <div className="p-4 rounded-xl flex items-start justify-between gap-4"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
              <div className="text-sm" style={{ color: 'var(--stratagent-muted)' }}>
                {result.park_recommendation}
              </div>
              <button
                onClick={() => {
                  const reason = result.park_recommendation || 'Low CI'
                  api.post('/active-watch/park', {
                    supplier_id: supplierId,
                    company_name: result.company_name,
                    profile_id: result.profile_id,
                    reason,
                    trigger_type: 'time',
                    trigger_value: '30',
                  }).then(() => navigate('/active-watch'))
                    .catch(() => alert('Park failed'))
                }}
                className="text-xs px-3 py-1.5 rounded font-semibold whitespace-nowrap"
                style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
              >
                Park in Watch
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
