import { useState, useEffect, useRef } from 'react'
import { api, setSession } from '../services/api'
import type { Session } from '../App'
import IntelligenceDepthGauge from '../components/KnowledgeBase/IntelligenceDepthGauge'
import GapList from '../components/KnowledgeBase/GapList'

type Step = 'list' | 'create' | 'view'

function thresholdColor(label: string) {
  if (label === 'SINGULARITY READY' || label === 'PROPOSAL READY') return '#10b981'
  if (label === 'VALUE BRIEF READY') return '#f59e0b'
  return '#ef4444'
}

export default function KnowledgeBase({ session }: { session: Session }) {
  const [step, setStep] = useState<Step>('list')
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [companyName, setCompanyName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [kb, setKb] = useState<any>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [newlyUnlocked, setNewlyUnlocked] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [urlContext, setUrlContext] = useState('')
  const [urlFocusElement, setUrlFocusElement] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [imgProductName, setImgProductName] = useState('')
  const [imgBrand, setImgBrand] = useState('')
  const [imgTags, setImgTags] = useState('')
  const [imgLoading, setImgLoading] = useState(false)
  const [productImages, setProductImages] = useState<any[]>([])
  const [imgSuccess, setImgSuccess] = useState<string | null>(null)

  const [syncLoading, setSyncLoading] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)
  const [discoverResult, setDiscoverResult] = useState<any[]>([])

  // Storage
  const [storageMap, setStorageMap] = useState<Record<string, any>>({})
  const [storageTotalSize, setStorageTotalSize] = useState<string>('')

  // Field Notes (Human Intel)
  const [fieldNotes, setFieldNotes] = useState<any[]>([])
  const [noteInput, setNoteInput] = useState('')
  const [noteLoading, setNoteLoading] = useState(false)
  const [noteResult, setNoteResult] = useState<any>(null)
  const [interviewMode, setInterviewMode] = useState(false)
  const [interviewLoading, setInterviewLoading] = useState(false)
  const [interviewQuestions, setInterviewQuestions] = useState<any[]>([])
  const [interviewAnswers, setInterviewAnswers] = useState<Record<number, string>>({})
  const [interviewSubmitting, setInterviewSubmitting] = useState(false)

  // STRATALYST
  const [stratalystLoading, setStratalystLoading] = useState(false)
  const [stratalystFindings, setStratalystFindings] = useState<any>(null)
  const [approvedSources, setApprovedSources] = useState<Set<number>>(new Set())
  const [stratalystIngesting, setStratalystIngesting] = useState(false)
  const [stratalystResult, setStratalystResult] = useState<any>(null)
  const [deepScanLoading, setDeepScanLoading] = useState(false)
  const [deepScanResult, setDeepScanResult] = useState<any>(null)

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlEditValue, setUrlEditValue] = useState('')
  const [editingSeed, setEditingSeed] = useState(false)
  const [seedProductPlain, setSeedProductPlain] = useState('')
  const [seedBuyerType, setSeedBuyerType] = useState('')
  const [seedUseCase, setSeedUseCase] = useState('')
  const [seedNotThis, setSeedNotThis] = useState('')
  const [seedSaving, setSeedSaving] = useState(false)
  const [draftSeed, setDraftSeed] = useState<any>(null)
  const [supplierOrder, setSupplierOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('stratagent_kb_order') || '[]') } catch { return [] }
  })
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const urlPanelRef = useRef<HTMLDivElement>(null)

  setSession(session.sessionId)

  useEffect(() => { loadSuppliers() }, [])

  function handleGapClick(element: string) {
    setUrlFocusElement(element)
    setUrlContext('This source addresses the gap in: ' + element)
    setTimeout(() => {
      urlPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      urlPanelRef.current?.querySelector('input')?.focus()
    }, 50)
  }

  function applySavedOrder(list: any[], order: string[]) {
    if (!order.length) return list
    const indexed = new Map(list.map(s => [s.supplier_id || s.id, s]))
    const sorted = order.flatMap(id => indexed.has(id) ? [indexed.get(id)!] : [])
    const rest = list.filter(s => !order.includes(s.supplier_id || s.id))
    return [...sorted, ...rest]
  }

  async function loadSuppliers() {
    setListLoading(true)
    try {
      const res = await api.get('/knowledge-base/')
      const list = res.data || []
      setSuppliers(applySavedOrder(list, supplierOrder))
      discoverFolders()
      loadStorage()
    } catch { setSuppliers([]) }
    finally { setListLoading(false) }
  }

  async function loadStorage() {
    try {
      const res = await api.get('/stratalyst/storage')
      const map: Record<string, any> = {}
      for (const s of res.data.suppliers || []) {
        map[s.supplier_id] = s
      }
      setStorageMap(map)
      setStorageTotalSize(res.data.grand_total_size || '')
    } catch { /* storage is non-critical */ }
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setDragOverIdx(idx)
  }

  function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setDragOverIdx(null); return }
    const reordered = [...suppliers]
    ;[reordered[dragIdx], reordered[idx]] = [reordered[idx], reordered[dragIdx]]
    const newOrder = reordered.map(s => s.supplier_id || s.id)
    setSuppliers(reordered)
    setSupplierOrder(newOrder)
    localStorage.setItem('stratagent_kb_order', JSON.stringify(newOrder))
    setDragIdx(null)
    setDragOverIdx(null)
  }

  async function openSupplier(supplier: any) {
    try {
      const id = supplier.supplier_id || supplier.id
      const res = await api.get('/knowledge-base/' + id)
      setKb(res.data)
      setDraftSeed(res.data.draft_seed || null)
      setStep('view')
      loadProductImages(id)
      loadFieldNotes(id)
    } catch { alert('Could not load supplier.') }
  }

  async function createKB() {
    setLoading(true)
    try {
      const res = await api.post('/knowledge-base/create', {
        company_name: companyName,
        website_url: websiteUrl || null,
        product_plain: seedProductPlain.trim() || null,
        buyer_type: seedBuyerType.trim() || null,
        use_case: seedUseCase.trim() || null,
        not_this: seedNotThis.trim() || null,
      })
      setKb(res.data)
      setStep('view')
      loadSuppliers()
      loadProductImages(res.data.supplier_id)
    } catch (e: any) {
      const detail = e.response?.data?.detail
      const msg = typeof detail === 'string' ? detail : detail?.message || 'Failed to create Knowledge Base'
      alert(msg)
    } finally { setLoading(false) }
  }

  async function uploadDocument(file: File) {
    setUploadLoading(true)
    setNewlyUnlocked(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await api.post('/knowledge-base/' + kb.supplier_id + '/upload', form)
      setKb(res.data)
      if (res.data.newly_unlocked) setNewlyUnlocked(res.data.newly_unlocked)
      loadSuppliers()
    } catch (e: any) { alert(e.response?.data?.detail || 'Upload failed') }
    finally { setUploadLoading(false) }
  }

  async function addUrl() {
    if (!urlInput.trim()) return
    setUrlLoading(true)
    const form = new FormData()
    form.append('url', urlInput.trim())
    form.append('focus_element', urlFocusElement)
    form.append('context_note', urlContext)
    try {
      const res = await api.post('/knowledge-base/' + kb.supplier_id + '/add-url', form)
      setKb(res.data)
      if (res.data.newly_unlocked) setNewlyUnlocked(res.data.newly_unlocked)
      setUrlInput('')
      setUrlContext('')
      setUrlFocusElement('')
      loadSuppliers()
    } catch (e: any) { alert(e.response?.data?.detail || 'Failed to add URL') }
    finally { setUrlLoading(false) }
  }

  async function uploadProductImage(file: File) {
    if (!imgProductName.trim()) { alert('Enter a product name first.'); return }
    setImgLoading(true)
    setImgSuccess(null)
    const form = new FormData()
    form.append('file', file)
    form.append('product_name', imgProductName.trim())
    form.append('brand', imgBrand.trim())
    form.append('tags', imgTags.trim())
    try {
      const res = await api.post('/knowledge-base/' + kb.supplier_id + '/images/upload', form)
      setImgSuccess('"' + res.data.product_name + '" saved and searchable in proposals.')
      setImgProductName(''); setImgBrand(''); setImgTags('')
      const imgRes = await api.get('/knowledge-base/' + kb.supplier_id + '/images')
      setProductImages(imgRes.data || [])
    } catch (e: any) { alert(e.response?.data?.detail || 'Image upload failed') }
    finally { setImgLoading(false) }
  }

  async function loadProductImages(supplierId: string) {
    try {
      const res = await api.get('/knowledge-base/' + supplierId + '/images')
      setProductImages(res.data || [])
    } catch { setProductImages([]) }
  }

  async function syncFolder() {
    setSyncLoading(true)
    setSyncResult(null)
    try {
      const res = await api.post('/folder-sync/' + kb.supplier_id + '/sync', {})
      setSyncResult(res.data)
      if (res.data.intelligence_depth) {
        setKb((prev: any) => ({ ...prev, intelligence_depth: res.data.intelligence_depth }))
        loadSuppliers()
      }
    } catch (e: any) { alert(e.response?.data?.detail || 'Sync failed') }
    finally { setSyncLoading(false) }
  }

  async function discoverFolders() {
    try {
      const res = await api.get('/folder-sync/discover')
      setDiscoverResult(res.data.unregistered || [])
    } catch { setDiscoverResult([]) }
  }

  async function loadFieldNotes(supplierId: string) {
    try {
      const res = await api.get('/stratalyst/' + supplierId + '/human-intel')
      setFieldNotes(res.data.notes || [])
    } catch { setFieldNotes([]) }
  }

  async function submitNote() {
    if (!noteInput.trim()) return
    setNoteLoading(true)
    setNoteResult(null)
    try {
      const res = await api.post('/stratalyst/' + kb.supplier_id + '/human-intel', { note: noteInput.trim() })
      setNoteResult(res.data)
      setNoteInput('')
      if (res.data.intelligence_depth) {
        setKb((prev: any) => ({ ...prev, intelligence_depth: res.data.intelligence_depth }))
        loadSuppliers()
      }
      loadFieldNotes(kb.supplier_id)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to save note')
    } finally { setNoteLoading(false) }
  }

  async function startInterview() {
    setInterviewMode(true)
    setInterviewLoading(true)
    setInterviewQuestions([])
    setInterviewAnswers({})
    try {
      const res = await api.post('/stratalyst/' + kb.supplier_id + '/interview', {})
      setInterviewQuestions(res.data.questions || [])
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Could not generate questions')
      setInterviewMode(false)
    } finally { setInterviewLoading(false) }
  }

  async function submitInterviewAnswers() {
    const answered = interviewQuestions
      .map((q: any, i: number) => ({ q, answer: interviewAnswers[i] }))
      .filter(({ answer }) => answer?.trim())
    if (!answered.length) return
    setInterviewSubmitting(true)
    try {
      for (const { q, answer } of answered) {
        const combined = `${q.question}\n\nAnswer: ${answer}`
        await api.post('/stratalyst/' + kb.supplier_id + '/human-intel', { note: combined })
      }
      loadFieldNotes(kb.supplier_id)
      setInterviewMode(false)
      setInterviewQuestions([])
      setInterviewAnswers({})
    } catch (e: any) {
      alert('Failed to save some answers')
    } finally { setInterviewSubmitting(false) }
  }

  async function runStratalyst() {
    setStratalystLoading(true)
    setStratalystFindings(null)
    setStratalystResult(null)
    setApprovedSources(new Set())
    try {
      const res = await api.post('/stratalyst/' + kb.supplier_id + '/research-gaps', {})
      setStratalystFindings(res.data)
      // Default: all sources approved
      if (res.data.sources?.length) {
        setApprovedSources(new Set(res.data.sources.map((_: any, i: number) => i)))
      }
    } catch (e: any) {
      alert(e.response?.data?.detail || 'STRATALYST research failed')
    } finally {
      setStratalystLoading(false)
    }
  }

  async function approveStratalystSources() {
    if (!stratalystFindings?.sources?.length) return
    const selected = stratalystFindings.sources.filter((_: any, i: number) => approvedSources.has(i))
    if (!selected.length) { alert('Select at least one source to approve.'); return }
    setStratalystIngesting(true)
    try {
      const res = await api.post('/stratalyst/' + kb.supplier_id + '/approve-sources', { sources: selected })
      setStratalystResult(res.data)
      setKb((prev: any) => ({ ...prev, intelligence_depth: res.data.intelligence_depth }))
      loadSuppliers()
      setStratalystFindings(null)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Ingestion failed')
    } finally {
      setStratalystIngesting(false)
    }
  }

  async function runDeepScan() {
    setDeepScanLoading(true)
    setDeepScanResult(null)
    try {
      const res = await api.post('/stratalyst/' + kb.supplier_id + '/deep-scan', {})
      setDeepScanResult(res.data)
      // Reload full KB so draft_seed (and any other new fields) are reflected
      const fresh = await api.get('/knowledge-base/' + kb.supplier_id)
      setKb(fresh.data)
      if (fresh.data.draft_seed && !fresh.data.manual_seed?.product_plain) {
        setDraftSeed(fresh.data.draft_seed)
      }
      loadSuppliers()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Deep scan failed')
    } finally {
      setDeepScanLoading(false)
    }
  }

  function toggleSource(idx: number) {
    setApprovedSources(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  async function saveRename() {
    if (!renameValue.trim() || renameValue.trim() === kb.company_name) { setRenaming(false); return }
    const form = new FormData()
    form.append('company_name', renameValue.trim())
    try {
      const res = await api.patch('/knowledge-base/' + kb.supplier_id + '/rename', form)
      setKb((prev: any) => ({ ...prev, company_name: res.data.company_name }))
      loadSuppliers()
    } catch (e: any) { alert(e.response?.data?.detail || 'Rename failed') }
    finally { setRenaming(false) }
  }

  async function saveUrl() {
    const form = new FormData()
    form.append('website_url', urlEditValue.trim())
    try {
      const res = await api.patch('/knowledge-base/' + kb.supplier_id + '/update-url', form)
      setKb((prev: any) => ({ ...prev, website_url: res.data.website_url }))
      if (res.data?.scan_triggered) {
        setDeepScanResult({ scanning: true })
      }
    } catch (e: any) { alert(e.response?.data?.detail || 'Update failed') }
    finally { setEditingUrl(false) }
  }

  function openSeedEditor() {
    const seed = kb?.manual_seed || {}
    setSeedProductPlain(seed.product_plain || '')
    setSeedBuyerType(seed.buyer_type || '')
    setSeedUseCase(seed.use_case || '')
    setSeedNotThis(seed.not_this || '')
    setEditingSeed(true)
  }

  function acceptDraftSeed() {
    if (!draftSeed) return
    setSeedProductPlain(draftSeed.product_plain || '')
    setSeedBuyerType(draftSeed.buyer_type || '')
    setSeedUseCase(draftSeed.use_case || '')
    setSeedNotThis(draftSeed.not_this || '')
    setDraftSeed(null)
    setEditingSeed(true)
  }

  async function saveSeed() {
    setSeedSaving(true)
    const form = new FormData()
    form.append('product_plain', seedProductPlain.trim())
    form.append('buyer_type', seedBuyerType.trim())
    form.append('use_case', seedUseCase.trim())
    form.append('not_this', seedNotThis.trim())
    try {
      const res = await api.patch('/knowledge-base/' + kb.supplier_id + '/update-seed', form)
      setKb((prev: any) => ({ ...prev, manual_seed: res.data.manual_seed }))
      setEditingSeed(false)
    } catch (e: any) { alert(e.response?.data?.detail || 'Save failed') }
    finally { setSeedSaving(false) }
  }

  // LIST
  if (step === 'list') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black" style={{ color: 'var(--stratagent-text)' }}>
              Knowledge Base
            </h2>
            <p className="text-sm mt-1 flex items-center gap-3" style={{ color: 'var(--stratagent-muted)' }}>
              <span>{suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''} indexed</span>
              {storageTotalSize && (
                <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                  {storageTotalSize} total storage
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => { setCompanyName(''); setWebsiteUrl(''); setStep('create') }}
            className="px-5 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            + New Supplier
          </button>
        </div>

        {discoverResult.length > 0 && (
          <div className="mb-6 p-4 rounded-xl"
               style={{ background: '#0f1f0f', border: '1px solid #10b981' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#10b981' }}>
                {discoverResult.length} folder{discoverResult.length !== 1 ? 's' : ''} ready to onboard
              </span>
              <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                Click to create a Knowledge Base
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {discoverResult.map(f => (
                <button key={f.name}
                  onClick={() => { setCompanyName(f.name); setWebsiteUrl(''); setStep('create') }}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{ background: '#10b981', color: '#000' }}>
                  + {f.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {listLoading ? (
          <div className="text-center py-20" style={{ color: 'var(--stratagent-muted)' }}>
            <div className="text-sm uppercase tracking-widest">Loading suppliers...</div>
          </div>
        ) : suppliers.length === 0 ? (
          <div className="text-center py-20 rounded-xl"
               style={{ border: '2px dashed var(--stratagent-border)' }}>
            <div className="text-sm uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
              No suppliers yet
            </div>
            <p className="text-xs mb-6" style={{ color: 'var(--stratagent-muted)' }}>
              Add your first supplier to start building intelligence.
            </p>
            <button
              onClick={() => { setCompanyName(''); setWebsiteUrl(''); setStep('create') }}
              className="px-5 py-2 rounded-lg text-sm font-semibold"
              style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              + New Supplier
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {suppliers.map((s, idx) => {
              const total = s.intelligence_depth?.total ?? 0
              const label = s.threshold_status?.label ?? 'INTELLIGENCE GAP'
              const color = thresholdColor(label)
              const docCount = s.documents?.length ?? 0
              const storage = storageMap[s.supplier_id || s.id]
              const isDragging = dragIdx === idx
              const isTarget = dragOverIdx === idx && dragIdx !== idx
              return (
                <div
                  key={s.supplier_id || s.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
                  className="rounded-xl transition-all"
                  style={{
                    opacity: isDragging ? 0.4 : 1,
                    border: isTarget ? '2px solid var(--stratagent-gold)' : '1px solid var(--stratagent-border)',
                    background: 'var(--stratagent-panel)',
                    transform: isTarget ? 'scale(1.02)' : undefined,
                    cursor: 'grab',
                  }}>
                  <button
                    onClick={() => openSupplier(s)}
                    className="w-full text-left p-4 rounded-xl"
                    style={{ cursor: 'pointer' }}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate" style={{ color: 'var(--stratagent-text)' }}>
                          {s.company_name}
                        </div>
                        <div className="text-xs uppercase tracking-widest mt-0.5" style={{ color }}>
                          {label}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                        {/* drag handle */}
                        <span className="opacity-20 select-none text-xs leading-none" style={{ color: 'var(--stratagent-text)', letterSpacing: '-1px' }}>
                          ⠿
                        </span>
                        <svg className="w-4 h-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                             style={{ color: 'var(--stratagent-text)' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--stratagent-dark)' }}>
                        <div className="h-full rounded-full" style={{ width: Math.min(total, 100) + '%', background: color }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--stratagent-text)' }}>
                        {Math.round(total)}
                      </span>
                      {docCount > 0 && (
                        <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                          · {docCount} doc{docCount !== 1 ? 's' : ''}
                        </span>
                      )}
                      {storage?.total_size && (
                        <span className="text-xs ml-auto tabular-nums"
                              style={{ color: storage.image_bytes > 100000 ? '#f59e0b' : 'var(--stratagent-muted)' }}>
                          {storage.total_size}
                        </span>
                      )}
                    </div>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // CREATE
  if (step === 'create') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep('list')}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
            Back
          </button>
          <h2 className="text-2xl font-black" style={{ color: 'var(--stratagent-text)' }}>
            New Knowledge Base
          </h2>
        </div>
        <p className="text-sm mb-8" style={{ color: 'var(--stratagent-muted)' }}>
          Enter the supplier name and website. STRATAGENT will research them automatically.
        </p>
        <div className="space-y-4 p-6 rounded-xl"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-muted)' }}>
              Company Name *
            </label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Strategic Sales International ApS"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-muted)' }}>
              Website URL
            </label>
            <input value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
              placeholder="https://www.example.com"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
          </div>

          {/* STRATALYST Draft Seed proposal — shown when scan proposes but no seed confirmed yet */}
          {draftSeed && !kb?.manual_seed?.product_plain && (
            <div className="p-5 rounded-xl space-y-3"
                 style={{ background: '#1c1400', border: '1px solid #92400e' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: '#f59e0b' }}>
                    ⚡ STRATALYST — Draft Agent Definition
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                    Proposed from your website scan. Review, edit if needed, then save.
                  </div>
                </div>
                <button onClick={() => setDraftSeed(null)}
                        className="text-xs px-2 py-1 rounded"
                        style={{ color: 'var(--stratagent-muted)', background: 'var(--stratagent-dark)' }}>
                  Dismiss
                </button>
              </div>
              <div className="space-y-2 text-xs" style={{ color: 'var(--stratagent-text)' }}>
                {[
                  ['What it sells', draftSeed.product_plain],
                  ['Who buys it', draftSeed.buyer_type],
                  ['Used for', draftSeed.use_case],
                  ['NOT this', draftSeed.not_this],
                ].map(([label, val]) => val ? (
                  <div key={label}>
                    <span className="font-semibold" style={{ color: '#f59e0b' }}>{label}: </span>
                    {val}
                  </div>
                ) : null)}
              </div>
              <button
                onClick={acceptDraftSeed}
                className="text-xs px-4 py-2 rounded-lg font-semibold"
                style={{ background: '#f59e0b', color: '#000' }}>
                Review &amp; Confirm →
              </button>
            </div>
          )}

          {/* Agent Definition — manual seed */}
          <div className="pt-2 pb-1">
            <div className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--stratagent-gold)' }}>
              Agent Definition <span style={{ color: 'var(--stratagent-muted)', fontWeight: 400 }}>(recommended — your words anchor every AI hunt and research run)</span>
            </div>
            <div className="space-y-3 mt-3">
              {[
                { label: 'What does this supplier sell?', hint: 'Plain English, literal. No marketing speak.', placeholder: 'e.g. Biodegradable paper tea and coffee filter bags, sold in 100-packs for single-cup brewing', val: seedProductPlain, set: setSeedProductPlain },
                { label: 'Who buys this?', hint: 'The actual buyer type.', placeholder: 'e.g. Hotel procurement managers, Airbnb hosts, cafe owners, office managers', val: seedBuyerType, set: setSeedBuyerType },
                { label: 'What do buyers use it for?', hint: 'The use case in one sentence.', placeholder: 'e.g. Placing in a cup, adding tea/coffee, pouring hot water through it', val: seedUseCase, set: setSeedUseCase },
                { label: 'What is this NOT?', hint: 'Prevents AI from confusing this with similar-sounding products.', placeholder: 'e.g. NOT a water filter. NOT an RO system. NOT industrial filtration equipment.', val: seedNotThis, set: setSeedNotThis },
              ].map(({ label, hint, placeholder, val, set }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold mb-0.5" style={{ color: 'var(--stratagent-text)' }}>{label}</label>
                  <p className="text-xs mb-1" style={{ color: 'var(--stratagent-muted)' }}>{hint}</p>
                  <input value={val} onChange={e => set(e.target.value)}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 rounded-lg text-xs outline-none"
                    style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
                </div>
              ))}
            </div>
          </div>

          <button onClick={createKB} disabled={loading || !companyName}
            className="w-full py-3 rounded-lg font-semibold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            {loading && (
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {loading ? 'Researching supplier — this may take 30s...' : 'Build Knowledge Base'}
          </button>
        </div>
      </div>
    )
  }

  // VIEW
  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('list')}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
            All Suppliers
          </button>
          <div>
            {renaming ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                       onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setRenaming(false) }}
                       className="text-2xl font-black px-2 py-0.5 rounded outline-none"
                       style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-gold)', color: 'var(--stratagent-text)', width: '280px' }} />
                <button onClick={saveRename} className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                        style={{ background: 'var(--stratagent-gold)', color: '#000' }}>Save</button>
                <button onClick={() => setRenaming(false)} className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black" style={{ color: 'var(--stratagent-text)' }}>{kb?.company_name}</h2>
                <button onClick={() => { setRenameValue(kb.company_name); setRenaming(true) }}
                        className="text-xs opacity-40 hover:opacity-100 px-1.5 py-0.5 rounded"
                        style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}
                        title="Rename">
                  ✎
                </button>
              </div>
            )}
            <p className="text-xs uppercase tracking-widest mt-1" style={{ color: 'var(--stratagent-gold)' }}>
              {kb?.threshold_status?.label}
            </p>
            {editingUrl ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  autoFocus
                  value={urlEditValue}
                  onChange={e => setUrlEditValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveUrl(); if (e.key === 'Escape') setEditingUrl(false) }}
                  placeholder="https://..."
                  className="text-xs px-2 py-1 rounded outline-none"
                  style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-gold)', color: 'var(--stratagent-text)', width: '260px' }}
                />
                <button onClick={saveUrl} className="text-xs px-2 py-1 rounded font-semibold"
                        style={{ background: 'var(--stratagent-gold)', color: '#000' }}>Save</button>
                <button onClick={() => setEditingUrl(false)} className="text-xs px-2 py-1 rounded"
                        style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>Cancel</button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1">
                {kb?.website_url ? (
                  <a href={kb.website_url} target="_blank" rel="noopener noreferrer"
                     className="text-xs hover:underline"
                     style={{ color: 'var(--stratagent-muted)' }}>
                    {kb.website_url.replace(/^https?:\/\//, '')}
                  </a>
                ) : (
                  <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>No URL set</span>
                )}
                <button
                  onClick={() => { setUrlEditValue(kb?.website_url || ''); setEditingUrl(true) }}
                  className="text-xs opacity-40 hover:opacity-100 px-1 py-0.5 rounded"
                  style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}
                  title="Edit URL">
                  ✎
                </button>
              </div>
            )}
          </div>
        </div>
        <button onClick={() => { setCompanyName(''); setWebsiteUrl(''); setStep('create') }}
                className="text-xs px-4 py-2 rounded-lg"
                style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
          + New Supplier
        </button>
      </div>

      {newlyUnlocked && (
        <div className="mb-4 p-4 rounded-lg text-sm font-semibold"
             style={{ background: '#064e3b', color: 'var(--stratagent-green)', border: '1px solid var(--stratagent-green)' }}>
          {newlyUnlocked}
        </div>
      )}

      {/* ── MANUAL SEED PANEL ── */}
      {!editingSeed ? (
        <div className="mb-4 p-4 rounded-xl"
             style={{ background: 'var(--stratagent-panel)', border: kb?.manual_seed?.product_plain ? '1px solid var(--stratagent-border)' : '1px solid #92400e' }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest font-semibold"
                   style={{ color: kb?.manual_seed?.product_plain ? 'var(--stratagent-gold)' : '#f59e0b' }}>
                {kb?.manual_seed?.product_plain ? 'Agent Definition' : '⚠ Agent Definition — Not set'}
              </div>
              {kb?.manual_seed?.product_plain ? (
                <div className="mt-1 space-y-0.5">
                  <p className="text-xs" style={{ color: 'var(--stratagent-text)' }}>
                    <span style={{ color: 'var(--stratagent-muted)' }}>Sells: </span>{kb.manual_seed.product_plain}
                  </p>
                  {kb.manual_seed.buyer_type && (
                    <p className="text-xs" style={{ color: 'var(--stratagent-text)' }}>
                      <span style={{ color: 'var(--stratagent-muted)' }}>Buyer: </span>{kb.manual_seed.buyer_type}
                    </p>
                  )}
                  {kb.manual_seed.not_this && (
                    <p className="text-xs" style={{ color: '#ef444488' }}>
                      <span style={{ color: '#ef444488' }}>Not: </span>{kb.manual_seed.not_this}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>
                  Agents are guessing what this supplier sells. Define it so they search for the right buyers.
                </p>
              )}
            </div>
            <button onClick={openSeedEditor}
                    className="text-xs px-3 py-1.5 rounded-lg flex-shrink-0 ml-4"
                    style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
              {kb?.manual_seed?.product_plain ? '✎ Edit' : '+ Define'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-4 p-5 rounded-xl space-y-4"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold)' }}>
          <div className="text-xs uppercase tracking-widest font-semibold mb-1"
               style={{ color: 'var(--stratagent-gold)' }}>
            Agent Definition — Your words, not AI guesses
          </div>
          <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
            These four fields are fed to every agent before anything else. Plain language only — no marketing speak. The clearer this is, the better every hunt and research run will be.
          </p>

          {[
            { label: 'What does this supplier sell?', hint: 'Literal, plain English. e.g. "Biodegradable paper tea and coffee filter bags sold in 100-packs for single-cup brewing."', val: seedProductPlain, set: setSeedProductPlain },
            { label: 'Who buys this?', hint: 'The actual buyer type. e.g. "Hotel procurement managers, Airbnb Superhost operators, cafe owners, office managers."', val: seedBuyerType, set: setSeedBuyerType },
            { label: 'What do buyers use it for?', hint: 'The use case. e.g. "Placing a filter in a cup or teapot, adding loose tea or coffee, pouring hot water through it."', val: seedUseCase, set: setSeedUseCase },
            { label: 'What is this NOT? (disambiguation)', hint: 'Stops AI from confusing this with similar-sounding products. e.g. "NOT a water filter. NOT an RO system. NOT industrial filtration. NOT a water treatment product."', val: seedNotThis, set: setSeedNotThis },
          ].map(({ label, hint, val, set }) => (
            <div key={label}>
              <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--stratagent-text)' }}>
                {label}
              </label>
              <p className="text-xs mb-1.5" style={{ color: 'var(--stratagent-muted)' }}>{hint}</p>
              <textarea
                value={val}
                onChange={e => set(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
              />
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <button onClick={saveSeed} disabled={seedSaving || !seedProductPlain.trim()}
                    className="px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                    style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              {seedSaving ? 'Saving...' : 'Save Definition'}
            </button>
            <button onClick={() => setEditingSeed(false)}
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <IntelligenceDepthGauge
        scores={kb?.intelligence_depth?.scores || {}}
        total={kb?.intelligence_depth?.total || 0}
        thresholdStatus={kb?.threshold_status}
      />

      <GapList gaps={kb?.gaps || []} onGapClick={handleGapClick} />

      <div className="mt-6 p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <div className="text-xs uppercase tracking-widest mb-4" style={{ color: 'var(--stratagent-muted)' }}>
          Upload Document (PDF)
        </div>
        <label className="flex items-center justify-center w-full py-8 rounded-lg cursor-pointer"
               style={{ border: '2px dashed var(--stratagent-border)' }}>
          <input type="file" accept=".pdf" className="hidden"
                 onChange={e => e.target.files?.[0] && uploadDocument(e.target.files[0])}
                 disabled={uploadLoading} />
          <span className="text-sm" style={{ color: 'var(--stratagent-muted)' }}>
            {uploadLoading ? 'Extracting intelligence...' : 'Click to upload PDF'}
          </span>
        </label>
      </div>

      <div ref={urlPanelRef} className="mt-4 p-6 rounded-xl"
           style={{
             background: 'var(--stratagent-panel)',
             border: urlFocusElement ? '1px solid var(--stratagent-gold)' : '1px solid var(--stratagent-border)',
           }}>
        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-muted)' }}>
          Add Web Source
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--stratagent-muted)' }}>
          Paste a URL and tell STRATAGENT what it covers. This context is passed directly to the AI so it knows what to look for.
        </p>

        {urlFocusElement && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs flex items-center justify-between"
               style={{ background: '#1c1400', border: '1px solid var(--stratagent-gold)', color: 'var(--stratagent-gold)' }}>
            <span>Filling gap: <strong>{urlFocusElement}</strong></span>
            <button onClick={() => { setUrlFocusElement(''); setUrlContext('') }}
                    className="ml-2 opacity-60 hover:opacity-100">x</button>
          </div>
        )}

        <div className="space-y-3">
          <textarea
            value={urlContext}
            onChange={e => setUrlContext(e.target.value)}
            placeholder="What does this source cover? e.g. 'Our case studies page showing oil & gas reference projects' or 'LinkedIn page with company overview and certifications'"
            rows={2}
            className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
            style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
          />
          <div className="flex gap-2">
            <input value={urlInput} onChange={e => setUrlInput(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && addUrl()}
                   placeholder="https://..."
                   className="flex-1 px-4 py-3 rounded-lg text-sm outline-none"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
            <button onClick={addUrl} disabled={urlLoading || !urlInput.trim()}
                    className="px-5 py-3 rounded-lg text-sm font-semibold disabled:opacity-40 shrink-0"
                    style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              {urlLoading ? 'Extracting...' : 'Add'}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--stratagent-muted)' }}>
          Product / Service Images
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--stratagent-muted)' }}>
          Tag images with a product or brand name so STRATAGENT can pull them into proposals and reports.
        </p>
        {imgSuccess && (
          <div className="mb-4 px-4 py-3 rounded-lg text-xs font-semibold"
               style={{ background: '#064e3b', color: '#10b981', border: '1px solid #10b981' }}>
            {imgSuccess}
          </div>
        )}
        <div className="space-y-3 mb-4">
          <input value={imgProductName} onChange={e => setImgProductName(e.target.value)}
                 placeholder="Product / Service name *"
                 className="w-full px-4 py-3 rounded-lg text-sm outline-none"
                 style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
          <div className="grid grid-cols-2 gap-3">
            <input value={imgBrand} onChange={e => setImgBrand(e.target.value)}
                   placeholder="Brand (optional)"
                   className="px-4 py-3 rounded-lg text-sm outline-none"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
            <input value={imgTags} onChange={e => setImgTags(e.target.value)}
                   placeholder="Tags e.g. pump, valve, ATEX"
                   className="px-4 py-3 rounded-lg text-sm outline-none"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }} />
          </div>
        </div>
        <label className="flex items-center justify-center w-full py-6 rounded-lg cursor-pointer"
               style={{ border: '2px dashed var(--stratagent-border)' }}>
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                 onChange={e => e.target.files?.[0] && uploadProductImage(e.target.files[0])}
                 disabled={imgLoading || !imgProductName.trim()} />
          <span className="text-sm"
                style={{ color: imgProductName.trim() ? 'var(--stratagent-muted)' : '#4b5563' }}>
            {imgLoading ? 'Saving image...' : imgProductName.trim() ? 'Click to upload image (JPEG, PNG, WebP, max 5 MB)' : 'Enter a product name above first'}
          </span>
        </label>
        {productImages.length > 0 && (
          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
              Saved Images ({productImages.length})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {productImages.map(img => (
                <div key={img.image_id || img.id} className="rounded-lg overflow-hidden"
                     style={{ border: '1px solid var(--stratagent-border)' }}>
                  {img.data && (
                    <img src={'data:' + img.content_type + ';base64,' + img.data}
                         alt={img.product_name} className="w-full h-28 object-cover" />
                  )}
                  <div className="p-2">
                    <div className="text-xs font-semibold truncate" style={{ color: 'var(--stratagent-text)' }}>
                      {img.product_name}
                    </div>
                    {img.brand && (
                      <div className="text-xs truncate" style={{ color: 'var(--stratagent-gold)' }}>{img.brand}</div>
                    )}
                    {img.tags && (
                      <div className="text-xs truncate mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>{img.tags}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
            Sync Local Folder
          </div>
          <button onClick={syncFolder} disabled={syncLoading}
                  className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-2"
                  style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            {syncLoading && (
              <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 11-8 8z" />
              </svg>
            )}
            {syncLoading ? 'Scanning...' : 'Sync Now'}
          </button>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--stratagent-muted)' }}>
          Scans your local Suppliers/{kb?.company_name}/ folder for PDFs and images added offline. Drop files in any subfolder (Case Studies, Certifications, Product) and sync to ingest them.
        </p>

        {syncResult && (
          <div className="mt-3 rounded-lg p-3 text-xs space-y-1"
               style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
            {syncResult.status === 'no_folder' && (
              <div style={{ color: '#f59e0b' }}>{syncResult.message}</div>
            )}
            {syncResult.status === 'up_to_date' && (
              <div style={{ color: '#10b981' }}>{syncResult.message}</div>
            )}
            {syncResult.status === 'synced' && (
              <>
                <div style={{ color: '#10b981' }}>
                  Synced {syncResult.ingested_count} new file{syncResult.ingested_count !== 1 ? 's' : ''}
                  {syncResult.skipped > 0 && ' (' + syncResult.skipped + ' already ingested)'}
                </div>
                {syncResult.ingested.map((f: any, i: number) => (
                  <div key={i} style={{ color: 'var(--stratagent-muted)' }}>
                    {f.subfolder}/{f.file} ({f.type})
                  </div>
                ))}
                {syncResult.errors?.length > 0 && (
                  <div style={{ color: '#ef4444' }}>{syncResult.errors.length} error(s) -- check filenames</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Field Notes — Human Intel */}
      <div className="mt-4 p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>

        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--stratagent-gold)' }}>
              Field Notes
            </span>
            {fieldNotes.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded"
                    style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                {fieldNotes.filter(n => n.classification === 'NEED TO KNOW').length} NTK
                · {fieldNotes.filter(n => n.classification === 'NICE TO KNOW').length} NTK2
              </span>
            )}
          </div>
          {!interviewMode && (
            <button onClick={startInterview}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
              Start Interview
            </button>
          )}
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--stratagent-muted)' }}>
          Drop in anything you learn from calls, visits, or conversations. STRATALYST classifies it and pulls the strategic intelligence into the KB.
        </p>

        {/* Quick Drop */}
        {!interviewMode && (
          <div className="space-y-3">
            <textarea
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder={'Spoke with Erik today — they\'re expanding into Poland next year, budget approved. Current label supplier is failing on their new high-temp line...'}
              rows={3}
              className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
              style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
            />
            <button onClick={submitNote} disabled={noteLoading || !noteInput.trim()}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                    style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              {noteLoading && (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {noteLoading ? 'Classifying...' : 'Save Field Note'}
            </button>

            {noteResult && (
              <div className="p-3 rounded-lg text-xs space-y-1"
                   style={{ background: noteResult.classification === 'NEED TO KNOW' ? '#1a1500' : 'var(--stratagent-dark)',
                            border: `1px solid ${noteResult.classification === 'NEED TO KNOW' ? 'var(--stratagent-gold)' : 'var(--stratagent-border)'}` }}>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs px-2 py-0.5 rounded"
                        style={{ background: noteResult.classification === 'NEED TO KNOW' ? 'var(--stratagent-gold)' : 'var(--stratagent-dark)',
                                 color: noteResult.classification === 'NEED TO KNOW' ? '#000' : 'var(--stratagent-muted)',
                                 border: noteResult.classification !== 'NEED TO KNOW' ? '1px solid var(--stratagent-border)' : 'none' }}>
                    {noteResult.classification}
                  </span>
                  <span style={{ color: 'var(--stratagent-text)' }}>{noteResult.headline}</span>
                </div>
                <div style={{ color: 'var(--stratagent-muted)' }}>{noteResult.classification_reason}</div>
                {noteResult.contributed_to_depth && (
                  <div style={{ color: '#10b981' }}>
                    Contributed to Intelligence Depth — new score: {Math.round(noteResult.intelligence_depth?.total ?? 0)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Interview Mode */}
        {interviewMode && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--stratagent-gold)' }}>
                Interview — answer what you know
              </span>
              <button onClick={() => { setInterviewMode(false); setInterviewQuestions([]); setInterviewAnswers({}) }}
                      className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                Cancel
              </button>
            </div>

            {interviewLoading && (
              <div className="flex items-center gap-3 py-4 justify-center">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24" style={{ color: 'var(--stratagent-gold)' }}>
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm" style={{ color: 'var(--stratagent-muted)' }}>Preparing questions...</span>
              </div>
            )}

            {interviewQuestions.map((q: any, i: number) => (
              <div key={i} className="space-y-2">
                <div className="text-sm font-semibold" style={{ color: 'var(--stratagent-text)' }}>
                  {i + 1}. {q.question}
                </div>
                <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{q.why_valuable}</div>
                <textarea
                  value={interviewAnswers[i] || ''}
                  onChange={e => setInterviewAnswers(prev => ({ ...prev, [i]: e.target.value }))}
                  placeholder="Your answer — skip if you don't know"
                  rows={2}
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
                  style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
                />
              </div>
            ))}

            {interviewQuestions.length > 0 && (
              <button onClick={submitInterviewAnswers} disabled={interviewSubmitting || !Object.values(interviewAnswers).some(a => a?.trim())}
                      className="w-full py-3 rounded-lg text-sm font-semibold disabled:opacity-40"
                      style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                {interviewSubmitting ? 'Saving answers...' : 'Save Answers'}
              </button>
            )}
          </div>
        )}

        {/* Notes Log */}
        {fieldNotes.length > 0 && !interviewMode && (
          <div className="mt-5 space-y-2">
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-muted)' }}>
              Captured Intelligence ({fieldNotes.length})
            </div>
            {fieldNotes.map((note: any) => (
              <div key={note.note_id} className="p-3 rounded-lg"
                   style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-xs px-1.5 py-0.5 rounded font-semibold shrink-0"
                        style={{ background: note.classification === 'NEED TO KNOW' ? 'var(--stratagent-gold)' : 'transparent',
                                 color: note.classification === 'NEED TO KNOW' ? '#000' : 'var(--stratagent-muted)',
                                 border: note.classification !== 'NEED TO KNOW' ? '1px solid var(--stratagent-border)' : 'none' }}>
                    {note.classification === 'NEED TO KNOW' ? 'NTK' : 'N2K'}
                  </span>
                  <span className="text-xs font-semibold" style={{ color: 'var(--stratagent-text)' }}>
                    {note.headline}
                  </span>                </div>
                <div className="text-xs pl-8" style={{ color: 'var(--stratagent-muted)' }}>
                  {note.raw_note.length > 120 ? note.raw_note.slice(0, 120) + '...' : note.raw_note}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── STRATALYST PANEL ── */}
      <div className="mt-4 p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs font-black uppercase tracking-widest" style={{ color: 'var(--stratagent-gold)' }}>
              STRATALYST
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
              Website is crawled automatically when you set the URL above. Re-scan anytime, or use Find Sources to hunt for articles and trade directories.
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={runDeepScan}
            disabled={deepScanLoading || stratalystLoading || !kb?.website_url}
            title={!kb?.website_url ? 'No website URL set on this KB' : 'Crawl all pages on the supplier website and extract intelligence automatically'}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: deepScanLoading ? '#1e1e1e' : 'var(--stratagent-gold)', color: deepScanLoading ? 'var(--stratagent-text)' : '#000' }}>
            {deepScanLoading ? (
              <><svg className="animate-spin h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>Scanning all pages...</>
            ) : '◎ Re-scan Website'}
          </button>
          <button
            onClick={runStratalyst}
            disabled={stratalystLoading || deepScanLoading}
            className="px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}>
            {stratalystLoading ? 'Researching...' : 'Find Sources'}
          </button>
        </div>

        {/* Deep Scan Result */}
        {deepScanResult && (
          <div className="p-4 rounded-lg space-y-2 mb-3"
               style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-green)' }}>
            {deepScanResult.scanning ? (
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--stratagent-green)' }}>
                <span className="animate-spin">◌</span>
                Scanning website in background — depth will update shortly...
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: 'var(--stratagent-green)' }}>
                    Scan Complete
                  </span>
                  <span className="text-xs" style={{ color: 'var(--stratagent-green)' }}>
                    +{deepScanResult.depth_gain} depth
                  </span>
                </div>
                <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                  {deepScanResult.pages_crawled} pages crawled · {deepScanResult.fields_improved} fields improved · {deepScanResult.depth_before} {'→'} {deepScanResult.depth_after}
                </div>
              </>
            )}
          </div>
        )}

        {/* Research Gaps Result — approval flow */}
        {stratalystFindings?.sources?.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
              {stratalystFindings.sources.length} sources found — deselect any you want to skip, then approve.
            </div>
            {stratalystFindings.sources.map((source: any, i: number) => (
              <div key={i}
                   onClick={() => toggleSource(i)}
                   className="p-3 rounded-lg cursor-pointer"
                   style={{
                     background: approvedSources.has(i) ? '#1a1500' : 'var(--stratagent-dark)',
                     border: `1px solid ${approvedSources.has(i) ? 'var(--stratagent-gold)' : 'var(--stratagent-border)'}`,
                   }}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold mb-0.5" style={{ color: approvedSources.has(i) ? 'var(--stratagent-gold)' : 'var(--stratagent-text)' }}>
                      {source.title || source.url}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{source.url}</div>
                    {source.estimated_gain && (
                      <div className="text-xs mt-1" style={{ color: '#10b981' }}>+{source.estimated_gain} depth points</div>
                    )}
                  </div>
                  <span className="text-xs shrink-0" style={{ color: approvedSources.has(i) ? 'var(--stratagent-gold)' : 'var(--stratagent-muted)' }}>
                    {approvedSources.has(i) ? '✓' : '○'}
                  </span>
                </div>
              </div>
            ))}
            <button
              onClick={approveStratalystSources}
              disabled={stratalystIngesting || approvedSources.size === 0}
              className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              {stratalystIngesting ? 'Ingesting...' : 'Approve & Ingest Selected'}
            </button>
          </div>
        )}

        {stratalystResult && !stratalystFindings && (
          <div className="p-3 rounded-lg text-xs"
               style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-green)', color: 'var(--stratagent-green)' }}>
            Ingested {stratalystResult.ingested_count} sources · Depth now {Math.round(stratalystResult.intelligence_depth?.total || 0)}
          </div>
        )}
      </div>

    </div>
  )
}
