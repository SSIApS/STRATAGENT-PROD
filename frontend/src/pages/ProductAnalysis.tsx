import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Session } from '../App'

const API = 'http://127.0.0.1:9000'

// Inject spin keyframe once into document head
if (typeof document !== 'undefined' && !document.getElementById('pam-spin-style')) {
  const s = document.createElement('style')
  s.id = 'pam-spin-style'
  s.textContent = '@keyframes pamSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'
  document.head.appendChild(s)
}

const ARCHETYPE_COLORS: Record<string, string> = {
  consumer_art_novelty: '#a855f7',
  consumer_design_product: '#06b6d4',
  b2b_training_professional: '#f59e0b',
  b2b_industrial_supply: '#22c55e',
}

const ARCHETYPE_LABELS: Record<string, string> = {
  consumer_art_novelty: 'Consumer Art / Novelty',
  consumer_design_product: 'Consumer Design Product',
  b2b_training_professional: 'B2B Training / Professional',
  b2b_industrial_supply: 'B2B Industrial Supply',
}

const PURPOSE_LABELS: Record<string, string> = {
  own_product: 'Own Product',
  affiliate_evaluation: 'Affiliate Evaluation',
  client_product: 'Client Product',
}

const TRIGGER_REASONS = [
  'INITIAL_SCAN',
  'CLIENT_REQUEST',
  'MARKET_SHIFT',
  'NEW_COMPETITOR',
  'PLATFORM_CHANGE',
  'REGULATORY_CHANGE',
  'PERIODIC_REFRESH',
  'PRODUCT_CHANGE',
]

