import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setSession } from '../services/api'
import type { Session } from '../App'

const GEOGRAPHIES = [
  { key: 'denmark',        flag: '🇩🇰', label: 'Denmark',        desc: 'Denmark only' },
  { key: 'scandinavia',    flag: '🌍', label: 'Scandinavia',    desc: 'DK, SE, NO, FI' },
  { key: 'northern_europe',flag: '🌍', label: 'Northern Europe', desc: 'Scandinavia + DE, NL, BE, UK, IE' },
  { key: 'europe',         flag: '🌍', label: 'Europe',          desc: 'Full EU + UK, NO, CH' },
  { key: 'global',         flag: '🌐', label: 'Global',          desc: 'No geographic restriction' },
]

const SIGNAL_COLOUR: Record<string, string> = {
  TENDER:           '#7c3aed',
  CAPEX:            '#f59e0b',
  LEADERSHIP_CHANGE:'#0ea5e9',
  REGULATORY:       '#22c55e',
  STRATEGIC_SHIFT:  '#f97316',
  NEWS_EVENT:       '#94a3b8',
  SOCIAL_SIGNAL:    '#a855f7',
}

const CONF_COLOUR: Record<string, string> = {
  HIGH:   '#22c55e',
  MEDIUM: '#f59e0b',
  LOW:    '#64748b',
}

function CIBadge({ score }: { score: number }) {
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#64748b'
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: color + '22', color, border: `1px solid ${color}44` }}>
      ~{score} CI
    </span>
  )
}

function ProspectCard({ p, onPromote, onDismiss, onPark }: {
  p: any
  onPromote: () => void
  onDismiss: () => void
  onPark: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const signal = p.discovery_signal || {}
  const sigColor = SIGNAL_COLOUR[signal.type] || '#94a3b8'
  const confColor = CONF_COLOUR[p.confidence] || '#64748b'

  return (
    <div className="rounded-xl overflow-hidden"
         style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-sm" style={{ color: 'var(--stratagent-text)' }}>
                {p.company_name}
              </span>
              <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                {p.city ? `${p.city}, ` : ''}{p.country}
              </span>
              <CIBadge score={p.estimated_ci} />
              <span className="text-xs px-1.5 py-0.5 rounded"
                    style={{ background: confColor + '22', color: confColor, fontSize: '10px', fontWeight: 700 }}>
                {p.confidence}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>
              {p.industry}
            </p>
            <p className="text-xs mt-1.5" style={{ color: 'var(--stratagent-text)' }}>
              {p.discovery_reason}
            </p>
          </div>
        </div>

        {signal.type && (
          <div className="mt-3 p-2.5 rounded-lg flex items-start gap-2"
               style={{ background: sigColor + '15', border: `1px solid ${sigColor}33` }}>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: sigColor + '22', color: sigColor }}>
              {signal.type?.replace('_', ' ')}
            </span>
            <div className="min-w-0">
              <p className="text-xs" style={{ color: 'var(--stratagent-text)' }}>
                {signal.description}
              </p>
              {signal.timing && (
                <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{signal.timing}</p>
              )}
              {signal.source && (
                <a href={signal.source} target="_blank" rel="noreferrer"
                   className="text-xs underline" style={{ color: '#64748b' }}>
                  Source ↗
                </a>
              )}
            </div>
          </div>
        )}

        {expanded && (
          <div className="mt-3 space-y-2">
            {p.operational_need && (
              <div>
                <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--stratagent-gold)' }}>
                  Operational Need
                </div>
                <p className="text-xs" style={{ color: 'var(--stratagent-text)' }}>{p.operational_need}</p>
              </div>
            )}
            {p.decision_maker?.name && (
              <div>
                <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--stratagent-gold)' }}>
                  Decision Maker
                </div>
                <p className="text-xs" style={{ color: 'var(--stratagent-text)' }}>
                  {p.decision_maker.name} — {p.decision_maker.title}
                  {p.decision_maker.linkedin && (
                    <a href={p.decision_maker.linkedin} target="_blank" rel="noreferrer"
                       className="ml-2 underline" style={{ color: 'var(--stratagent-blue)' }}>
                      LinkedIn
                    </a>
                  )}
                </p>
              </div>
            )}
          </div>
        )}

        <button onClick={() => setExpanded(e => !e)}
                className="text-xs mt-2" style={{ color: 'var(--stratagent-muted)' }}>
          {expanded ? '▲ Less' : '▼ More detail'}
        </button>
      </div>

      <div className="flex border-t" style={{ borderColor: 'var(--stratagent-border)' }}>
        <button onClick={onPromote}
                className="flex-1 py-2.5 text-xs font-semibold transition-colors"
                style={{ background: 'var(--stratagent-gold)', color: '#000', borderRight: '1px solid #00000020' }}>
          ▶ Run Field Intelligence
        </button>
        <button onClick={onPark}
                className="px-4 py-2.5 text-xs font-semibold"
                style={{ color: 'var(--stratagent-muted)', borderRight: '1px solid var(--stratagent-border)' }}>
          Park
        </button>
        <button onClick={onDismiss}
                className="px-4 py-2.5 text-xs"
                style={{ color: '#ef444466' }}>
          ✕
        </button>
      </div>
    </div>
  )
}

