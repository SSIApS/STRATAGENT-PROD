import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setSession } from '../services/api'
import type { Session } from '../App'

const MODULE_COLOUR: Record<string, string> = {
  KB:         '#f59e0b',
  FI:         '#0ea5e9',
  WATCH:      '#7c3aed',
  OUTPUT:     '#22c55e',
  SCOUT:      '#f97316',
  STRATALINK: '#a855f7',
}

const EFFORT_COLOUR: Record<string, string> = {
  '15min': '#22c55e',
  '30min': '#4ade80',
  '1hr':   '#f59e0b',
  '2hr+':  '#ef4444',
}

const URGENCY_COLOUR: Record<string, string> = {
  HIGH:   '#ef4444',
  MEDIUM: '#f59e0b',
  LOW:    '#64748b',
}

const MODULE_ROUTE: Record<string, string> = {
  KB:          '/knowledge-base',
  STRATALYST:  '/knowledge-base',   // Seed builds live in KB
  FI:          '/field-intelligence',
  WATCH:       '/active-watch',
  OUTPUT:      '/field-intelligence', // Output generated from FI result
  SCOUT:       '/stratascout',
  STRATALINK:  '/stratalink',
  STRATAMESH:  '/field-intelligence',
  INTERNAL:    '/knowledge-base',
}

// Modules where STRATAGENT can execute the action automatically
const RUNNABLE_MODULES = new Set(['FI', 'KB', 'STRATALYST'])

function PipelineScore({ score, reasoning }: { score: number; reasoning: string }) {
  const colour = score >= 70 ? '#22c55e' : score >= 40 ? '#f59e0b' : '#ef4444'
  const label = score >= 70 ? 'HEALTHY' : score >= 40 ? 'BUILDING' : 'NEEDS WORK'
  return (
    <div className="p-5 rounded-xl"
         style={{ background: 'var(--stratagent-panel)', border: '1px solid ' + colour + '44' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
          Pipeline Health
        </div>
        <span className="text-xs px-2 py-0.5 rounded font-semibold"
              style={{ background: colour + '22', color: colour, border: '1px solid ' + colour + '44' }}>
          {label}
        </span>
      </div>
      <div className="flex items-end gap-3 mb-2">
        <span className="text-5xl font-black" style={{ color: colour }}>{score}</span>
        <span className="text-xl mb-1" style={{ color: 'var(--stratagent-muted)' }}>/100</span>
      </div>
      <div className="w-full h-1.5 rounded-full mb-3" style={{ background: 'var(--stratagent-dark)' }}>
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: score + '%', background: colour }} />
      </div>
      <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{reasoning}</p>
    </div>
  )
}

function TopCallCard({ call, idx, navigate }: { call: any; idx: number; navigate: any }) {
  const urgencyColour = URGENCY_COLOUR[call.urgency] || '#64748b'
  return (
    <div className="p-4 rounded-xl"
         style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono w-5 h-5 rounded flex items-center justify-center font-bold"
                style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-gold)' }}>
            {idx + 1}
          </span>
          <span className="font-semibold text-sm" style={{ color: 'var(--stratagent-text)' }}>
            {call.company}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
            SD {call.ci}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                style={{ background: urgencyColour + '22', color: urgencyColour }}>
            {call.urgency}
          </span>
        </div>
      </div>
      <p className="text-xs mb-2" style={{ color: 'var(--stratagent-text)' }}>
        {call.why_now}
      </p>
      {call.opening_line && (
        <div className="p-2 rounded text-xs italic"
             style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-muted)', borderLeft: '2px solid var(--stratagent-gold)' }}>
          "{call.opening_line}"
        </div>
      )}
      <button
        onClick={() => navigate('/field-intelligence', { state: { company_name: call.company } })}
        className="mt-2 text-xs px-3 py-1 rounded"
        style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)' }}>
        Open in FI →
      </button>
    </div>
  )
}

