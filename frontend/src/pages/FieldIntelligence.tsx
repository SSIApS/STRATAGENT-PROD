import React, { useState, useEffect, useRef } from 'react'
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
                {String(signal.strength ?? "")}
              </span>
              {signal.timing && (
                <span className="text-xs ml-auto" style={{ color: '#64748b' }}>
                  {String(signal.timing ?? "")}
                </span>
              )}
            </div>
            <div className="text-sm" style={{ color: 'var(--stratagent-text)' }}>
              {typeof signal.signal === 'string' ? signal.signal : safeStr(signal.signal)}
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
          {typeof approachWindow === 'string' ? approachWindow : safeStr(approachWindow)}
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

// ---------------------------------------------------------------------------
// safeStr -- converts any Gemini field value to a displayable string.
// Gemini occasionally returns arrays or objects for fields typed as strings
// in the prompt (e.g. recent_news as an array of headlines). Without this guard,
// React throws "Objects are not valid as a React child" -> blank white screen.
// ---------------------------------------------------------------------------
function safeStr(v: any): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((x: any) => safeStr(x)).join('; ')
  if (typeof v === 'object') {
    // Try common text keys first
    for (const k of ['text', 'value', 'description', 'content', 'summary']) {
      if (typeof v[k] === 'string' && v[k]) return v[k]
    }
    return JSON.stringify(v)
  }
  return String(v)
}

