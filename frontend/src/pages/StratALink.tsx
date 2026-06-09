import { useState, useEffect } from 'react'
import { api, setSession } from '../services/api'
import type { Session } from '../App'

const STATUS_COLOUR: Record<string, { bg: string; color: string; border: string }> = {
  active:   { bg: '#071a0e', color: '#22c55e', border: '#166534' },
  pending:  { bg: '#1c1400', color: '#f59e0b', border: '#92400e' },
  research: { bg: '#0c1a2e', color: '#3b82f6', border: '#1e3a5f' },
  paused:   { bg: '#0f1623', color: '#64748b', border: '#1e2530' },
}

const REFERRAL_STATUS_COLOUR: Record<string, string> = {
  referred:    '#3b82f6',
  in_progress: '#f59e0b',
  converted:   '#22c55e',
  lost:        '#64748b',
}

const COMMISSION_TYPE_LABEL: Record<string, string> = {
  'one-time': '1×',
  'recurring': '↻',
  'hybrid': '1×+↻',
}

function RevenueCard({ summary }: { summary: any }) {
  if (!summary) return null
  return (
    <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
      {[
        { label: 'Total Referred', value: summary.total_referred, color: 'var(--stratagent-text)' },
        { label: 'Converted', value: summary.total_converted, color: '#22c55e' },
        { label: 'In Progress', value: summary.in_progress, color: '#f59e0b' },
        { label: 'Conversion Rate', value: summary.conversion_rate + '%', color: '#3b82f6' },
        { label: 'Total Earned', value: '€' + (summary.total_earned_eur || 0).toFixed(2), color: '#c9a84c' },
      ].map(({ label, value, color }) => (
        <div key={label} className="p-4 rounded-xl text-center"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
          <div className="text-xl font-black" style={{ color }}>{value}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

export default function StratALink({ session }: { session: Session }) {
  const [activeTab, setActiveTab] = useState<'library'|'research'|'revenue'>('library')
  const [partners, setPartners] = useState<any[]>([])
  const [referrals, setReferrals] = useState<any[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Research state
  const [researchCategory, setResearchCategory] = useState('')
  const [researchCustom, setResearchCustom] = useState('')
  const [researchGeo, setResearchGeo] = useState('europe')
  const [researchResults, setResearchResults] = useState<any[]>([])
  const [researchRunId, setResearchRunId] = useState<string | null>(null)
  const [researchLoading, setResearchLoading] = useState(false)
  const [researchHistory, setResearchHistory] = useState<any[]>([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [evaluateUrl, setEvaluateUrl] = useState('')
  const [evaluateName, setEvaluateName] = useState('')
  const [evaluation, setEvaluation] = useState<any>(null)
  const [evalLoading, setEvalLoading] = useState(false)

  // Add partner form
  const [showAddForm, setShowAddForm] = useState(false)
  const [newPartner, setNewPartner] = useState<any>({
    partner_name: '', category: '', product_description: '', target_buyer: '',
    commission_type: 'one-time', commission_rate: '', affiliate_network: 'direct',
    referral_url: '', why_relevant: '', quality_rating: 'MEDIUM', program_status: 'active', notes: '',
  })

  // Log referral form
  const [showReferralForm, setShowReferralForm] = useState(false)
  const [newReferral, setNewReferral] = useState<any>({
    partner_id: '', partner_name: '', prospect_company: '',
    commission_expected: '', commission_currency: 'EUR', notes: '',
  })

  setSession(session.sessionId)

  useEffect(() => {
    api.get('/stratalink/categories').then(r => setCategories(r.data || [])).catch(() => {})
    loadPartners()
    loadReferrals()
    loadSummary()
  }, [])

  async function loadPartners() {
    try { const r = await api.get('/stratalink/partners'); setPartners(r.data || []) } catch {}
  }
  async function loadReferrals() {
    try { const r = await api.get('/stratalink/referrals'); setReferrals(r.data || []) } catch {}
  }
  async function loadSummary() {
    try { const r = await api.get('/stratalink/revenue-summary'); setSummary(r.data) } catch {}
  }

  async function runResearch() {
    const cat = researchCategory || researchCustom
    if (!cat) return
    setResearchLoading(true)
    setResearchResults([])
    setResearchRunId(null)
    try {
      const r = await api.post(`/stratalink/research-category?category=${encodeURIComponent(cat)}&geography=${researchGeo}&count=5`)
      // Saved automatically server-side -- programs come back tagged with program_id + selection_status
      setResearchResults(r.data.programs || [])
      setResearchRunId(r.data.run_id || null)
      loadResearchHistory()
    } catch (e: any) { alert(e.response?.data?.detail || 'Research failed') }
    finally { setResearchLoading(false) }
  }

  async function loadResearchHistory() {
    setHistoryLoading(true)
    try {
      const r = await api.get('/stratalink/research-runs')
      setResearchHistory(r.data || [])
    } catch {}
    finally { setHistoryLoading(false) }
  }

  // Flag a program from a saved search for later follow-up (find registration URL,
  // sketch a content/marketing plan) without acting on it right now.
  async function toggleProgramSelection(runId: string | null, p: any, fromHistoryRunId?: string) {
    const targetRunId = fromHistoryRunId || runId
    if (!targetRunId || !p.program_id) return
    const nextStatus = p.selection_status === 'selected' ? 'new' : 'selected'
    try {
      const r = await api.patch(`/stratalink/research-runs/${targetRunId}/programs/${p.program_id}`,
        { selection_status: nextStatus })
      const updated = r.data
      // Update whichever list this program lives in (current results and/or history)
      setResearchResults(prev => prev.map(x => x.program_id === p.program_id ? { ...x, ...updated } : x))
      setResearchHistory(prev => prev.map(run => run.run_id !== targetRunId ? run : {
        ...run,
        programs: (run.programs || []).map((x: any) => x.program_id === p.program_id ? { ...x, ...updated } : x)
      }))
    } catch (e: any) { alert(e.response?.data?.detail || 'Could not update selection') }
  }

  async function runEvaluate() {
    if (!evaluateUrl) return
    setEvalLoading(true)
    setEvaluation(null)
    try {
      const r = await api.post(`/stratalink/evaluate?program_url=${encodeURIComponent(evaluateUrl)}&partner_name=${encodeURIComponent(evaluateName)}`)
      setEvaluation(r.data)
    } catch (e: any) { alert(e.response?.data?.detail || 'Evaluation failed') }
    finally { setEvalLoading(false) }
  }

  async function addPartnerFromResearch(p: any) {
    setNewPartner({
      partner_name: p.partner_name || '',
      category: researchCategory || researchCustom || '',
      product_description: p.product_description || '',
      target_buyer: p.target_buyer || '',
      commission_type: p.commission_type || 'one-time',
      commission_rate: p.commission_rate || '',
      affiliate_network: p.affiliate_network || 'direct',
      referral_url: p.signup_url || '',
      why_relevant: p.why_relevant || '',
      quality_rating: p.quality_rating || 'MEDIUM',
      program_status: 'pending',
      notes: p.quality_notes || '',
    })
    setShowAddForm(true)
    setActiveTab('library')
  }

  async function saveNewPartner() {
    if (!newPartner.partner_name || !newPartner.commission_rate) return
    setLoading(true)
    try {
      await api.post('/stratalink/partners', newPartner)
      await loadPartners()
      setShowAddForm(false)
      setNewPartner({ partner_name: '', category: '', product_description: '', target_buyer: '',
        commission_type: 'one-time', commission_rate: '', affiliate_network: 'direct',
        referral_url: '', why_relevant: '', quality_rating: 'MEDIUM', program_status: 'active', notes: '' })
    } catch (e: any) { alert(e.response?.data?.detail || 'Save failed') }
    finally { setLoading(false) }
  }

  async function logReferral() {
    if (!newReferral.partner_name || !newReferral.prospect_company) return
    setLoading(true)
    try {
      await api.post('/stratalink/referrals', {
        ...newReferral,
        commission_expected: newReferral.commission_expected ? parseFloat(newReferral.commission_expected) : null,
      })
      await loadReferrals()
      await loadSummary()
      setShowReferralForm(false)
    } catch (e: any) { alert(e.response?.data?.detail || 'Log failed') }
    finally { setLoading(false) }
  }

  async function markConverted(referralId: string) {
    const amount = prompt('Commission earned (EUR amount, e.g. 45.00):')
    if (amount === null) return
    try {
      await api.patch(`/stratalink/referrals/${referralId}/convert?commission_earned=${parseFloat(amount) || 0}&commission_currency=EUR`)
      await loadReferrals()
      await loadSummary()
    } catch {}
  }

  async function updateStatus(referralId: string, status: string) {
    try {
      await api.patch(`/stratalink/referrals/${referralId}/status?status=${status}`)
      await loadReferrals()
    } catch {}
  }

  const qualityColor = (q: string) => q === 'HIGH' ? '#22c55e' : q === 'MEDIUM' ? '#f59e0b' : '#64748b'

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h2 className="text-2xl font-black" style={{ color: 'var(--stratagent-text)' }}>STRATALINK</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--stratagent-muted)' }}>
            Affiliate intelligence &amp; revenue development — your in-house product expert for the affiliate division.
          </p>
        </div>
        {summary?.total_earned_eur > 0 && (
          <div className="text-sm font-black px-3 py-1.5 rounded-lg mt-1"
               style={{ background: '#1c1400', color: 'var(--stratagent-gold)', border: '1px solid #92400e' }}>
            €{summary.total_earned_eur.toFixed(2)} earned
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mt-6 mb-6 p-1 rounded-lg"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)', width: 'fit-content' }}>
        {([['library', 'Partner Library'], ['research', 'Research Programs'], ['revenue', 'Revenue Log']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
                  className="px-4 py-1.5 rounded-md text-xs font-semibold uppercase tracking-widest"
                  style={{
                    background: activeTab === tab ? 'var(--stratagent-gold)' : 'transparent',
                    color: activeTab === tab ? '#000' : 'var(--stratagent-muted)',
                  }}>
            {label}{tab === 'library' && partners.length > 0 ? ` (${partners.length})` : ''}
            {tab === 'revenue' && referrals.length > 0 ? ` (${referrals.length})` : ''}
          </button>
        ))}
      </div>

      {/* ── PARTNER LIBRARY ── */}
      {activeTab === 'library' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
              {partners.length} partner{partners.length !== 1 ? 's' : ''} in library
            </div>
            <button onClick={() => setShowAddForm(f => !f)}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                    style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              + Add Partner
            </button>
          </div>

          {showAddForm && (
            <div className="mb-5 p-5 rounded-xl space-y-3"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold)' }}>
              <div className="text-xs uppercase tracking-widest font-semibold mb-1"
                   style={{ color: 'var(--stratagent-gold)' }}>New Affiliate Partner</div>
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                {[
                  ['Partner Name *', 'partner_name', 'e.g. Guesty'],
                  ['Category', 'category', 'e.g. property_management'],
                  ['Commission Rate *', 'commission_rate', 'e.g. 20% recurring or $50/signup'],
                  ['Affiliate Network', 'affiliate_network', 'direct | Impact | CJ | PartnerStack'],
                  ['Referral / Signup URL', 'referral_url', 'https://...'],
                  ['Quality Rating', 'quality_rating', 'HIGH | MEDIUM | LOW'],
                ].map(([label, key, ph]) => (
                  <div key={key}>
                    <label className="block text-xs mb-1" style={{ color: 'var(--stratagent-muted)' }}>{label}</label>
                    <input value={newPartner[key]} onChange={e => setNewPartner((p: any) => ({...p, [key]: e.target.value}))}
                           placeholder={ph}
                           className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                           style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
                  </div>
                ))}
              </div>
              {[
                ['What they sell', 'product_description', 'Plain English product description'],
                ['Who buys this', 'target_buyer', 'The referral target buyer'],
                ['Why relevant to Jason\'s prospects', 'why_relevant', 'Connection to existing prospect base'],
                ['Notes', 'notes', 'Any other notes'],
              ].map(([label, key, ph]) => (
                <div key={key}>
                  <label className="block text-xs mb-1" style={{ color: 'var(--stratagent-muted)' }}>{label}</label>
                  <input value={newPartner[key]} onChange={e => setNewPartner((p: any) => ({...p, [key]: e.target.value}))}
                         placeholder={ph}
                         className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                         style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
                </div>
              ))}
              <div className="flex gap-2">
                <select value={newPartner.commission_type} onChange={e => setNewPartner((p: any) => ({...p, commission_type: e.target.value}))}
                        className="px-3 py-2 rounded-lg text-xs outline-none"
                        style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}>
                  <option value="one-time">One-time commission</option>
                  <option value="recurring">Recurring commission</option>
                  <option value="hybrid">Hybrid (one-time + recurring)</option>
                </select>
                <select value={newPartner.program_status} onChange={e => setNewPartner((p: any) => ({...p, program_status: e.target.value}))}
                        className="px-3 py-2 rounded-lg text-xs outline-none"
                        style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}>
                  <option value="active">Active</option>
                  <option value="pending">Pending (applied, not approved)</option>
                  <option value="research">Research only</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={saveNewPartner} disabled={loading || !newPartner.partner_name || !newPartner.commission_rate}
                        className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
                        style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                  Save Partner
                </button>
                <button onClick={() => setShowAddForm(false)}
                        className="px-4 py-2 rounded-lg text-xs"
                        style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {partners.length === 0 ? (
            <div className="text-center py-16 rounded-xl"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
              <div className="text-3xl mb-3">🔗</div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--stratagent-text)' }}>
                No affiliate partners yet
              </div>
              <div className="text-xs mb-4" style={{ color: 'var(--stratagent-muted)' }}>
                Use Research Programs to find programs, then add them here.
              </div>
              <button onClick={() => setActiveTab('research')}
                      className="text-xs px-4 py-2 rounded-lg"
                      style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                Research Programs →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {partners.map(p => {
                const sc = STATUS_COLOUR[p.program_status] || STATUS_COLOUR.paused
                return (
                  <div key={p.partner_id || p.id} className="p-4 rounded-xl"
                       style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm" style={{ color: 'var(--stratagent-text)' }}>{p.partner_name}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                            {p.program_status}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded"
                                style={{ background: '#0f1623', color: qualityColor(p.quality_rating), border: '1px solid #1e2530', fontSize: '10px' }}>
                            {p.quality_rating}
                          </span>
                          {p.commission_type && (
                            <span className="text-xs" style={{ color: 'var(--stratagent-gold)' }}>
                              {COMMISSION_TYPE_LABEL[p.commission_type]} {p.commission_rate}
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>
                          {p.category} · {p.affiliate_network}
                        </p>
                        <p className="text-xs mt-1" style={{ color: 'var(--stratagent-text)' }}>{p.product_description}</p>
                        {p.why_relevant && (
                          <p className="text-xs mt-1" style={{ color: '#c9a84c' }}>↳ {p.why_relevant}</p>
                        )}
                        {p.referral_url && (
                          <a href={p.referral_url} target="_blank" rel="noreferrer"
                             className="text-xs underline mt-1 block" style={{ color: '#64748b' }}>
                            Affiliate link ↗
                          </a>
                        )}
                      </div>
                      <button onClick={() => {
                                setNewReferral((r: any) => ({...r, partner_id: p.partner_id || p.id, partner_name: p.partner_name}))
                                setShowReferralForm(true)
                                setActiveTab('revenue')
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0"
                              style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                        Log Referral
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── RESEARCH PROGRAMS ── */}
      {activeTab === 'research' && (
        <div className="space-y-5">
          <div className="p-5 rounded-xl space-y-4"
               style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
            <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--stratagent-gold)' }}>
              Research Affiliate Programs
            </div>
            <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
              STRATALINK searches the web for affiliate programs in a category, evaluates their commission structure and quality, and returns a shortlist for your review.
            </p>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-text)' }}>Category</label>
              <select value={researchCategory} onChange={e => setResearchCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none mb-2"
                      style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}>
                <option value="">Select a category...</option>
                {categories.map((c: any) => <option key={c.key} value={c.key}>{c.key.replace(/_/g,' ')} — {c.label}</option>)}
              </select>
              <input value={researchCustom} onChange={e => setResearchCustom(e.target.value)}
                     placeholder="...or type a custom category, e.g. 'property management software for Airbnb hosts'"
                     className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                     style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-text)' }}>Geography</label>
              <select value={researchGeo} onChange={e => setResearchGeo(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}>
                <option value="europe">Europe (default)</option>
                <option value="scandinavia">Scandinavia</option>
                <option value="global">Global</option>
              </select>
            </div>
            <button onClick={runResearch} disabled={researchLoading || (!researchCategory && !researchCustom)}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              {researchLoading ? 'STRATALINK researching programs...' : 'Research Programs'}
            </button>
          </div>

          {researchResults.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
                {researchResults.length} programs found
              </div>
              {researchResults.map((p, i) => (
                <div key={i} className="p-4 rounded-xl"
                     style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm" style={{ color: 'var(--stratagent-text)' }}>{p.partner_name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded"
                              style={{ color: qualityColor(p.quality_rating), background: qualityColor(p.quality_rating) + '22', border: `1px solid ${qualityColor(p.quality_rating)}44` }}>
                          {p.quality_rating}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--stratagent-gold)' }}>
                          {COMMISSION_TYPE_LABEL[p.commission_type] || ''} {p.commission_rate}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>{p.affiliate_network} · {p.cookie_duration_days}d cookie</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--stratagent-text)' }}>{p.product_description}</p>
                      {p.why_relevant && <p className="text-xs mt-1" style={{ color: '#c9a84c' }}>↳ {p.why_relevant}</p>}
                      {p.quality_notes && <p className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>{p.quality_notes}</p>}
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => addPartnerFromResearch(p)}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                              style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                        + Add to Library
                      </button>
                      <button onClick={() => toggleProgramSelection(researchRunId, p)}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                              style={p.selection_status === 'selected'
                                ? { background: '#2f8f4e22', color: '#4ade80', border: '1px solid #4ade8055' }
                                : { background: 'transparent', color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)' }}>
                        {p.selection_status === 'selected' ? '✓ Flagged for follow-up' : 'Flag for follow-up'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Saved search history */}
          <div className="space-y-2">
            <button onClick={() => { const next = !historyOpen; setHistoryOpen(next); if (next && researchHistory.length === 0) loadResearchHistory() }}
                    className="text-xs uppercase tracking-widest font-semibold"
                    style={{ color: 'var(--stratagent-gold)' }}>
              {historyOpen ? '▾' : '▸'} Saved Searches {researchHistory.length > 0 ? `(${researchHistory.length})` : ''}
            </button>
            {historyOpen && (
              <div className="space-y-3">
                {historyLoading && (
                  <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>Loading saved searches...</p>
                )}
                {!historyLoading && researchHistory.length === 0 && (
                  <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>No saved searches yet -- run a research above and it will be stored here automatically.</p>
                )}
                {researchHistory.map((run) => (
                  <div key={run.run_id} className="p-4 rounded-xl space-y-2"
                       style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="text-sm font-semibold" style={{ color: 'var(--stratagent-text)' }}>
                        {run.category} <span style={{ color: 'var(--stratagent-muted)', fontWeight: 400 }}>· {run.geography} · {run.count} programs</span>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                        {run.created_at ? new Date(run.created_at * 1000).toLocaleString() : ''}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {(run.programs || []).map((p: any) => (
                        <div key={p.program_id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
                             style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold" style={{ color: 'var(--stratagent-text)' }}>{p.partner_name}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded"
                                  style={{ color: qualityColor(p.quality_rating), background: qualityColor(p.quality_rating) + '22', border: `1px solid ${qualityColor(p.quality_rating)}44` }}>
                              {p.quality_rating}
                            </span>
                          </div>
                          <button onClick={() => toggleProgramSelection(run.run_id, p, run.run_id)}
                                  className="text-xs px-2.5 py-1 rounded-lg font-semibold flex-shrink-0"
                                  style={p.selection_status === 'selected'
                                    ? { background: '#2f8f4e22', color: '#4ade80', border: '1px solid #4ade8055' }
                                    : { background: 'transparent', color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)' }}>
                            {p.selection_status === 'selected' ? '✓ Flagged' : 'Flag'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>


          {/* Deep evaluate */}
          <div className="p-5 rounded-xl space-y-3"
               style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
            <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--stratagent-gold)' }}>
              Deep Evaluate a Specific Program
            </div>
            <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
              Paste the affiliate program URL (or company URL) for a thorough commission structure, reputation, and payout review.
            </p>
            <input value={evaluateName} onChange={e => setEvaluateName(e.target.value)}
                   placeholder="Company / program name (optional)"
                   className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
            <input value={evaluateUrl} onChange={e => setEvaluateUrl(e.target.value)}
                   placeholder="https://company.com/affiliates"
                   className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
            <button onClick={runEvaluate} disabled={evalLoading || !evaluateUrl}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              {evalLoading ? 'Evaluating program...' : 'Evaluate Program'}
            </button>
            {evaluation && (
              <div className="mt-3 p-4 rounded-lg space-y-2"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm" style={{ color: 'var(--stratagent-text)' }}>{evaluation.partner_name}</span>
                  <span className="text-xs font-bold px-2 py-0.5 rounded"
                        style={{ color: evaluation.recommendation === 'JOIN' ? '#22c55e' : evaluation.recommendation === 'SKIP' ? '#ef4444' : '#f59e0b',
                                 background: evaluation.recommendation === 'JOIN' ? '#071a0e' : evaluation.recommendation === 'SKIP' ? '#1c0a0a' : '#1c1400' }}>
                    {evaluation.recommendation}
                  </span>
                </div>
                {[
                  ['Commission', evaluation.commission_rate],
                  ['Cookie', evaluation.cookie_duration_days + ' days'],
                  ['Payment', evaluation.payment_schedule + (evaluation.minimum_payout ? ' · min ' + evaluation.minimum_payout : '')],
                  ['Network', evaluation.affiliate_network],
                  ['Why', evaluation.recommendation_reason],
                  ['Notes', evaluation.quality_notes],
                ].filter(([,v]) => v).map(([label, value]) => (
                  <div key={String(label)} className="text-xs">
                    <span style={{ color: 'var(--stratagent-muted)' }}>{label}: </span>
                    <span style={{ color: 'var(--stratagent-text)' }}>{String(value)}</span>
                  </div>
                ))}
                {evaluation.recommendation !== 'SKIP' && (
                  <button onClick={() => addPartnerFromResearch({
                    ...evaluation,
                    signup_url: evaluateUrl,
                    quality_notes: evaluation.quality_notes,
                  })}
                  className="mt-2 text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                    + Add to Library
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── REVENUE LOG ── */}
      {activeTab === 'revenue' && (
        <div>
          <RevenueCard summary={summary} />

          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
              Referral Log
            </div>
            <button onClick={() => setShowReferralForm(f => !f)}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                    style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              + Log Referral
            </button>
          </div>

          {showReferralForm && (
            <div className="mb-5 p-5 rounded-xl space-y-3"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold)' }}>
              <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--stratagent-gold)' }}>
                Log a Referral
              </div>
              {[
                ['Partner Name *', 'partner_name', 'Which affiliate partner'],
                ['Prospect Company *', 'prospect_company', 'Who was referred'],
                ['Expected Commission (EUR)', 'commission_expected', 'e.g. 50'],
                ['Notes', 'notes', 'Context or conversation notes'],
              ].map(([label, key, ph]) => (
                <div key={key}>
                  <label className="block text-xs mb-1" style={{ color: 'var(--stratagent-muted)' }}>{label}</label>
                  <input value={newReferral[key]} onChange={e => setNewReferral((r: any) => ({...r, [key]: e.target.value}))}
                         placeholder={ph as string}
                         className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                         style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={logReferral} disabled={loading || !newReferral.partner_name || !newReferral.prospect_company}
                        className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40"
                        style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                  Log It
                </button>
                <button onClick={() => setShowReferralForm(false)}
                        className="px-4 py-2 rounded-lg text-xs"
                        style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {referrals.length === 0 ? (
            <div className="text-center py-12 rounded-xl"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
              <div className="text-3xl mb-3">💰</div>
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--stratagent-text)' }}>No referrals logged yet</div>
              <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>Every referral you make gets logged here with its outcome.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {referrals.map(r => {
                const sc = REFERRAL_STATUS_COLOUR[r.status] || '#64748b'
                const date = r.referred_at ? new Date(r.referred_at * 1000).toLocaleDateString('en-DK', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
                return (
                  <div key={r.referral_id || r.id} className="p-3 rounded-xl flex items-start justify-between gap-3"
                       style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold" style={{ color: 'var(--stratagent-text)' }}>{r.prospect_company}</span>
                        <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>via {r.partner_name}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded"
                              style={{ color: sc, background: sc + '22', border: `1px solid ${sc}44` }}>
                          {r.status}
                        </span>
                        {r.commission_earned != null && (
                          <span className="text-xs font-bold" style={{ color: '#22c55e' }}>€{r.commission_earned}</span>
                        )}
                        {r.commission_expected && !r.commission_earned && (
                          <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>~€{r.commission_expected} expected</span>
                        )}
                      </div>
                      {r.notes && <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>{r.notes}</p>}
                      <p className="text-xs mt-0.5" style={{ color: '#2d3748' }}>{date}</p>
                    </div>
                    {r.status !== 'converted' && r.status !== 'lost' && (
                      <div className="flex gap-1 flex-shrink-0">
                        {r.status === 'referred' && (
                          <button onClick={() => updateStatus(r.referral_id || r.id, 'in_progress')}
                                  className="text-xs px-2 py-1 rounded"
                                  style={{ border: '1px solid #92400e', color: '#f59e0b', background: '#1c1400' }}>
                            In progress
                          </button>
                        )}
                        <button onClick={() => markConverted(r.referral_id || r.id)}
                                className="text-xs px-2 py-1 rounded font-semibold"
                                style={{ background: '#071a0e', color: '#22c55e', border: '1px solid #166534' }}>
                          Converted ✓
                        </button>
                        <button onClick={() => updateStatus(r.referral_id || r.id, 'lost')}
                                className="text-xs px-2 py-1 rounded"
                                style={{ border: '1px solid #1e2530', color: '#64748b' }}>
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