function Spinner({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         style={{ animation: 'pamSpin 0.8s linear infinite', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="3"
              strokeLinecap="round" strokeDasharray="45" strokeDashoffset="12" />
    </svg>
  )
}

interface Product {
  product_id: string
  product_name: string
  description?: string
  archetype: string
  archetype_label?: string
  purpose: string
  supplier_id?: string
  geography?: string
  source_urls?: Array<{ url: string; label: string }>
  [key: string]: unknown
}

interface Signal {
  signal_type: string
  headline: string
  detail: string
  action: string
  urgency: string
  confidence: string
  channel?: string
  industry_vertical?: string
  saturation_score?: number
}

interface VaultEntry {
  id: string
  version: number
  trigger_reason: string
  locked_date: string
  analysis: {
    signal_count: number
    signals: Signal[]
    archetype_label?: string
    product_name?: string
    archetype?: string
    saturation_by_channel?: Record<string, number>
    open_channels?: string[]
    scan_focus?: string | null
  }
}

interface Supplier { id: string; company_name: string }
interface ImageRecord { id: string; label?: string; filename?: string; uploaded_at?: number }

export default function ProductAnalysis({ session: _session }: { session: Session }) {
  const [products, setProducts] = useState<Product[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [selected, setSelected] = useState<Product | null>(null)
  const [vault, setVault] = useState<VaultEntry | null>(null)
  const [images, setImages] = useState<ImageRecord[]>([])

  // Loading states
  const [listLoading, setListLoading] = useState(false)
  const [openLoading, setOpenLoading] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [addingUrl, setAddingUrl] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  // Error states
  const [scanError, setScanError] = useState('')
  const [registerError, setRegisterError] = useState('')
  const [reclassifyError, setReclassifyError] = useState('')

  // UI state
  const [triggerReason, setTriggerReason] = useState('INITIAL_SCAN')
  const [scanFocus, setScanFocus] = useState('')
  const [buyerTargets, setBuyerTargets] = useState<{ sectors: string[]; geography: string; suggested_prospects: Array<{ name: string; signal_type: string; rationale: string; website?: string | null }> } | null>(null)
  const [loadingTargets, setLoadingTargets] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [showReclassify, setShowReclassify] = useState(false)
  const [reclassifyArchetype, setReclassifyArchetype] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [urlLabel, setUrlLabel] = useState('')
  const [detectedArchetype, setDetectedArchetype] = useState<{ archetype: string; archetype_label: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  async function fetchBuyerTargets() {
    if (!selected) return
    setLoadingTargets(true)
    setBuyerTargets(null)
    try {
      const r = await fetch(`${API}/api/product-registry/${selected.product_id}/vault/buyer-targets`)
      if (r.ok) setBuyerTargets(await r.json())
    } catch { /* silent */ }
    setLoadingTargets(false)
  }

  const [form, setForm] = useState({
    product_name: '',
    description: '',
    purpose: 'own_product',
    supplier_id: '',
    geography: '',
  })

  useEffect(() => {
    fetchProducts()
    fetchSuppliers()
  }, [])

  async function fetchProducts() {
    setListLoading(true)
    try {
      const r = await fetch(`${API}/api/product-registry/`)
      const d = await r.json()
      setProducts(d.products || [])
    } catch { /* silent */ }
    setListLoading(false)
  }

  async function fetchSuppliers() {
    try {
      const r = await fetch(`${API}/api/knowledge-base/`)
      const d = await r.json()
      setSuppliers((d.knowledge_bases || []).map((kb: { id: string; company_name: string }) => ({
        id: kb.id,
        company_name: kb.company_name,
      })))
    } catch { /* silent */ }
  }

  async function openProduct(p: Product) {
    // Reset all detail state before loading
    setSelected(p)
    setVault(null)
    setImages([])
    setScanError('')
    setReclassifyError('')
    setShowReclassify(false)
    setReclassifyArchetype(p.archetype)
    setTriggerReason('INITIAL_SCAN')
    setOpenLoading(true)

    const [vaultR, imagesR] = await Promise.all([
      fetch(`${API}/api/product-registry/${p.product_id}/vault`),
      fetch(`${API}/api/product-registry/${p.product_id}/images`),
    ])
    if (vaultR.ok) setVault(await vaultR.json())
    if (imagesR.ok) {
      const d = await imagesR.json()
      setImages(d.images || [])
    }
    setOpenLoading(false)
  }

  function closeDetail() {
    setSelected(null)
    setVault(null)
    setImages([])
    setScanError('')
    setReclassifyError('')
    setShowReclassify(false)
  }

  async function detectArchetype() {
    if (!form.description) return
    try {
      const r = await fetch(`${API}/api/product-registry/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: [], description: form.description }),
      })
      const d = await r.json()
      setDetectedArchetype({ archetype: d.archetype, archetype_label: d.archetype_label })
    } catch { /* silent */ }
  }

  async function registerProduct() {
    if (!form.product_name || !form.description) {
      setRegisterError('Product name and description are required.')
      return
    }
    setRegistering(true)
    setRegisterError('')
    try {
      const slug = form.product_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const body: Record<string, unknown> = {
        product_id: `${slug}-${Date.now().toString(36)}`,
        product_name: form.product_name,
        description: form.description,
        purpose: form.purpose,
        geography: form.geography || undefined,
      }
      if (form.supplier_id) body.supplier_id = form.supplier_id
      const r = await fetch(`${API}/api/product-registry/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json()
        setRegisterError(err.detail || 'Registration failed')
        setRegistering(false)
        return
      }
      setForm({ product_name: '', description: '', purpose: 'own_product', supplier_id: '', geography: '' })
      setDetectedArchetype(null)
      setShowForm(false)
      await fetchProducts()
    } catch (e: unknown) {
      setRegisterError(String(e))
    }
    setRegistering(false)
  }

  async function applyReclassify() {
    if (!selected || !reclassifyArchetype) return
    setReclassifying(true)
    setReclassifyError('')
    try {
      const r = await fetch(`${API}/api/product-registry/${selected.product_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archetype: reclassifyArchetype }),
      })
      if (r.ok) {
        const updated: Product = {
          ...selected,
          archetype: reclassifyArchetype,
          archetype_label: ARCHETYPE_LABELS[reclassifyArchetype],
        }
        setSelected(updated)
        setProducts(ps => ps.map(p => p.product_id === selected.product_id ? updated : p))
        setShowReclassify(false)
      } else {
        const err = await r.json()
        setReclassifyError(err.detail || 'Reclassify failed')
      }
    } catch (e: unknown) {
      setReclassifyError(String(e))
    }
    setReclassifying(false)
  }

  async function runScan() {
    if (!selected) return
    setScanLoading(true)
    setScanError('')
    try {
      const r = await fetch(`${API}/api/product-registry/${selected.product_id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_reason: triggerReason,
          ...(scanFocus.trim() ? { scan_focus: scanFocus.trim() } : {}),
        }),
      })
      if (!r.ok) {
        const err = await r.json()
        setScanError(err.detail || 'Scan failed')
        setScanLoading(false)
        return
      }
      const vaultR = await fetch(`${API}/api/product-registry/${selected.product_id}/vault`)
      if (vaultR.ok) setVault(await vaultR.json())
    } catch (e: unknown) {
      setScanError(String(e))
    }
    setScanLoading(false)
  }

  async function addUrl() {
    if (!selected || !urlInput) return
    setAddingUrl(true)
    try {
      await fetch(`${API}/api/product-registry/${selected.product_id}/add-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput, label: urlLabel || urlInput }),
      })
      const updated = await fetch(`${API}/api/product-registry/${selected.product_id}`)
      if (updated.ok) setSelected(await updated.json())
      setUrlInput('')
      setUrlLabel('')
    } catch { /* silent */ }
    setAddingUrl(false)
  }

  async function uploadImage(file: File) {
    if (!selected) return
    setUploadingImage(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('label', file.name)
    try {
      await fetch(`${API}/api/product-registry/${selected.product_id}/image`, {
        method: 'POST', body: fd,
      })
      const imagesR = await fetch(`${API}/api/product-registry/${selected.product_id}/images`)
      if (imagesR.ok) setImages((await imagesR.json()).images || [])
    } catch { /* silent */ }
    setUploadingImage(false)
  }

  async function deleteImage(imageId: string) {
    if (!selected) return
    await fetch(`${API}/api/product-registry/${selected.product_id}/images/${imageId}`, { method: 'DELETE' })
    setImages(imgs => imgs.filter(i => i.id !== imageId))
  }

  const urgencyColor = (u: string) =>
    u === 'HIGH' ? '#ef4444' : u === 'MEDIUM' ? '#f59e0b' : '#6b7280'

  // ── Product detail view ────────────────────────────────────────────────────
  if (selected) {
    const aColor = ARCHETYPE_COLORS[selected.archetype] || '#6b7280'
    const linkedSupplier = suppliers.find(s => s.id === selected.supplier_id)

    return (
      <div className="max-w-5xl mx-auto">

        {/* Header row */}
        <div className="flex items-start gap-4 mb-6">
          <button
            onClick={closeDetail}
            className="text-xs uppercase tracking-widest px-3 py-1 rounded border mt-1 shrink-0"
            style={{ borderColor: 'var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
            &#8592; All Products
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white">{selected.product_name}</h1>
              {openLoading
                ? <Spinner size={16} color={aColor} />
                : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold uppercase"
                        style={{ background: aColor + '22', color: aColor, border: `1px solid ${aColor}55` }}>
                    {selected.archetype_label || ARCHETYPE_LABELS[selected.archetype] || selected.archetype}
                  </span>
                )
              }
              {!openLoading && (
                <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                  {PURPOSE_LABELS[selected.purpose] || selected.purpose}
                </span>
              )}
              {!openLoading && (
                <button
                  onClick={() => { setShowReclassify(r => !r); setReclassifyError('') }}
                  className="text-xs px-2 py-0.5 rounded border"
                  style={{ borderColor: 'var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                  {showReclassify ? 'Cancel' : 'Reclassify'}
                </button>
              )}
            </div>

            {/* Reclassify panel */}
            {showReclassify && (
              <div className="mt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={reclassifyArchetype}
                    onChange={e => setReclassifyArchetype(e.target.value)}
                    className="text-xs rounded px-2 py-1.5"
                    style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'white' }}>
                    {Object.entries(ARCHETYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <button
                    onClick={applyReclassify}
                    disabled={reclassifying || reclassifyArchetype === selected.archetype}
                    className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded flex items-center gap-2"
                    style={{ background: reclassifying ? '#333' : 'var(--stratagent-gold)', color: reclassifying ? 'var(--stratagent-gold)' : '#000', border: reclassifying ? '1px solid var(--stratagent-gold)' : 'none' }}>
                    {reclassifying && <Spinner size={12} color="var(--stratagent-gold)" />}
                    {reclassifying ? 'Saving...' : 'Apply'}
                  </button>
                  <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                    Fixes misclassified products &mdash; updates archetype and unlocks correct signal types
                  </span>
                </div>
                {reclassifyError && (
                  <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{reclassifyError}</p>
                )}
              </div>
            )}

            {selected.description && (
              <p className="text-sm mt-1" style={{ color: 'var(--stratagent-muted)' }}>{selected.description}</p>
            )}
            {linkedSupplier && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-gold)' }}>
                Linked supplier: {linkedSupplier.company_name}
              </p>
            )}
            {selected.geography && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                &#127757; {selected.geography}
              </p>
            )}
          </div>
        </div>

        {/* Detail body — shown once openLoading clears */}
        {!openLoading && (
          <div className="grid gap-6" style={{ gridTemplateColumns: '1fr 340px' }}>

            {/* Left: scan panel + signals */}
            <div className="flex flex-col gap-4">

              {/* Scan trigger */}
              <div className="rounded-lg p-4" style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--stratagent-gold)' }}>
                    STRATAGORA Analysis
                  </span>
                  {vault && (
                    <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                      v{vault.version} &middot; {vault.trigger_reason} &middot; {new Date(vault.locked_date).toLocaleDateString()}
                    </span>
                  )}
                </div>
                {/* Scan Instructions — always visible, placeholder adapts to trigger reason */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--stratagent-gold)' }}>
                      Scan Instructions
                    </label>
                    {scanFocus.trim() && (
                      <button onClick={() => setScanFocus('')} className="text-xs"
                        style={{ color: 'var(--stratagent-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                        Clear
                      </button>
                    )}
                  </div>
                  <p className="text-xs mb-1.5" style={{ color: 'var(--stratagent-muted)', lineHeight: 1.5 }}>
                    {triggerReason === 'PRODUCT_CHANGE'
                      ? 'Describe what changed about this product — new material, new target market, updated positioning, corrected description, etc.'
                      : triggerReason === 'NEW_COMPETITOR'
                      ? 'Name the competitor or describe the competitive shift you want the agent to factor in.'
                      : triggerReason === 'MARKET_SHIFT'
                      ? 'Describe the market change — new regulation, trend, channel shift, or pricing movement.'
                      : 'Clarify exactly what this product is and what to focus on. Corrects any wrong assumptions from the product name or image.'}
                  </p>
                  <textarea
                    rows={3}
                    placeholder={
                      triggerReason === 'PRODUCT_CHANGE'
                        ? 'e.g. This is ONLY the paper/recycled fabric liner inside a toothbrush charger — not the charger itself. Made from Haack Recycling fabric. Focus on eco-retailers, bathroom accessories, and hotel hygiene buyers.'
                        : triggerReason === 'NEW_COMPETITOR'
                        ? 'e.g. A new competitor launched a silicone version at half the price on Amazon — analyse the threat and identify differentiation opportunities.'
                        : triggerReason === 'MARKET_SHIFT'
                        ? 'e.g. New EU packaging sustainability rules take effect Q1 2026 — find compliance-driven channel opportunities.'
                        : 'e.g. Focus on Nordic design stores and hospitality buyers. Ignore DIY and hardware channels.'
                    }
                    value={scanFocus}
                    onChange={e => setScanFocus(e.target.value)}
                    disabled={scanLoading}
                    className="w-full text-xs rounded p-2.5 resize-none"
                    style={{
                      background: 'var(--stratagent-dark)',
                      border: `1px solid ${scanFocus.trim() ? 'var(--stratagent-gold)' : 'var(--stratagent-border)'}`,
                      color: 'var(--stratagent-text)',
                      lineHeight: 1.6,
                    }}
                  />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <select
                    value={triggerReason}
                    onChange={e => setTriggerReason(e.target.value)}
                    disabled={scanLoading}
                    className="text-xs rounded px-2 py-1.5"
                    style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                    {TRIGGER_REASONS.map(r => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                  <button
                    onClick={runScan}
                    disabled={scanLoading}
                    className="text-xs font-bold uppercase tracking-widest px-4 py-1.5 rounded flex items-center gap-2"
                    style={{
                      background: scanLoading ? '#333' : 'var(--stratagent-gold)',
                      color: scanLoading ? 'var(--stratagent-gold)' : '#000',
                      border: scanLoading ? '1px solid var(--stratagent-gold)' : 'none',
                      minWidth: '148px', justifyContent: 'center',
                    }}>
                    {scanLoading && <Spinner size={13} color="var(--stratagent-gold)" />}
                    {scanLoading ? 'Scanning...' : vault ? 'Re-scan Market' : 'Run First Scan'}
                  </button>
                </div>
                {scanLoading && (
                  <p className="text-xs mt-2" style={{ color: 'var(--stratagent-muted)' }}>
                    Querying live market data &mdash; 15&ndash;30 seconds&hellip;
                  </p>
                )}
                {scanError && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{scanError}</p>}
              </div>

              {/* Signal cards */}
              {vault && vault.analysis?.signals?.length > 0 && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
                      {vault.analysis.signal_count} Signal{vault.analysis.signal_count !== 1 ? 's' : ''} &middot; {vault.analysis.archetype_label}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={fetchBuyerTargets}
                        disabled={loadingTargets}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
                        style={{ background: '#1a2e1a', color: '#22c55e', border: '1px solid #22c55e44' }}>
                        {loadingTargets
                          ? <Spinner size={12} color="#22c55e" />
                          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
                        {loadingTargets ? 'Finding...' : 'Find Buyers'}
                      </button>
                      <button
                        onClick={() => {
                          const a = document.createElement('a')
                          a.href = `${API}/api/product-registry/${selected!.product_id}/vault/export-docx`
                          a.download = ''
                          a.click()
                        }}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg"
                        style={{ background: 'var(--stratagent-gold)18', color: 'var(--stratagent-gold)', border: '1px solid var(--stratagent-gold)44' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Export Brief
                      </button>
                    </div>
                  </div>
                  {vault.analysis.signals.map((sig, i) => (
                    <div key={i} className="rounded-lg p-4" style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 rounded"
                                style={{ background: aColor + '22', color: aColor }}>
                            {sig.signal_type}
                          </span>
                          {(sig.channel || sig.industry_vertical) && (
                            <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                              {sig.channel || sig.industry_vertical}
                            </span>
                          )}
                          {sig.saturation_score != null && (
                            <span className="text-xs font-bold" style={{ color: urgencyColor(sig.urgency) }}>
                              {sig.saturation_score}/100
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold" style={{ color: urgencyColor(sig.urgency) }}>{sig.urgency}</span>
                          <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{sig.confidence}</span>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-white mb-1">{sig.headline}</p>
                      <p className="text-xs mb-2" style={{ color: 'var(--stratagent-muted)' }}>{sig.detail}</p>
                      <p className="text-xs px-2 py-1 rounded"
                         style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-gold)' }}>
                        &#8594; {sig.action}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {vault && (!vault.analysis?.signals || vault.analysis.signals.length === 0) && (
                <div className="rounded-lg p-6 text-center"
                     style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                  <p style={{ color: 'var(--stratagent-muted)' }}>
                    Scan complete &mdash; no signals returned. Add more product detail or re-scan.
                  </p>
                </div>
              )}
            </div>

            {/* Right: images + URLs + vault meta */}
            <div className="flex flex-col gap-4">

              {/* Product images */}
              <div className="rounded-lg p-4" style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
                  Product Images
                </div>
                <div
                  className="rounded border-2 border-dashed p-4 text-center cursor-pointer mb-3 flex items-center justify-center gap-2"
                  style={{ borderColor: 'var(--stratagent-border)', color: 'var(--stratagent-muted)', minHeight: '60px' }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) uploadImage(f) }}>
                  <input
                    ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => { if (e.target.files?.[0]) uploadImage(e.target.files[0]) }}
                  />
                  {uploadingImage
                    ? <><Spinner size={14} color="var(--stratagent-muted)" /><span className="text-xs">Uploading...</span></>
                    : <span className="text-xs">Drop image / PDF or click to upload</span>
                  }
                </div>
                {images.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {images.map(img => (
                      <div key={img.id} className="flex items-center justify-between text-xs px-2 py-1 rounded"
                           style={{ background: 'var(--stratagent-dark)' }}>
                        <span className="truncate mr-2" style={{ color: 'var(--stratagent-muted)' }}>
                          {img.label || img.filename || img.id}
                        </span>
                        <button
                          onClick={() => deleteImage(img.id)}
                          className="shrink-0 hover:text-red-400 transition-colors"
                          style={{ color: 'var(--stratagent-muted)' }}>
                          &#215;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Source URLs */}
              <div className="rounded-lg p-4" style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
                  Source URLs
                </div>
                <input
                  type="text" placeholder="https://..." value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  className="w-full text-xs rounded px-2 py-1.5 mb-1"
                  style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'white' }}
                />
                <input
                  type="text" placeholder="Label (optional)" value={urlLabel}
                  onChange={e => setUrlLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addUrl() }}
                  className="w-full text-xs rounded px-2 py-1.5 mb-2"
                  style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'white' }}
                />
                <button
                  onClick={addUrl} disabled={addingUrl || !urlInput}
                  className="w-full text-xs font-bold uppercase tracking-widest py-1.5 rounded flex items-center justify-center gap-2"
                  style={{ background: 'var(--stratagent-border)', color: 'var(--stratagent-muted)', opacity: !urlInput ? 0.5 : 1 }}>
                  {addingUrl && <Spinner size={12} color="var(--stratagent-muted)" />}
                  {addingUrl ? 'Adding...' : 'Add URL'}
                </button>
                {selected.source_urls && selected.source_urls.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1">
                    {selected.source_urls.map((u, i) => (
                      <a key={i} href={u.url} target="_blank" rel="noopener noreferrer"
                         className="text-xs truncate hover:underline" style={{ color: 'var(--stratagent-gold)' }}>
                        {u.label || u.url}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {/* Vault metadata */}
              {vault && (
                <div className="rounded-lg p-4" style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-muted)' }}>
                    Analysis Vault &middot; v{vault.version}
                  </div>
                  <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                    Locked: {new Date(vault.locked_date).toLocaleString()}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                    Reason: {vault.trigger_reason.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                    Signals: {vault.analysis.signal_count}
                  </p>
                  {vault.analysis.scan_focus && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--stratagent-border)' }}>
                      <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--stratagent-gold)' }}>
                        Scan Instructions Used
                      </p>
                      <p className="text-xs" style={{ color: 'var(--stratagent-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        {vault.analysis.scan_focus}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Buyer Pipeline */}
              {buyerTargets && (
                <div className="rounded-lg p-4" style={{ background: 'var(--stratagent-panel)', border: '1px solid #22c55e44' }}>
                  <div className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: '#22c55e' }}>
                    Buyer Pipeline
                  </div>
                  {buyerTargets.sectors.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs mb-1.5" style={{ color: 'var(--stratagent-muted)' }}>Signal sectors</p>
                      <div className="flex flex-wrap gap-1.5">
                        {buyerTargets.sectors.map((s, i) => (
                          <span key={i} className="text-xs px-2 py-0.5 rounded-full"
                            style={{ background: '#1a2e1a', color: '#22c55e', border: '1px solid #22c55e33' }}>
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {buyerTargets.suggested_prospects.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs mb-0.5" style={{ color: 'var(--stratagent-muted)' }}>Suggested FI targets</p>
                      {buyerTargets.suggested_prospects.map((p, i) => (
                        <div key={i} className="rounded p-2.5" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-white truncate">{p.name}</p>
                              {p.website && (
                                <a
                                  href={p.website}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs truncate block"
                                  style={{ color: 'var(--stratagent-gold)', opacity: 0.8, maxWidth: '100%' }}
                                  onClick={e => e.stopPropagation()}>
                                  {p.website.replace(/^https?:\/\//, '')}
                                </a>
                              )}
                              <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)', lineHeight: 1.4 }}>{p.rationale}</p>
                            </div>
                            <button
                              onClick={() => navigate('/field-intelligence', { state: {
                                company_name: p.name,
                                supplier_id: selected?.supplier_id || '',
                                product_context: {
                                  product_name: vault?.analysis?.product_name || selected?.product_name,
                                  archetype: vault?.analysis?.archetype || selected?.archetype,
                                  signals: (vault?.analysis?.signals || []).slice(0, 6),
                                }
                              }})}
                              className="text-xs font-bold px-2.5 py-1 rounded whitespace-nowrap flex-shrink-0"
                              style={{ background: '#1a2e1a', color: '#22c55e', border: '1px solid #22c55e55' }}>
                              Run FI
                            </button>
                          </div>
                          <span className="text-xs mt-1 inline-block px-1.5 py-0.5 rounded"
                            style={{ background: '#0f1a0f', color: '#4ade80', fontSize: '10px' }}>
                            {p.signal_type}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                      No specific organisations identified from signals. Use the sector tags above to guide a STRATASCOUT hunt.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full-width loading skeleton while vault/images fetch */}
        {openLoading && (
          <div className="flex items-center justify-center gap-3 py-24" style={{ color: 'var(--stratagent-muted)' }}>
            <Spinner size={20} color="var(--stratagent-gold)" />
            <span className="text-sm">Loading product intelligence&hellip;</span>
          </div>
        )}
      </div>
    )
  }

  // ── Product list ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white uppercase tracking-widest">Product Analysis</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>
            Register any product &mdash; STRATAGORA classifies and scans the market automatically
          </p>
        </div>
        <button
          onClick={() => { setShowForm(f => !f); setRegisterError(''); setDetectedArchetype(null) }}
          className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded"
          style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
          {showForm ? 'Cancel' : '+ Add Product'}
        </button>
      </div>

      {/* Intake form */}
      {showForm && (
        <div className="rounded-lg p-5 mb-6" style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
          <div className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'var(--stratagent-gold)' }}>
            New Product
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: 'var(--stratagent-muted)' }}>
                Product Name *
              </label>
              <input
                type="text" placeholder="e.g. Ungunk Charge Guard"
                value={form.product_name}
                onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                className="w-full text-sm rounded px-3 py-2"
                style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'white' }}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: 'var(--stratagent-muted)' }}>
                Purpose
              </label>
              <select
                value={form.purpose}
                onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))}
                className="w-full text-sm rounded px-3 py-2"
                style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'white' }}>
                <option value="own_product">Own Product</option>
                <option value="affiliate_evaluation">Affiliate Evaluation</option>
                <option value="client_product">Client Product</option>
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: 'var(--stratagent-muted)' }}>
              Description * &mdash; one sentence: what it is and who buys it
            </label>
            <textarea
              rows={2}
              placeholder="A sustainable silicone guard for electric toothbrush charging stands, sold to design-conscious consumers and hotels."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              onBlur={detectArchetype}
              className="w-full text-sm rounded px-3 py-2 resize-none"
              style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'white' }}
            />
            <p className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>
              Tab out of this field to auto-detect the product archetype.
            </p>
          </div>

          {detectedArchetype && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>Detected archetype:</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded"
                    style={{
                      background: (ARCHETYPE_COLORS[detectedArchetype.archetype] || '#6b7280') + '22',
                      color: ARCHETYPE_COLORS[detectedArchetype.archetype] || '#6b7280',
                    }}>
                {detectedArchetype.archetype_label}
              </span>
            </div>
          )}

          <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: 'var(--stratagent-muted)' }}>
                Link to Supplier KB (optional)
              </label>
              <select
                value={form.supplier_id}
                onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                className="w-full text-sm rounded px-3 py-2"
                style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'white' }}>
                <option value="">&#8212; None &#8212;</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest block mb-1" style={{ color: 'var(--stratagent-muted)' }}>
                Primary Geography
              </label>
              <input
                type="text" placeholder="Denmark, Scandinavia, Global…"
                value={form.geography}
                onChange={e => setForm(f => ({ ...f, geography: e.target.value }))}
                className="w-full text-sm rounded px-3 py-2"
                style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'white' }}
              />
            </div>
          </div>

          {registerError && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>{registerError}</p>}

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={registerProduct} disabled={registering}
              className="text-sm font-bold uppercase tracking-widest px-6 py-2 rounded flex items-center gap-2"
              style={{
                background: registering ? '#333' : 'var(--stratagent-gold)',
                color: registering ? 'var(--stratagent-gold)' : '#000',
                border: registering ? '1px solid var(--stratagent-gold)' : 'none',
              }}>
              {registering && <Spinner size={14} color="var(--stratagent-gold)" />}
              {registering ? 'Registering...' : 'Register Product'}
            </button>
            <button
              onClick={() => { setShowForm(false); setRegisterError(''); setDetectedArchetype(null) }}
              className="text-sm px-4 py-2 rounded"
              style={{ color: 'var(--stratagent-muted)', background: 'none', border: '1px solid var(--stratagent-border)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Product tile grid */}
      {listLoading ? (
        <div className="flex items-center justify-center gap-3 py-24" style={{ color: 'var(--stratagent-muted)' }}>
          <Spinner size={20} color="var(--stratagent-gold)" />
          <span className="text-sm">Loading products&hellip;</span>
        </div>
      ) : products.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3" style={{ color: 'var(--stratagent-muted)' }}>
          <p className="text-sm">No products registered yet.</p>
          <p className="text-xs">Click <strong>+ Add Product</strong> above to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {products.map(p => (
            <div
              key={p.product_id}
              onClick={() => openProduct(p)}
              className="rounded-lg p-4 cursor-pointer transition-all"
              style={{
                background: 'var(--stratagent-panel)',
                border: `1px solid ${ARCHETYPE_COLORS[p.archetype] || 'var(--stratagent-border)'}44`,
              }}>
              {!!p.image_url && (
                <div className="mb-3 rounded overflow-hidden" style={{ height: 120, background: '#111' }}>
                  <img src={p.image_url as string} alt={p.product_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{p.product_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                    {(p.description || '').slice(0, 60)}{(p.description || '').length > 60 ? '…' : ''}
                  </p>
                </div>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded shrink-0"
                  style={{
                    background: (ARCHETYPE_COLORS[p.archetype] || '#6b7280') + '22',
                    color: ARCHETYPE_COLORS[p.archetype] || '#6b7280',
                  }}>
                  {ARCHETYPE_LABELS[p.archetype] || p.archetype || 'Unclassified'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
       </div>
  )
}
