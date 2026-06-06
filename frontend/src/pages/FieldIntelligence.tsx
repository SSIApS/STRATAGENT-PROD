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

export default function FieldIntelligence({ session }: { session: Session }) {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState(() =>
    localStorage.getItem('fi_last_supplier') || ''
  )
  const [companyName, setCompanyName] = useState(() =>
    localStorage.getItem('fi_last_company') || ''
  )
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [outputLoading, setOutputLoading] = useState(false)
  const [outputResult, setOutputResult] = useState<any>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(false)
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

  // When supplier changes, load their most recent FI result
  useEffect(() => {
    if (!supplierId) return
    localStorage.setItem('fi_last_supplier', supplierId)
    if (result && result.supplier_id === supplierId) return // already showing right supplier
    // If router state promoted a specific company, don't restore a different old result
    const promotedCompany = (location.state as any)?.company_name
    api.get('/field-intelligence/profiles/' + supplierId)
      .then(res => {
        const profiles = res.data || []
        if (profiles.length > 0) {
          // Most recent first
          const latest = profiles.sort((a: any, b: any) =>
            (b.updated_at || 0) - (a.updated_at || 0)
          )[0]
          // Don't restore old result if a new company was promoted into FI
          if (promotedCompany && latest.company_name !== promotedCompany) return
          // Map stored profile to result format
          setResult({
            profile_id: latest.profile_id,
            company_name: latest.company_name,
            convergence_index: latest.convergence_index,
            recommended_path: latest.recommended_path,
            profile: latest.profile,
            supplier_id: latest.supplier_id,
            _restored: true,
          })
          setCompanyName(latest.company_name || '')
        }
      })
      .catch(() => {})
  }, [supplierId])

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
                  <pre className="text-sm whitespace-pre-wrap rounded-lg p-4 select-all"
                       style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)', fontFamily: 'inherit' }}>
                    {outputResult.output.email}
                  </pre>
                </div>
              )}

              {outputResult.output?.brief && (
                <div className="stratagent-print-section">
                  <div className="text-xs font-semibold mb-2 print:hidden" style={{ color: 'var(--stratagent-gold)' }}>Value Brief</div>
                  <h2>Value Brief</h2>
                  <pre className="text-sm whitespace-pre-wrap rounded-lg p-4 select-all"
                       style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)', fontFamily: 'inherit' }}>
                    {outputResult.output.brief}
                  </pre>
                </div>
              )}

              {outputResult.output?.proposal && (
                <div className="stratagent-print-section">
                  <div className="text-xs font-semibold mb-2 print:hidden" style={{ color: 'var(--stratagent-gold)' }}>Technical Proposal</div>
                  <h2>Technical Proposal</h2>
                  <pre className="text-sm whitespace-pre-wrap rounded-lg p-4 select-all"
                       style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)', fontFamily: 'inherit' }}>
                    {outputResult.output.proposal}
                  </pre>
                </div>
              )}

              {outputResult.output?.engagement_brief && (
                <div className="stratagent-print-section">
                  <div className="text-xs font-semibold mb-2 print:hidden" style={{ color: 'var(--stratagent-gold)' }}>Engagement Brief / RFQ</div>
                  <h2>Engagement Brief / RFQ Framework</h2>
                  <pre className="text-sm whitespace-pre-wrap rounded-lg p-4 select-all"
                       style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)', fontFamily: 'inherit' }}>
                    {outputResult.output.engagement_brief}
                  </pre>
                </div>
              )}

              {outputResult.output?.qualifying_questions?.length > 0 && (
                <div className="stratagent-print-section">
                  <div className="text-xs font-semibold mb-2 print:hidden" style={{ color: 'var(--stratagent-gold)' }}>Qualifying Questions</div>
                  <h2>Qualifying Questions</h2>
                  <div className="space-y-2">
                    {outputResult.output.qualifying_questions.map((q: string, i: number) => (
                      <div key={i} className="text-sm px-4 py-2 rounded-lg"
                           style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)' }}>
                        {i + 1}. {q}
                      </div>
                    ))}
                  </div>
                  <ol className="stratagent-print-section" style={{ display: 'none' }}>
                    {outputResult.output.qualifying_questions.map((q: string, i: number) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ol>
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

              <div className="flex items-center gap-3 print:hidden">
                <button
                  onClick={generateOutput}
                  className="text-xs px-3 py-1.5 rounded font-semibold"
                  style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-gold)' }}>
                  Regenerate
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
                  style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
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