export default function StratAScout({ session }: { session: Session }) {
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [supplierId, setSupplierId] = useState(() =>
    localStorage.getItem('scout_last_supplier') || ''
  )
  const [geography, setGeography] = useState(() =>
    localStorage.getItem('scout_last_geography') || 'scandinavia'
  )
  const [sectorFocus, setSectorFocus] = useState(() =>
    localStorage.getItem('scout_last_sector') || ''
  )
  const [count, setCount] = useState(5)
  const [loading, setLoading] = useState(false)
  const [stopped, setStopped] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [pool, setPool] = useState<any[]>([])
  const [poolLoading, setPoolLoading] = useState(false)
  const [lastHunt, setLastHunt] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'hunt'|'pool'>('hunt')
  const navigate = useNavigate()

  setSession(session.sessionId)

  useEffect(() => {
    api.get('/knowledge-base/').then(res => {
      const list = (res.data || []).filter((s: any) =>
        (s.intelligence_depth?.total ?? 0) >= 50
      )
      setSuppliers(list)
      if (list.length === 1) setSupplierId(list[0].supplier_id || list[0].id)
    }).catch(() => {})
    loadPool()
  }, [])

  async function loadPool() {
    setPoolLoading(true)
    try {
      const res = await api.get('/stratascout/pool', { params: { status: 'new' } })
      setPool(res.data || [])
    } catch { }
    finally { setPoolLoading(false) }
  }

  async function runHunt() {
    if (!supplierId) return
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setStopped(false)
    try {
      const res = await api.post('/stratascout/hunt', {
        supplier_id: supplierId,
        geography,
        sector_focus: sectorFocus,
        count,
      }, { signal: controller.signal })
      setLastHunt(res.data)
      setActiveTab('pool')
      await loadPool()
    } catch (e: any) {
      if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError') {
        setStopped(true)
      } else {
        const msg = e.response?.data?.detail?.message || e.response?.data?.detail || 'Hunt failed'
        alert(msg)
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  function stopHunt() {
    abortRef.current?.abort()
  }

  async function handlePromote(p: any) {
    try {
      await api.post(`/stratascout/pool/${p.pool_id}/promote`)
      navigate('/field-intelligence', {
        state: { supplier_id: p.supplier_id, company_name: p.company_name }
      })
    } catch (e: any) {
      alert('Promote failed')
    }
  }

  async function handleDismiss(poolId: string) {
    try {
      await api.post(`/stratascout/pool/${poolId}/dismiss`)
      setPool(prev => prev.filter(p => p.pool_id !== poolId))
    } catch { }
  }

  async function handlePark(poolId: string) {
    try {
      await api.post(`/stratascout/pool/${poolId}/park`)
      setPool(prev => prev.filter(p => p.pool_id !== poolId))
    } catch { }
  }

  const selectedSupplier = suppliers.find(s => (s.supplier_id || s.id) === supplierId)
  const newPoolCount = pool.filter(p => p.status === 'new').length

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-2xl font-black" style={{ color: 'var(--stratagent-text)' }}>
            STRATASCOUT
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--stratagent-muted)' }}>
            Proactive prospect hunter — finds companies that need your capability and are in motion right now.
          </p>
        </div>
        {newPoolCount > 0 && (
          <span className="text-xs font-bold px-3 py-1 rounded-full mt-1"
                style={{ background: '#1c1400', color: 'var(--stratagent-gold)', border: '1px solid #92400e' }}>
            {newPoolCount} new in pool
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mt-6 mb-6 p-1 rounded-lg"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)', width: 'fit-content' }}>
        {(['hunt', 'pool'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-widest transition-colors"
                  style={{
                    background: activeTab === tab ? 'var(--stratagent-gold)' : 'transparent',
                    color: activeTab === tab ? '#000' : 'var(--stratagent-muted)',
                  }}>
            {tab === 'hunt' ? 'New Hunt' : `Prospect Pool${newPoolCount > 0 ? ` (${newPoolCount})` : ''}`}
          </button>
        ))}
      </div>

      {activeTab === 'hunt' && (
        <div className="p-6 rounded-xl space-y-5"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>

          {/* Supplier selector */}
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2"
                   style={{ color: 'var(--stratagent-muted)' }}>
              Hunt on behalf of
            </label>
            {suppliers.length === 0 ? (
              <div className="px-4 py-3 rounded-lg text-sm"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                No suppliers with 50+ Intelligence Depth. Enrich your KBs first.
              </div>
            ) : (
              <select value={supplierId} onChange={e => { setSupplierId(e.target.value); localStorage.setItem('scout_last_supplier', e.target.value); loadPool(e.target.value) }}
                      className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: supplierId ? 'var(--stratagent-text)' : 'var(--stratagent-muted)' }}>
                <option value="" disabled>Select supplier</option>
                {suppliers.map(s => (
                  <option key={s.supplier_id || s.id} value={s.supplier_id || s.id}>
                    {s.company_name} — {Math.round(s.intelligence_depth?.total ?? 0)} depth
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Geography */}
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2"
                   style={{ color: 'var(--stratagent-muted)' }}>
              Geography Zone
            </label>
            <div className="grid grid-cols-1 gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {GEOGRAPHIES.map(g => (
                <button key={g.key} onClick={() => { setGeography(g.key); localStorage.setItem('scout_last_geography', g.key) }}
                        className="px-3 py-2.5 rounded-lg text-left transition-colors"
                        style={{
                          background: geography === g.key ? '#1c1400' : 'var(--stratagent-dark)',
                          border: geography === g.key ? '1px solid var(--stratagent-gold)' : '1px solid var(--stratagent-border)',
                          color: geography === g.key ? 'var(--stratagent-gold)' : 'var(--stratagent-muted)',
                        }}>
                  <div className="text-xs font-semibold">{g.flag} {g.label}</div>
                  <div className="text-xs mt-0.5 opacity-60">{g.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sector focus + count */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs uppercase tracking-widest mb-2"
                     style={{ color: 'var(--stratagent-muted)' }}>
                Sector Focus <span style={{ color: '#2d3748' }}>(optional — narrows the hunt to this buyer type)</span>
              </label>
              <input value={sectorFocus} onChange={e => { setSectorFocus(e.target.value); localStorage.setItem('scout_last_sector', e.target.value) }}
                     placeholder="e.g. Airbnb Superhost operators, hotel chains, offshore energy, food processing"
                     className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                     style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
            </div>
            <div style={{ width: '120px' }}>
              <label className="block text-xs uppercase tracking-widest mb-2"
                     style={{ color: 'var(--stratagent-muted)' }}>
                Candidates
              </label>
              <select value={count} onChange={e => setCount(Number(e.target.value))}
                      className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}>
                {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
          <button onClick={runHunt}
                  disabled={loading || !supplierId}
                  className="flex-1 py-3 rounded-lg font-semibold text-sm disabled:opacity-40"
                  style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#000" strokeWidth="3" strokeDasharray="32" strokeDashoffset="12" strokeLinecap="round"/>
                </svg>
                STRATASCOUT hunting...
              </span>
            ) : `Run STRATASCOUT — ${GEOGRAPHIES.find(g => g.key === geography)?.label}`}
          </button>

          {loading && (
            <button
              onClick={stopHunt}
              className="px-5 py-3 rounded-lg font-semibold text-sm"
              style={{ background: '#1c0a0a', border: '1px solid #7f1d1d', color: '#ef4444' }}>
              ■ Stop
            </button>
          )}
          </div>

          {stopped && (
            <div className="text-xs p-3 rounded-lg text-center"
                 style={{ background: '#1c0a0a', border: '1px solid #7f1d1d', color: '#ef4444' }}>
              Hunt stopped. Results deposited so far are in the Prospect Pool.
            </div>
          )}

          {!stopped && lastHunt && (
            <div className="text-xs p-3 rounded-lg text-center"
                 style={{ background: '#071a0e', border: '1px solid #166534', color: '#4ade80' }}>
              Found {lastHunt.candidates_found} candidates for {lastHunt.supplier_name} in {lastHunt.geography} → deposited to Prospect Pool
            </div>
          )}
        </div>
      )}

      {activeTab === 'pool' && (
        <div className="space-y-3">
          {poolLoading ? (
            <div className="text-center py-12 text-sm" style={{ color: 'var(--stratagent-muted)' }}>
              Loading pool...
            </div>
          ) : pool.length === 0 ? (
            <div className="text-center py-16 rounded-xl"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
              <div className="text-3xl mb-3">🎯</div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--stratagent-text)' }}>
                Prospect Pool is empty
              </div>
              <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>              Run a hunt to populate the pool, then promote the best prospects to Field Intelligence.
                </div>
            </div>
          ) : (
            <div className="space-y-3">
              {pool.map((p) => (
                <ProspectCard
                  key={p.pool_id}
                  p={p}
                  onPromote={() => handlePromote(p)}
                  onPark={() => handlePark(p.pool_id)}
                  onDismiss={() => handleDismiss(p.pool_id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