function ActionCard({ action, navigate, suppliers, onRunComplete }: {
  action: any; navigate: any; suppliers: any[]; onRunComplete?: (msg: string) => void
}) {
  const modColour = MODULE_COLOUR[action.module] || '#64748b'
  const effortColour = EFFORT_COLOUR[action.effort] || '#64748b'
  const route = MODULE_ROUTE[action.module] || '/knowledge-base'
  const isRunnable = RUNNABLE_MODULES.has(action.module)
  const [running, setRunning] = (useState as any)(false)
  const [ran, setRan] = (useState as any)(false)

  // Resolve supplier_name → supplier_id
  const supplierId = (() => {
    if (!action.supplier_name) return null
    const match = suppliers.find((s: any) =>
      s.company_name?.toLowerCase() === action.supplier_name?.toLowerCase()
    )
    return match?.supplier_id || match?.id || null
  })()

  // Build navigation state so target page can auto-select supplier/company
  const navState: any = {}
  if (action.supplier_name) navState.supplier_name = action.supplier_name
  if (supplierId) navState.supplier_id = supplierId
  if (action.company_name) navState.company_name = action.company_name

  async function runAction() {
    setRunning(true)
    try {
      if ((action.module === 'FI') && action.company_name && supplierId) {
        await (api as any).post('/field-intelligence/run', {
          supplier_id: supplierId,
          company_name: action.company_name,
        })
        setRan(true)
        onRunComplete?.(`✓ FI run started for ${action.company_name}`)
      } else if ((action.module === 'KB' || action.module === 'STRATALYST') && supplierId) {
        await (api as any).post(`/stratalyst/${supplierId}/build-seed`)
        setRan(true)
        onRunComplete?.(`✓ STRATALYST seed build started for ${action.supplier_name}`)
      } else {
        // Can't auto-run — fall back to navigate
        navigate(route, { state: navState })
      }
    } catch {
      onRunComplete?.('⚠ Run failed — open the module manually')
      navigate(route, { state: navState })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="p-4 rounded-xl flex gap-4"
         style={{
           background: 'var(--stratagent-panel)',
           border: `1px solid ${ran ? '#22c55e44' : 'var(--stratagent-border)'}`,
         }}>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-2xl font-black" style={{ color: ran ? '#22c55e' : 'var(--stratagent-gold)' }}>
          {ran ? '✓' : action.priority}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: modColour + '22', color: modColour, border: '1px solid ' + modColour + '44' }}>
          {action.module}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm mb-1" style={{ color: ran ? '#22c55e' : 'var(--stratagent-text)' }}>
          {action.action}
        </div>
        {action.supplier_name && (
          <div className="text-xs mb-1 font-mono" style={{ color: 'var(--stratagent-gold)' }}>
            → {action.supplier_name}{action.company_name ? ` / ${action.company_name}` : ''}
          </div>
        )}
        <p className="text-xs mb-2" style={{ color: 'var(--stratagent-muted)' }}>
          {action.why}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs" style={{ color: effortColour }}>
            ⏱ {action.effort}
          </span>
          {/* Agentic Run button — only when we have enough context to execute */}
          {isRunnable && !ran && (supplierId || action.company_name) && (
            <button
              onClick={runAction}
              disabled={running}
              className="text-xs px-2.5 py-0.5 rounded font-semibold"
              style={{
                background: running ? 'var(--stratagent-dark)' : 'var(--stratagent-gold)',
                color: running ? 'var(--stratagent-muted)' : '#000',
                border: '1px solid var(--stratagent-gold)',
                opacity: running ? 0.7 : 1,
              }}>
              {running ? '⏳ Running…' : '⚡ Run now'}
            </button>
          )}
          {/* Navigate button — always shown as fallback */}
          {!ran && (
            <button
              onClick={() => navigate(route, { state: navState })}
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)' }}>
              Open {action.module} →
            </button>
          )}
          {ran && (
            <span className="text-xs" style={{ color: '#22c55e' }}>Done</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Strategist({ session }: { session: Session }) {
  const [snapshot, setSnapshot] = useState<any>(null)
  const [brief, setBrief] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedAt, setGeneratedAt] = useState<number | null>(null)
  const [stratagora, setStratagora] = useState<any>(null)
  const [stratagScanning, setStratagScanning] = useState(false)
  const [docReady, setDocReady] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)
  const navigate = useNavigate()

  setSession(session.sessionId)

  useEffect(() => {
    loadSnapshot()
    loadStoredBrief()
  }, [])

  async function loadStoredBrief() {
    // Load from Firestore first (survives app restarts)
    try {
      const res = await api.get('/strategist/latest-brief')
      if (res.data.brief) {
        setBrief(res.data.brief)
        setGeneratedAt(res.data.generated_at)
        setDocReady(!!res.data.doc_path)
        return
      }
    } catch { /* fall through to localStorage */ }
    // Fallback: localStorage
    try {
      const saved = localStorage.getItem('stratagent_brief')
      const savedAt = localStorage.getItem('stratagent_brief_at')
      if (saved) {
        setBrief(JSON.parse(saved))
        if (savedAt) setGeneratedAt(parseFloat(savedAt))
      }
    } catch { /* ignore */ }
  }

  function clearBrief() {
    setBrief(null)
    setGeneratedAt(null)
    localStorage.removeItem('stratagent_brief')
    localStorage.removeItem('stratagent_brief_at')
  }

  async function loadSnapshot() {
    setLoading(true)
    try {
      const res = await api.get('/strategist/pipeline-snapshot')
      setSnapshot(res.data)
    } catch {
      // fail silently
    } finally {
      setLoading(false)
    }
  }

  async function generateBrief(silent = false) {
    setGenerating(true)
    try {
      const res = await api.post('/strategist/brief')
      setBrief(res.data.brief)
      setGeneratedAt(res.data.generated_at)
      setDocReady(!!res.data.doc_ready)
      localStorage.setItem('stratagent_brief', JSON.stringify(res.data.brief))
      localStorage.setItem('stratagent_brief_at', String(res.data.generated_at))
      if (silent || res.data.doc_ready) {
        setNotification(res.data.doc_ready
          ? '✓ Monday Brief ready — Word document saved to docs/Briefs/'
          : '✓ Monday Brief generated')
        setTimeout(() => setNotification(null), 8000)
      }
    } catch (e: any) {
      if (!silent) alert(e.response?.data?.detail || 'Brief generation failed')
    } finally {
      setGenerating(false)
    }
  }

  // Auto-trigger on Monday if brief is older than 6 days
  useEffect(() => {
    if (generating || brief) return
    const isMonday = new Date().getDay() === 1
    if (isMonday) generateBrief(true)
  }, [snapshot])

  async function scanMarkets() {
    setStratagScanning(true)
    try {
      const res = await api.post('/stratagora/scan', { geography: 'Denmark, Scandinavia, Northern Europe' })
      // After scan, load the summary
      const sum = await api.get('/stratagora/summary')
      setStratagora(sum.data)
    } catch (e: any) {
      const status = e.response?.status ?? 'no response'
      const detail = e.response?.data?.detail ?? e.message ?? 'unknown'
      alert(`STRATAGORA scan failed\nHTTP ${status}: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`)
    } finally {
      setStratagScanning(false)
    }
  }

  const generatedTime = generatedAt
    ? new Date(generatedAt * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Module identity ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5">
        <div style={{ width: 3, height: 18, borderRadius: 2, background: '#f472b6', flexShrink: 0 }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#f472b6' }}>
          STRATEGIST
        </span>
      </div>

      {/* Notification banner */}
      {notification && (
        <div className="mb-4 px-4 py-3 rounded-xl flex items-center justify-between"
             style={{ background: '#10b98122', border: '1px solid #10b98144', color: '#10b981' }}>
          <span className="text-sm font-semibold">{notification}</span>
          <button onClick={() => setNotification(null)} className="text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
              STRATEGIST
            </span>
            <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
              Cross-Pipeline Advisor
            </span>
          </div>
          <h2 className="text-2xl font-black" style={{ color: '#f472b6' }}>
            Monday Brief
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--stratagent-muted)' }}>
            Who to call. What changed. Where to point your energy.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            {brief && !generating && (
              <>
                <a
                  href="http://127.0.0.1:9000/api/strategist/download-brief"
                  download
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: docReady ? 'var(--stratagent-gold)' : 'var(--stratagent-panel)', color: docReady ? '#000' : 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)', textDecoration: 'none' }}>
                  ⬇ {docReady ? 'Download Brief' : 'Export'}
                </a>
                <button
                  onClick={clearBrief}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: 'var(--stratagent-panel)', color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)' }}>
                  ✕ Clear
                </button>
              </>
            )}
            <button
              onClick={generateBrief}
              disabled={generating || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: generating ? '#1e1e1e' : 'var(--stratagent-gold)', color: generating ? 'var(--stratagent-text)' : '#000' }}>
              {generating ? 'Generating brief…' : brief ? '↻ Refresh Brief' : '▶ Generate Brief'}
            </button>
          </div>
          {generatedTime && (
            <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
              Generated {generatedTime}
            </span>
          )}
        </div>
      </div>

      {/* Pipeline snapshot stats */}
      {snapshot && !loading && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'SUPPLIERS', value: snapshot.kbs_count, colour: '#f59e0b' },
            { label: 'PROSPECTS', value: snapshot.profiles_count, colour: '#0ea5e9' },
            { label: 'WATCHING', value: snapshot.watched_count, colour: '#7c3aed' },
            { label: 'OUTCOMES', value: snapshot.outcomes?.length || 0, colour: '#22c55e' },
          ].map(s => (
            <div key={s.label} className="p-3 rounded-xl text-center"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid ' + s.colour + '33' }}>
              <div className="text-2xl font-black" style={{ color: s.colour }}>{s.value}</div>
              <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--stratagent-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* STRATAGORA Market Intelligence Panel */}
      <div className="mb-6 p-5 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid #10b98133' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-mono px-2 py-0.5 rounded"
                    style={{ background: '#10b98122', color: '#10b981', border: '1px solid #10b98144' }}>
                STRATAGORA
              </span>
              <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>Market Intelligence</span>
            </div>
            <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
              {stratagora
                ? stratagora.signal_count + ' signals active across ' + stratagora.sectors_active + ' sectors'
                : 'Scan your markets to surface signals that feed STRATASCOUT and STRATADAR'}
            </p>
          </div>
          <button
            onClick={scanMarkets}
            disabled={stratagScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: '#10b981', color: '#000' }}>
            {stratagScanning ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14">
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="20" strokeDashoffset="5" />
                </svg>
                Scanning...
              </>
            ) : '⧡ Scan Markets'}
          </button>
        </div>

        {stratagora?.brief && (
          <div className="text-xs p-3 rounded-lg mb-3"
               style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-text)', border: '1px solid var(--stratagent-border)' }}>
            {stratagora.brief}
          </div>
        )}

        {stratagora?.top_signals?.length > 0 && (
          <div className="space-y-2">
            {stratagora.top_signals.slice(0, 4).map((sig: any, i: number) => {
              const typeColour: Record<string, string> = {
                CAPEX: '#f59e0b', TENDER: '#0ea5e9', REGULATORY: '#ef4444',
                SECTOR_TREND: '#10b981', LEADERSHIP_CHANGE: '#7c3aed',
                STRATEGIC_SHIFT: '#f97316', NEWS_EVENT: '#64748b',
              }
              const col = typeColour[sig.signal_type] || '#64748b'
              return (
                <div key={i} className="p-3 rounded-lg"
                     style={{ background: 'var(--stratagent-dark)', border: '1px solid ' + col + '33' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded"
                          style={{ background: col + '22', color: col }}>{sig.signal_type}</span>
                    <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{sig.sector_label}</span>
                    <span className="ml-auto text-xs font-mono" style={{ color: col }}>{sig.relevance_score}</span>
                  </div>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--stratagent-text)' }}>{sig.headline}</div>
                  {sig.trigger_match && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs px-1.5 py-0.5 rounded font-semibold"
                            style={{ background: '#E87A0022', color: '#E87A00', border: '1px solid #E87A0044' }}>
                        &#9889; TRIGGER: {sig.trigger_match.trigger_title}
                      </span>
                      {sig.trigger_match.lead_time_days && (
                        <span className="text-xs" style={{ color: '#666' }}>~{sig.trigger_match.lead_time_days}d window</span>
                      )}
                    </div>
                  )}
                  {sig.affected_suppliers?.length > 0 && (
                    <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                      Relevant for: {sig.affected_suppliers.join(', ')}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Empty state — no brief yet */}
      {!brief && !generating && (
        <div className="text-center py-20 rounded-xl"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
          <div className="text-4xl mb-4">◈</div>
          <div className="text-sm font-semibold mb-2" style={{ color: 'var(--stratagent-text)' }}>
            STRATEGIST is ready
          </div>
          <p className="text-xs max-w-sm mx-auto mb-6" style={{ color: 'var(--stratagent-muted)' }}>
            Click Generate Brief to get your weekly cross-pipeline analysis — who to call,
            what's changed, and the 3 actions with the highest leverage right now.
          </p>
          <button
            onClick={generateBrief}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            ▶ Generate Brief
          </button>
        </div>
      )}

      {/* Generating spinner */}
      {generating && (
        <div className="text-center py-20 rounded-xl"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
          <div className="text-3xl mb-4 animate-spin">◌</div>
          <div className="text-sm" style={{ color: 'var(--stratagent-muted)' }}>
            Reading pipeline across all modules…
          </div>
        </div>
      )}

      {/* Brief content */}
      {brief && !generating && (
        <div className="space-y-5">

          {/* Week headline */}
          <div className="p-5 rounded-xl"
               style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold)44' }}>
            <div className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-gold)' }}>
              This Week
            </div>
            <p className="text-lg font-semibold" style={{ color: 'var(--stratagent-text)' }}>
              {brief.week_headline}
            </p>
          </div>

          {/* Pipeline score */}
          <PipelineScore score={brief.pipeline_score} reasoning={brief.pipeline_score_reasoning} />

          {/* Top 3 Actions */}
          {brief.top_3_actions?.length > 0 && (
            <div>
              <div className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-gold)' }}>
                Top 3 Actions — Highest Leverage Right Now
              </div>
              <div className="space-y-3">
                {brief.top_3_actions.map((action: any) => (
                  <ActionCard
                    key={action.priority}
                    action={action}
                    navigate={navigate}
                    suppliers={snapshot?.kbs || []}
                    onRunComplete={(msg) => { setNotification(msg); setTimeout(() => setNotification(null), 8000) }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Top Calls */}
          {brief.top_calls?.length > 0 && (
            <div>
              <div className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
                Who to Call This Week
              </div>
              <div className="space-y-3">
                {brief.top_calls.map((call: any, i: number) => (
                  <TopCallCard key={i} call={call} idx={i} navigate={navigate} />
                ))}
              </div>
            </div>
          )}

          {/* What Changed */}
          {brief.what_changed?.length > 0 && (
            <div className="p-5 rounded-xl space-y-2"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
              <div className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: 'var(--stratagent-muted)' }}>
                What Changed
              </div>
              {brief.what_changed.map((item: string, i: number) => (
                <div key={i} className="flex gap-2 text-xs" style={{ color: 'var(--stratagent-text)' }}>
                  <span style={{ color: 'var(--stratagent-gold)' }}>·</span>
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