// ---------------------------------------------------------------------------
// ErrorBoundary -- catches React render errors so Gemini weirdness never
// produces a blank white screen. Shows a dismissable error panel instead.
// ---------------------------------------------------------------------------
class FIErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6 rounded-xl mt-4"
             style={{ background: '#1c0a0a', border: '1px solid #7f1d1d', color: '#fca5a5' }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#ef4444' }}>
            Render Error -- Gemini returned unexpected data
          </div>
          <div className="text-xs mb-3" style={{ color: '#fca5a5' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="text-xs px-3 py-1.5 rounded font-semibold"
            style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef444444' }}>
            Dismiss
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function FieldIntelligence({ session }: { session: Session }) {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState(() => localStorage.getItem('fi_last_supplier') || '')
  const [companyName, setCompanyName] = useState(() => localStorage.getItem('fi_last_company') || '')
  const [prospectUrl, setProspectUrl] = useState(() => localStorage.getItem('fi_last_prospect_url') || '')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [outputLoading, setOutputLoading] = useState(false)
  const [outputResult, setOutputResult] = useState<any>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [channelExportLoading, setChannelExportLoading] = useState(false)
  const [includeBuyingSignals, setIncludeBuyingSignals] = useState(false)
  const [includeReasoning, setIncludeReasoning] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [profileHistory, setProfileHistory] = useState<any[]>([])
  const [showProfilePicker, setShowProfilePicker] = useState(false)
  const [researchQueue, setResearchQueue] = useState<any[]>([])
  const [queueActionId, setQueueActionId] = useState<string | null>(null)
  const [synergyFlags, setSynergyFlags] = useState<any[]>([])
  const [synergyLoading, setSynergyLoading] = useState(false)
  const [productContext, setProductContext] = useState<any>(null)
  const [prospectType, setProspectType] = useState<'auto' | 'b2b_industrial' | 'distribution_channel'>('auto')
  const [geography, setGeography] = useState(() => localStorage.getItem('fi_last_geography') || '')
  const [pamLocked, setPamLocked] = useState(false)
  const autoSearchRef = useRef(false)
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
      const navState = state as any
      if (navState?.product_context) {
        setProductContext(navState.product_context)
      }
      if (navState?.product_context && state?.company_name) {
        setPamLocked(true)
        autoSearchRef.current = true
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

  // Auto-trigger research when navigating from PAM with a locked company target.
  // pamLocked in deps ensures this fires even when supplierId/companyName didn't change
  // (e.g. same supplier was already selected from localStorage before PAM navigate).
  useEffect(() => {
    if (autoSearchRef.current && supplierId && companyName && !loading && !result) {
      autoSearchRef.current = false
      research()
    }
  }, [supplierId, companyName, pamLocked])

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
        prospect_type: prospectType,
        ...(productContext ? { product_context: productContext } : {}),
        ...(geography.trim() ? { geography: geography.trim() } : {}),
        ...(prospectUrl.trim() ? { prospect_url: prospectUrl.trim() } : {}),
      })
      setResult(res.data)
      // STRATAMESH runs as a background task -- poll for results
      if (res.data?.profile_id) pollSynergy(res.data.profile_id)
    } catch (e: any) {
      const detail = e.response?.data?.detail
      const status = e.response?.status
      const msg = (detail && detail.message) || detail ||
        (e.response ? `HTTP ${status}: ${JSON.stringify(e.response.data).slice(0, 200)}` : `Network error: ${e.message}`)
      alert(msg)
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
      {/* ── Module identity ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5">
        <div style={{ width: 3, height: 18, borderRadius: 2, background: '#38bdf8', flexShrink: 0 }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#38bdf8' }}>
          FIELD INTELLIGENCE
        </span>
      </div>
      <h2 className="text-2xl font-black mb-1" style={{ color: '#38bdf8' }}>
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
                onChange={e => { setSupplierId(e.target.value); localStorage.setItem('fi_last_supplier', e.target.value) }}
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
            {selectedSupplier && (() => {
              const d = Math.round(selectedSupplier.intelligence_depth?.total ?? 0)
              if (d < 20) return (
                <div className="mt-2 text-xs px-3 py-2 rounded-lg"
                     style={{ background: '#1c0a0a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
                  Intelligence Depth is {d} — needs at least 20 to run. Add basic supplier info in the Knowledge Base first.
                </div>
              )
              if (d < 50) return (
                <div className="mt-2 text-xs px-3 py-2 rounded-lg"
                     style={{ background: '#2d1a00', color: '#f59e0b', border: '1px solid #92400e' }}>
                  Intelligence Depth is {d}/100 — results will be limited. Useful for demonstrating how richer supplier data improves output. Enrich the KB and run again to compare.
                </div>
              )
              return null
            })()}
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

          {/* PAM Product Context Banner -- shown when FI is launched from Product Analysis Module */}
          {productContext && (
            <div className="rounded-lg px-4 py-3"
                 style={{ background: '#0e2a0e', border: '1px solid #22c55e' }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest mb-1"
                       style={{ color: '#22c55e' }}>
                    Product Context Active
                  </div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--stratagent-text)' }}>
                    {productContext.product_name || 'Product'}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                    Archetype: {productContext.archetype || '--'}
                    {productContext.signals?.length ? ` · ${productContext.signals.length} buying signals injected into prompt` : ''}
                  </div>
                  {!supplierId && (
                    <div className="mt-2 text-xs font-semibold" style={{ color: '#fbbf24' }}>
                      Select a supplier above to run research
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setProductContext(null)}
                  className="text-xs px-2 py-1 rounded"
                  style={{ background: 'transparent', color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)', flexShrink: 0 }}>
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Research Mode Selector -- hidden when PAM has locked the target (always B2B) */}
          {!pamLocked && (
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2"
                   style={{ color: 'var(--stratagent-muted)' }}>
              Research Mode
            </label>
            <div className="grid grid-cols-3 gap-1 p-1 rounded-lg"
                 style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
              {([
                { value: 'auto',                  label: 'Auto-Detect',       hint: 'Reads KB type' },
                { value: 'b2b_industrial',         label: 'B2B Industrial',    hint: 'Prospect research' },
                { value: 'distribution_channel',   label: 'Channel Research',  hint: 'Platform / retailer' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setProspectType(opt.value)}
                  className="flex flex-col items-center py-2 px-1 rounded-md text-center transition-all"
                  style={{
                    background: prospectType === opt.value ? 'var(--stratagent-panel)' : 'transparent',
                    border: prospectType === opt.value ? '1px solid var(--stratagent-gold)' : '1px solid transparent',
                    color: prospectType === opt.value ? 'var(--stratagent-gold)' : 'var(--stratagent-muted)',
                  }}>
                  <span className="text-xs font-semibold">{opt.label}</span>
                  <span className="text-xs opacity-60 mt-0.5">{opt.hint}</span>
                </button>
              ))}
            </div>
            {prospectType === 'distribution_channel' && (
              <p className="text-xs mt-2 px-1" style={{ color: '#7dd3fc' }}>
                Channel mode evaluates a specific platform or retailer (e.g. Etsy, Society6, Amazon Handmade) for
                audience fit, saturation headroom, margin potential, and commercial openness. Enter the channel name below.
              </p>
            )}
          </div>
          )}

          {/* Company name -- locked badge when PAM-sourced, normal input otherwise */}
          {pamLocked && prospectType !== 'distribution_channel' ? (
            <div>
              <label className="block text-xs uppercase tracking-widest mb-2"
                     style={{ color: 'var(--stratagent-muted)' }}>
                PAM Target
              </label>
              <div className="flex items-center justify-between px-4 py-3 rounded-lg"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid #22c55e' }}>
                <div className="flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span className="text-sm font-semibold" style={{ color: 'var(--stratagent-text)' }}>{companyName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setPamLocked(false); setResult(null); setOutputResult(null); setProductContext(null); setCompanyName(''); localStorage.removeItem('fi_last_company') }}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)', background: 'transparent' }}>
                  New Search
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs uppercase tracking-widest mb-2"
                     style={{ color: 'var(--stratagent-muted)' }}>
                {prospectType === 'distribution_channel' ? 'Channel / Platform Name' : 'Prospect Company Name'}
              </label>
              <input
                value={companyName}
                onChange={e => { setCompanyName(e.target.value); localStorage.setItem('fi_last_company', e.target.value) }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && supplierId && companyName && (selectedSupplier?.intelligence_depth?.total ?? 0) >= 20 && !loading) {
                    research()
                  }
                }}
                placeholder={prospectType === 'distribution_channel' ? 'e.g. Etsy, Society6, Amazon Handmade' : 'e.g. Equinor ASA'}
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--stratagent-dark)',
                  border: '1px solid var(--stratagent-border)',
                  color: 'var(--stratagent-text)',
                }}
              />
            </div>
          )}

          {/* Prospect URL -- anchors Gemini to official site, prevents identity hallucination */}
          {prospectType !== 'distribution_channel' && (
            <div>
              <label className="block text-xs uppercase tracking-widest mb-2"
                     style={{ color: 'var(--stratagent-muted)' }}>
                Prospect Website URL <span style={{ color: 'var(--stratagent-gold)', fontWeight: 400 }}>(recommended)</span>
              </label>
              <input
                value={prospectUrl}
                onChange={e => { setProspectUrl(e.target.value); localStorage.setItem('fi_last_prospect_url', e.target.value) }}
                placeholder="e.g. https://www.co-ro.com"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--stratagent-dark)',
                  border: '1px solid var(--stratagent-border)',
                  color: 'var(--stratagent-text)',
                }}
              />
              <div className="text-xs mt-1.5" style={{ color: 'var(--stratagent-muted)' }}>
                Providing the URL forces STRATAGENT to read the official site first — prevents misidentification.
              </div>
            </div>
          )}

          {/* Geography scope -- limits research to a specific region */}
          {prospectType !== 'distribution_channel' && (
            <div>
              <label className="block text-xs uppercase tracking-widest mb-2"
                     style={{ color: 'var(--stratagent-muted)' }}>
                Geographic Focus
              </label>
              <input
                value={geography}
                onChange={e => { setGeography(e.target.value); localStorage.setItem('fi_last_geography', e.target.value) }}
                placeholder="e.g. Denmark, Scandinavia, Northern Europe"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--stratagent-dark)',
                  border: '1px solid var(--stratagent-border)',
                  color: 'var(--stratagent-text)',
                }}
              />
              <p className="text-xs mt-1 px-1" style={{ color: 'var(--stratagent-muted)' }}>
                Prioritises companies in this region. Leave blank to use supplier location.
              </p>
            </div>
          )}

          <button
            onClick={research}
            disabled={loading || !supplierId || !companyName || (selectedSupplier?.intelligence_depth?.total ?? 0) < 20}
            className="w-full py-3 rounded-lg font-semibold text-sm disabled:opacity-40"
            style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#000" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round"/>
                </svg>
                {prospectType === 'distribution_channel' ? 'Evaluating channel across 6 dimensions...' : 'Researching prospect + scanning for buying signals...'}
              </span>
            ) : prospectType === 'distribution_channel' ? 'Run Channel Deep-Dive' : 'Run Field Intelligence'}
          </button>
        </div>
      ) : (
        <FIErrorBoundary>
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
                setProspectUrl('')
                localStorage.removeItem('fi_last_prospect_url')
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

          {/* Channel Deep-Dive results -- only shown for distribution_channel research */}
          {result.prospect_type === 'distribution_channel' && result.profile && (() => {
            const ch = result.profile
            // Backend returns dimensions as top-level keys with {score, reasoning} shape
            const dimKeys = ['audience_fit','saturation_headroom','channel_health','margin_potential','commercial_openness','trend_momentum']
            const scoring: Record<string, number> = {}
            for (const k of dimKeys) {
              const v = (ch as any)[k]
              if (v !== undefined) scoring[k] = typeof v === 'object' ? (v.score ?? 50) : Number(v)
            }
            const pathLabel: string = result.recommended_path || ''
            const pathColor = pathLabel.includes('CHANNEL_PITCH') ? '#22c55e'
              : pathLabel.includes('EXPLORE') ? 'var(--stratagent-gold)'
              : pathLabel.includes('MONITOR') ? '#f59e0b'
              : '#ef4444'
            const dimLabels: Record<string, string> = {
              audience_fit:        'Audience Fit (25%)',
              saturation_headroom: 'Saturation Headroom (25%)',
              channel_health:      'Channel Health (20%)',
              margin_potential:    'Margin Potential (15%)',
              commercial_openness: 'Commercial Openness (15%)',
              trend_momentum:      'Trend Momentum (bonus)',
            }
            return (
              <>
              <div className="space-y-4">

                {/* Path label badge */}
                <div className="flex items-center gap-3 p-4 rounded-xl"
                     style={{ background: 'var(--stratagent-panel)', border: `1px solid ${pathColor}` }}>
                  <div className="text-xs font-bold tracking-widest uppercase px-3 py-1.5 rounded-lg"
                       style={{ background: pathColor, color: pathColor === '#22c55e' ? '#000' : pathLabel.includes('MONITOR') ? '#000' : '#fff' }}>
                    {pathLabel.replace(/_/g, ' ')}
                  </div>
                  <div>
                    <div className="text-xs font-semibold" style={{ color: 'var(--stratagent-text)' }}>
                      {result.company_name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                      Convergence Index: {result.convergence_index}/100
                    </div>
                  </div>
                </div>

                {/* 6-dimension channel scoring */}
                {Object.keys(scoring).length > 0 && (
                  <div className="p-5 rounded-xl space-y-3"
                       style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                    <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
                      Channel Scoring — 6 Dimensions
                    </div>
                    {Object.entries(scoring).map(([dim, data]: [string, number]) => {
                      const score = data
                      const barColor = score >= 70 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'
                      return (
                        <div key={dim}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                              {dimLabels[dim] || dim.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs font-bold" style={{ color: barColor }}>{score}</span>
                          </div>
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--stratagent-dark)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: barColor }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Approach Strategy */}
                {ch.approach_strategy && (
                  <div className="p-5 rounded-xl"
                       style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-muted)' }}>Approach Strategy</div>
                    <div className="text-sm" style={{ color: 'var(--stratagent-text)' }}>{safeStr(ch.approach_strategy)}</div>
                  </div>
                )}

                {/* Key Requirements */}
                {Array.isArray(ch.key_requirements) && ch.key_requirements.length > 0 && (
                  <div className="p-5 rounded-xl"
                       style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                    <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>Key Requirements</div>
                    <div className="space-y-1.5">
                      {ch.key_requirements.map((req: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--stratagent-text)' }}>
                          <span style={{ color: 'var(--stratagent-gold)', flexShrink: 0 }}>▸</span>
                          <span>{safeStr(req)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Priority Actions */}
                {Array.isArray(ch.priority_actions) && ch.priority_actions.length > 0 && (
                  <div className="p-5 rounded-xl"
                       style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold-dim)' }}>
                    <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-gold)' }}>Priority Actions</div>
                    <div className="space-y-2">
                      {ch.priority_actions.map((action: string, i: number) => (
                        <div key={i} className="flex items-start gap-2.5 text-sm" style={{ color: 'var(--stratagent-text)' }}>
                          <span className="flex-shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold"
                                style={{ background: 'var(--stratagent-gold)', color: '#000', marginTop: '1px' }}>
                            {i + 1}
                          </span>
                          <span>{safeStr(action)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* Export Channel Brief .docx */}
              <div className="flex items-center gap-3 mt-2">
                <button
                  disabled={channelExportLoading}
                  onClick={async () => {
                    setChannelExportLoading(true)
                    try {
                      const scoreTable = Object.entries(scoring)
                        .map(([k, v]) => `| ${dimLabels[k] ?? k} | ${v}/100 |`)
                        .join('\n')
                      const brief = [
                        `# Channel Deep-Dive: ${result.company_name}`,
                        ``,
                        `**Recommended Path:** ${pathLabel.replace(/_/g, ' ')}  `,
                        `**Convergence Index:** ${result.convergence_index}/100`,
                        ``,
                        `## Scoring`,
                        `| Dimension | Score |`,
                        `|-----------|-------|`,
                        scoreTable,
                        ``,
                        ch.approach_strategy ? `## Approach Strategy\n\n${safeStr(ch.approach_strategy)}` : '',
                        Array.isArray(ch.key_requirements) && ch.key_requirements.length ? `## Key Requirements\n\n${(ch.key_requirements as any[]).map((r: any) => `- ${safeStr(r)}`).join('\n')}` : '',
                        Array.isArray(ch.priority_actions) && ch.priority_actions.length ? `## Priority Actions\n\n${(ch.priority_actions as any[]).map((a: any, i: number) => `${i + 1}. ${safeStr(a)}`).join('\n')}` : '',
                      ].filter(Boolean).join('\n\n')
                      const res = await api.post(
                        `/output-engine/export-channel-brief/${supplierId}`,
                        { brief, channel_name: result.company_name },
                        { responseType: 'blob' }
                      )
                      const url = window.URL.createObjectURL(new Blob([res.data]))
                      const link = document.createElement('a')
                      link.href = url
                      const cd = res.headers['content-disposition'] || ''
                      const match = cd.match(/filename="?([^"]+)"?/)
                      link.download = match ? match[1] : `STRATAGENT_Channel_Brief_${result.company_name}.docx`
                      link.click()
                      window.URL.revokeObjectURL(url)
                    } catch (e: any) {
                      if (e.response?.data instanceof Blob) {
                        const text = await e.response.data.text()
                        try { alert('Export failed: ' + JSON.parse(text).detail) } catch { alert('Export failed: ' + text) }
                      } else {
                        alert('Export failed: ' + (e.response?.data?.detail || e.message || 'unknown error'))
                      }
                    } finally {
                      setChannelExportLoading(false)
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2"
                  style={{ background: channelExportLoading ? '#a18a00' : 'var(--stratagent-gold)', color: '#000', opacity: channelExportLoading ? 0.7 : 1, cursor: channelExportLoading ? 'wait' : 'pointer' }}>
                  {channelExportLoading ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                  )}
                  {channelExportLoading ? 'Exporting...' : 'Export .docx'}
                </button>
              </div>
              </>
            )
          })()}

          {/* Output action — contextual label based on CI (B2B only) */}
          {result.prospect_type !== 'distribution_channel' && result.convergence_index >= 60 && !outputResult && (
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

              {Array.isArray(outputResult.output?.qualifying_questions) && outputResult.output.qualifying_questions.length > 0 && (
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

          {result.prospect_type !== 'distribution_channel' && (
            <BuyingSignals
              signals={result.profile?.buying_signals || []}
              approachWindow={result.profile?.approach_window}
            />
          )}

          <div className="p-6 rounded-xl space-y-4"
               style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
            <div className="text-xs uppercase tracking-widest mb-2"
                 style={{ color: 'var(--stratagent-muted)' }}>
              Relationship Profile
            </div>
            {profileRows.map(([label, value]) => {
              const display = safeStr(value)
              if (!display) return null
              return (
                <div key={label}>
                  <div className="text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-gold)' }}>
                    {label}
                  </div>
                  <div className="text-sm" style={{ color: 'var(--stratagent-text)' }}>{display}</div>
                </div>
              )
            })}
            {result.profile?.decision_maker?.name && (
              <div>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-gold)' }}>
                  Decision Maker
                </div>
                <div className="text-sm" style={{ color: 'var(--stratagent-text)' }}>
                  {safeStr(result.profile.decision_maker.name)} -- {safeStr(result.profile.decision_maker.title)}
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
                  {safeStr(result.profile.confidence_notes)}
                </div>
              </div>
            )}
          </div>

          {/* Historical Signal Record */}
          {Array.isArray(result.profile?.historical_signals) && result.profile.historical_signals.length > 0 && (
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
                          {safeStr(sig.type)}
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
              {safeStr(result.honest_gate)}
            </div>
          )}

          {Array.isArray(result.alternatives) && result.alternatives.length > 0 && (
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
                      {safeStr(alt.company_name)}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: '#1c1400', color: 'var(--stratagent-gold)' }}>
                      ~{alt.estimated_convergence} CI
                    </span>
                  </div>
                  <div className="text-xs mb-0.5" style={{ color: 'var(--stratagent-muted)' }}>{safeStr(alt.country)}</div>
                  <div className="text-xs" style={{ color: 'var(--stratagent-text)' }}>{safeStr(alt.reason)}</div>
                  {alt.buying_trigger && (
                    <div className="text-xs mt-1" style={{ color: '#f59e0b' }}>⚡ {safeStr(alt.buying_trigger)}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {Array.isArray(result.adjacent_opportunities) && result.adjacent_opportunities.length > 0 && (
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
                      {safeStr(opp.partner_name)}
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
                        {safeStr(flag.rationale)}
                      </p>
                      {flag.signal_hook && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                          Hook: {safeStr(flag.signal_hook)}
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
                {safeStr(result.park_recommendation)}
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
        </FIErrorBoundary>
      )}
    </div>
  )
}
