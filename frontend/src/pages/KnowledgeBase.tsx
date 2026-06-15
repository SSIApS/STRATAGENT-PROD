import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { api, setSession } from '../services/api'
import type { Session } from '../App'
import { searchNace, getNaceByCode } from '../data/naceData'
import IntelligenceDepthGauge from '../components/KnowledgeBase/IntelligenceDepthGauge'
import GapList from '../components/KnowledgeBase/GapList'

type Step = 'list' | 'create' | 'view'

function thresholdColor(label: string) {
  if (label === 'SINGULARITY READY' || label === 'PROPOSAL READY') return '#10b981'
  if (label === 'VALUE BRIEF READY') return '#f59e0b'
  return '#ef4444'
}

export default function KnowledgeBase({ session }: { session: Session }) {
  const location = useLocation()
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
  const [selectedImageIds, setSelectedImageIds] = useState<Set<string>>(new Set())
  const [imgSuccess, setImgSuccess] = useState<string | null>(null)

  // Visual Intelligence
  const [visualAnalysisLoading, setVisualAnalysisLoading] = useState(false)
  const [visualAnalysisResult, setVisualAnalysisResult] = useState<any>(null)
  const [productScanLoading, setProductScanLoading] = useState(false)
  const [productScanResult, setProductScanResult] = useState<any>(null)
  const [channelBriefLoading, setChannelBriefLoading] = useState(false)
  const [channelBriefResult, setChannelBriefResult] = useState<any>(null)
  const [exportDocxLoading, setExportDocxLoading] = useState<string | null>(null) // which export is loading

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

  // Quick Fill — direct profile field entry
  const [quickFillOpen, setQuickFillOpen] = useState(false)
  const [quickFillFields, setQuickFillFields] = useState<Record<string, string>>({})
  const [quickFillLoading, setQuickFillLoading] = useState(false)
  const [quickFillSaved, setQuickFillSaved] = useState(false)

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
  const [supplierLocation, setSupplierLocation] = useState('')
  const [seedSaving, setSeedSaving] = useState(false)
  const [draftSeed, setDraftSeed] = useState<any>(null)
  const [buildingSeed, setBuildingSeed] = useState(false)
  const [seedBuildResult, setSeedBuildResult] = useState<any>(null)
  const [expandedSeedBlock, setExpandedSeedBlock] = useState<string | null>('identity')
  const [verifyingField, setVerifyingField] = useState<{block: string, field: string} | null>(null)
  const [verifyValue, setVerifyValue] = useState('')
  // Industry Targeting
  const [industryTargetingOpen, setIndustryTargetingOpen] = useState(false)
  const [naceInput, setNaceInput] = useState('')
  const [targetNaceCodes, setTargetNaceCodes] = useState<string[]>([])
  const [industryTargetingNotes, setIndustryTargetingNotes] = useState('')
  const [savingIndustryTargeting, setSavingIndustryTargeting] = useState(false)
  const [industryTargetingSaved, setIndustryTargetingSaved] = useState(false)
  const [naceDropdown, setNaceDropdown] = useState(false)
  const [naceSuggestions, setNaceSuggestions] = useState<{code:string;label:string;rationale:string}[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Deal Triggers
  const [dealTriggers, setDealTriggers] = useState<any[]>([])
  const [triggersLoading, setTriggersLoading] = useState(false)
  const [triggersGenerated, setTriggersGenerated] = useState(false)
  const [editingTrigger, setEditingTrigger] = useState<string | null>(null)

  // Supplier Reports
  const [reportTab, setReportTab] = useState<'audit' | 'synthesis' | 'qa'>('audit')
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditResult, setAuditResult] = useState<any>(null)
  const [synthesisLoading, setSynthesisLoading] = useState(false)
  const [synthesisResult, setSynthesisResult] = useState<any>(null)
  const [qaQuestion, setQaQuestion] = useState('')
  const [qaLoading, setQaLoading] = useState(false)
  const [qaResult, setQaResult] = useState<any>(null)

  const [supplierOrder, setSupplierOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('stratagent_kb_order') || '[]') } catch { return [] }
  })
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const urlPanelRef = useRef<HTMLDivElement>(null)

  setSession(session.sessionId)

  useEffect(() => { loadSuppliers() }, [])

  // Auto-select supplier when navigated from STRATEGIST action card
  useEffect(() => {
    const state = location.state as any
    if (!state?.supplier_id && !state?.supplier_name) return
    // Wait until suppliers are loaded, then find and open the matching one
    if (suppliers.length === 0) return
    const match = suppliers.find((s: any) =>
      (state.supplier_id && (s.supplier_id || s.id) === state.supplier_id) ||
      (state.supplier_name && s.company_name?.toLowerCase() === state.supplier_name?.toLowerCase())
    )
    if (match) openSupplier(match)
  }, [suppliers, location.state])

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
      // Sync industry targeting state
      const targeting = res.data?.intelligence_seed?.industry_targeting || {}
      setTargetNaceCodes(targeting.target_nace || [])
      setIndustryTargetingNotes(targeting.notes || '')
      setIndustryTargetingOpen(false)
      setIndustryTargetingSaved(false)
      // Pre-populate from cached KB analysis -- avoids re-running on every open
      const kbData = res.data
      if (kbData.visual_analysis && kbData.visual_analysis_at) {
        setVisualAnalysisResult({
          analysis: kbData.visual_analysis,
          images_used: kbData.visual_analysis_images_used || 1,
          cached: true,
          analyzed_at: kbData.visual_analysis_at,
        })
      } else {
        setVisualAnalysisResult(null)
      }
      if (kbData.last_scan && kbData.last_scan_at) {
        setProductScanResult({ ...kbData.last_scan, cached: true, scanned_at: kbData.last_scan_at })
      } else {
        setProductScanResult(null)
      }
      setChannelBriefResult(null)
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
        supplier_location: supplierLocation.trim() || null,
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
      if (res.data.intelligence_depth) {
        setKb((prev: any) => ({ ...prev, intelligence_depth: res.data.intelligence_depth }))
      }
      if (res.data.newly_unlocked) setNewlyUnlocked(res.data.newly_unlocked)
      setUrlInput('')
      setUrlContext('')
      setUrlFocusElement('')
      loadSuppliers()
    } catch (e: any) { alert(e.response?.data?.detail || 'Failed to add URL') }
    finally { setUrlLoading(false) }
  }

  async function saveQuickFill() {
    if (!kb) return
    const nonEmpty = Object.fromEntries(Object.entries(quickFillFields).filter(([, v]) => v.trim()))
    if (!Object.keys(nonEmpty).length) return
    setQuickFillLoading(true)
    try {
      const res = await api.patch('/knowledge-base/' + kb.supplier_id + '/profile-fields', nonEmpty)
      if (res.data.intelligence_depth) {
        setKb((prev: any) => ({ ...prev, intelligence_depth: res.data.intelligence_depth }))
      }
      setQuickFillSaved(true)
      setTimeout(() => setQuickFillSaved(false), 3000)
      loadSuppliers()
    } catch (e: any) { alert(e.response?.data?.detail || 'Save failed') }
    finally { setQuickFillLoading(false) }
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
      const loadedImgs1 = imgRes.data || []
      setProductImages(loadedImgs1)
      setSelectedImageIds(new Set(loadedImgs1.map((img: any) => img.image_id || img.id).filter(Boolean)))
    } catch (e: any) { alert(e.response?.data?.detail || 'Image upload failed') }
    finally { setImgLoading(false) }
  }

  async function loadProductImages(supplierId: string) {
    try {
      const res = await api.get('/knowledge-base/' + supplierId + '/images')
      const loadedImgs2 = res.data || []
      setProductImages(loadedImgs2)
      setSelectedImageIds(new Set(loadedImgs2.map((img: any) => img.image_id || img.id).filter(Boolean)))
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

  async function runVisualAnalysis(forceRerun = false) {
    setVisualAnalysisLoading(true)
    if (forceRerun) setVisualAnalysisResult(null)
    try {
      const res = await api.post('/knowledge-base/' + kb.supplier_id + '/visual-analysis', {
        competitor_context: '',
        force_rerun: forceRerun,
        selected_image_ids: selectedImageIds.size > 0 ? Array.from(selectedImageIds) : null,
      })
      setVisualAnalysisResult(res.data)
    } catch (e: any) {
      const detail = e.response?.data?.detail
      alert(typeof detail === 'string' ? detail : detail?.message || JSON.stringify(detail) || 'Visual analysis failed')
    } finally {
      setVisualAnalysisLoading(false)
    }
  }

  async function runProductScan(forceRerun = false) {
    setProductScanLoading(true)
    if (forceRerun) setProductScanResult(null)
    try {
      const res = await api.post('/stratagora/product-scan/' + kb.supplier_id, { force_rerun: forceRerun })
      setProductScanResult(res.data)
    } catch (e: any) {
      const d = e.response?.data?.detail
      alert(typeof d === 'string' ? d : d?.message || d?.error || JSON.stringify(d) || 'Product scan failed')
    } finally {
      setProductScanLoading(false)
    }
  }

  async function exportDocx(endpoint: string, body: object, filename: string) {
    setExportDocxLoading(endpoint)
    try {
      const res = await api.post(endpoint, body, { responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      const cd = res.headers['content-disposition'] || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      link.download = match ? match[1] : filename
      link.click()
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      if (e.response?.data instanceof Blob) {
        const text = await e.response.data.text()
        try { alert('Export failed: ' + (JSON.parse(text).detail || text)) }
        catch { alert('Export failed: ' + text) }
      } else {
        alert('Export failed: ' + (e.response?.data?.detail || e.message || 'unknown error'))
      }
    } finally {
      setExportDocxLoading(null)
    }
  }

  async function runChannelBrief() {
    setChannelBriefLoading(true)
    setChannelBriefResult(null)
    try {
      const res = await api.post('/knowledge-base/' + kb.supplier_id + '/channel-brief', {
        visual_analysis: visualAnalysisResult?.analysis || null,
        scan_result: productScanResult || null,
      })
      setChannelBriefResult(res.data)
    } catch (e: any) {
      const d = e.response?.data?.detail
      alert(typeof d === 'string' ? d : d?.message || 'Brief generation failed')
    } finally {
      setChannelBriefLoading(false)
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

  async function saveIndustryTargeting() {
    setSavingIndustryTargeting(true)
    try {
      await api.post('/stratalyst/' + kb.supplier_id + '/update-industry-targeting', {
        target_nace: targetNaceCodes,
        target_sic: [],
        notes: industryTargetingNotes.trim(),
      })
      setKb((prev: any) => ({
        ...prev,
        intelligence_seed: {
          ...(prev.intelligence_seed || {}),
          industry_targeting: {
            target_nace: targetNaceCodes,
            target_sic: [],
            notes: industryTargetingNotes.trim(),
            jason_verified: true,
          }
        }
      }))
      setIndustryTargetingSaved(true)
      setTimeout(() => setIndustryTargetingSaved(false), 3000)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Save failed')
    } finally { setSavingIndustryTargeting(false) }
  }

  async function buildSeed() {
    setBuildingSeed(true)
    setSeedBuildResult(null)
    try {
      const res = await api.post('/stratalyst/' + kb.supplier_id + '/build-seed', {}, {
        headers: { 'x-session-id': session.sessionId }
      })
      setSeedBuildResult(res.data)
      setKb((prev: any) => ({ ...prev, intelligence_seed: res.data.intelligence_seed }))
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Seed build failed — try again')
    } finally { setBuildingSeed(false) }
  }

  async function verifySeedField(block: string, field: string, value: string) {
    try {
      await api.patch('/stratalyst/' + kb.supplier_id + '/verify-field', { block, field, value })
      setKb((prev: any) => {
        const iseed = { ...(prev.intelligence_seed || {}) }
        if (!iseed[block]) iseed[block] = {}
        iseed[block][field] = { value, source: 'jason_verified', confidence: 'high', jason_verified: true }
        return { ...prev, intelligence_seed: iseed }
      })
      setVerifyingField(null)
      setVerifyValue('')
    } catch (e: any) { alert(e.response?.data?.detail || 'Verify failed') }
  }

  // LIST
  if (step === 'list') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-black" style={{ color: '#d4a843' }}>
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
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-muted)' }}>
              Supplier Location
            </label>
            <p className="text-xs mb-2" style={{ color: 'var(--stratagent-muted)' }}>
              City, State/Region, Country — anchors all geo-aware channel research and market scanning.
            </p>
            <input value={supplierLocation} onChange={e => setSupplierLocation(e.target.value)}
              placeholder="e.g. Omaha, Nebraska, USA"
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



  // Print / export helpers
  function printReport(mode: 'audit' | 'synthesis' | 'discovery') {
    const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    const company = kb?.company_name || 'Supplier'
    const orange = '#E87A00'
    const base = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11pt; color: #111; background: #fff; padding: 28px 36px; }
        .header { border-bottom: 2.5px solid ${orange}; padding-bottom: 10px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
        .header-left h1 { font-size: 17pt; font-weight: 800; color: ${orange}; letter-spacing: -0.5px; }
        .header-left h2 { font-size: 12pt; font-weight: 600; color: #111; margin-top: 2px; }
        .header-right { font-size: 8.5pt; color: #666; text-align: right; line-height: 1.6; }
        .section-title { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: ${orange}; margin: 18px 0 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
        .card { border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px 12px; margin-bottom: 8px; page-break-inside: avoid; }
        .card-title { font-size: 10pt; font-weight: 700; color: #111; margin-bottom: 3px; }
        .card-sub { font-size: 9pt; color: #555; margin-bottom: 3px; }
        .card-action { font-size: 9pt; color: #1a7a3a; font-weight: 500; }
        .badge { display: inline-block; font-size: 8pt; font-weight: 700; padding: 2px 7px; border-radius: 4px; }
        .badge-strong { background: #e6f4ed; color: #166534; }
        .badge-adequate { background: #fff7e0; color: #92400e; }
        .badge-weak { background: #fff2e0; color: #9a3a00; }
        .badge-missing { background: #fde8e8; color: #991b1b; }
        .row { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .note-block { border: 1px solid #ccc; border-radius: 4px; min-height: 44px; margin-top: 6px; padding: 4px 6px; }
        .note-label { font-size: 7.5pt; color: #aaa; font-style: italic; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th { font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; color: #666; border-bottom: 2px solid #e0e0e0; padding: 5px 8px; text-align: left; }
        td { font-size: 9pt; border-bottom: 1px solid #f0f0f0; padding: 7px 8px; vertical-align: top; }
        .question-block { margin-bottom: 14px; page-break-inside: avoid; }
        .question { font-size: 10pt; font-weight: 600; color: #111; margin-bottom: 2px; }
        .question-context { font-size: 8.5pt; color: #666; margin-bottom: 5px; }
        .lines { margin-top: 4px; }
        .line { border-bottom: 1px solid #ccc; height: 20px; margin-bottom: 4px; }
        .footer { margin-top: 28px; border-top: 1px solid #e0e0e0; padding-top: 8px; font-size: 8pt; color: #999; display: flex; justify-content: space-between; }
        @media print { body { padding: 18px 24px; } .no-print { display: none; } }
      </style>
      <div class="footer">
        <span>STRATAGENT Intelligence -- Strategic Sales International ApS -- jls@strategic.dk</span>
        <span>Confidential</span>
      </div>
    `

    let html = ''

    if (mode === 'audit' && auditResult && !auditResult.error) {
      const gradeClass = (g: string) => g === 'STRONG' ? 'badge-strong' : g === 'ADEQUATE' ? 'badge-adequate' : g === 'WEAK' ? 'badge-weak' : 'badge-missing'
      html = `<!DOCTYPE html><html><head><title>Intelligence Audit -- ${company}</title>${base}</head><body>
        <div class="header">
          <div class="header-left">
            <h1>STRATAGENT</h1>
            <h2>Intelligence Audit Report -- ${company}</h2>
          </div>
          <div class="header-right">
            Prepared by Jason L. Smith<br>Strategic Sales International ApS<br>${today}
          </div>
        </div>
        <div class="row" style="margin-bottom:14px;align-items:center;">
          <div>
            <div style="font-size:13pt;font-weight:700;color:#111;">Overall Intelligence Depth: ${auditResult.overall_depth}/100</div>
            <div style="font-size:9pt;color:#666;margin-top:2px;">${auditResult.overall_grade}</div>
          </div>
          <div style="font-size:9pt;color:#555;max-width:55%;text-align:right;">Ready for: ${auditResult.ready_for || '—'}</div>
        </div>

        <div class="section-title">Top Priorities</div>
        ${(auditResult.top_3_priorities || []).map((p: any) => `
          <div class="card">
            <div class="row">
              <div style="flex:1">
                <div class="card-title">#${p.rank} &nbsp; ${p.field}</div>
                <div class="card-sub">${p.why_it_matters}</div>
                <div class="card-action">Action: ${p.action}</div>
              </div>
            </div>
            <div class="note-block"><span class="note-label">Notes from client meeting:</span></div>
          </div>
        `).join('')}

        <div class="section-title">All Intelligence Elements</div>
        <table>
          <thead><tr><th>Field</th><th>Grade</th><th>Score</th><th>Gap / Missing</th><th>Recommended Source</th></tr></thead>
          <tbody>
            ${(auditResult.elements || []).map((el: any) => `
              <tr>
                <td><strong>${el.field}</strong></td>
                <td><span class="badge ${gradeClass(el.grade)}">${el.grade}</span></td>
                <td>${el.score}/100</td>
                <td style="color:#555;">${el.what_is_missing || '—'}</td>
                <td style="color:#2563eb;">${el.recommended_source || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${auditResult.strengths?.length ? `
          <div class="section-title">Strengths</div>
          ${auditResult.strengths.map((s: string) => `<div class="card-sub" style="margin-bottom:4px;">+ ${s}</div>`).join('')}
        ` : ''}
        <div class="footer"><span>STRATAGENT Intelligence -- Strategic Sales International ApS -- jls@strategic.dk</span><span>Confidential</span></div>
      </body></html>`
    }

    else if (mode === 'synthesis' && synthesisResult && !synthesisResult.error) {
      html = `<!DOCTYPE html><html><head><title>Capability Report -- ${company}</title>${base}</head><body>
        <div class="header">
          <div class="header-left">
            <h1>STRATAGENT</h1>
            <h2>${synthesisResult.report_title || 'Capability Intelligence Report'} -- ${company}</h2>
          </div>
          <div class="header-right">
            Prepared by ${synthesisResult.prepared_by}<br>${synthesisResult.prepared_for_org}<br>${today}
          </div>
        </div>
        ${synthesisResult.executive_summary ? `
          <div class="section-title">Executive Summary</div>
          <div class="card"><p>${synthesisResult.executive_summary}</p></div>
        ` : ''}
        ${synthesisResult.product_range?.products?.length ? `
          <div class="section-title">Product Range -- ${synthesisResult.product_range.headline || ''}</div>
          ${synthesisResult.product_range.products.map((p: any) => `
            <div class="card">
              <div class="card-title">${p.name}</div>
              <div class="card-sub">${p.description}</div>
              ${p.operating_envelope ? `<div class="card-sub" style="color:#2563eb;">Specs: ${p.operating_envelope}</div>` : ''}
              ${p.applications ? `<div class="card-sub">Applications: ${p.applications}</div>` : ''}
            </div>
          `).join('')}
        ` : ''}
        ${synthesisResult.technical_differentiators?.length ? `
          <div class="section-title">Technical Differentiators</div>
          ${synthesisResult.technical_differentiators.map((d: string) => `<div class="card-sub" style="padding:3px 0 3px 12px;border-left:3px solid ${orange};margin-bottom:4px;">${d}</div>`).join('')}
        ` : ''}
        ${synthesisResult.target_buyer_profiles?.length ? `
          <div class="section-title">Target Buyer Profiles</div>
          ${synthesisResult.target_buyer_profiles.map((b: any) => `
            <div class="card">
              <div class="card-title">${b.buyer_type}</div>
              <div class="card-sub">${b.why_they_buy}</div>
              ${b.typical_application ? `<div class="card-action">${b.typical_application}</div>` : ''}
            </div>
          `).join('')}
        ` : ''}
        ${synthesisResult.competitive_positioning ? `
          <div class="section-title">Competitive Positioning</div>
          <div class="card"><p>${synthesisResult.competitive_positioning}</p></div>
        ` : ''}
        ${synthesisResult.common_objections?.length ? `
          <div class="section-title">Objection Handling</div>
          ${synthesisResult.common_objections.map((o: any) => `
            <div class="card">
              <div class="card-sub" style="color:#c2410c;font-weight:600;">"${o.objection}"</div>
              <div class="card-sub" style="margin-top:3px;">${o.response}</div>
            </div>
          `).join('')}
        ` : ''}
        <div class="footer"><span>STRATAGENT Intelligence -- Strategic Sales International ApS -- ${synthesisResult.contact_email}</span><span>Confidential</span></div>
      </body></html>`
    }

    else if (mode === 'discovery' && auditResult && !auditResult.error) {
      const gaps = (auditResult.elements || []).filter((el: any) => el.grade === 'WEAK' || el.grade === 'MISSING')
      html = `<!DOCTYPE html><html><head><title>Client Discovery Sheet -- ${company}</title>${base}</head><body>
        <div class="header">
          <div class="header-left">
            <h1>STRATAGENT</h1>
            <h2>Client Discovery Sheet -- ${company}</h2>
          </div>
          <div class="header-right">
            For SSI Consultant Use<br>Jason L. Smith -- jls@strategic.dk<br>${today}
          </div>
        </div>
        <p style="font-size:9pt;color:#555;margin-bottom:16px;font-style:italic;">
          Questions derived from intelligence gaps in the ${company} knowledge base.
          Use during client meeting to capture missing information. Add answers to STRATAGENT after the session.
        </p>

        <div class="section-title">Priority Questions (address these first)</div>
        ${(auditResult.top_3_priorities || []).map((p: any) => `
          <div class="question-block">
            <div class="question">${p.rank}. ${_gapToQuestion(p.field, p.why_it_matters)}</div>
            <div class="question-context">Why it matters: ${p.why_it_matters}</div>
            <div class="lines">${'<div class="line"></div>'.repeat(3)}</div>
          </div>
        `).join('')}

        <div class="section-title">Additional Intelligence Gaps</div>
        ${gaps.map((el: any) => `
          <div class="question-block">
            <div class="question">${_gapToQuestion(el.field, el.what_is_missing)}</div>
            ${el.what_is_missing ? `<div class="question-context">Gap: ${el.what_is_missing}</div>` : ''}
            <div class="lines">${'<div class="line"></div>'.repeat(2)}</div>
          </div>
        `).join('')}

        <div class="section-title" style="margin-top:24px;">General Notes from Meeting</div>
        <div class="note-block" style="min-height:120px;"><span class="note-label">Key takeaways, follow-up actions, next steps:</span></div>

        <div class="footer">
          <span>STRATAGENT Intelligence -- Strategic Sales International ApS -- jls@strategic.dk</span>
          <span>Next step: update ${company} KB in STRATAGENT with captured intel</span>
        </div>
      </body></html>`
    }

    if (!html) return
    const w = window.open('', '_blank')
    if (w) {
      w.document.write(html)
      w.document.close()
      setTimeout(() => w.print(), 400)
    }
  }

  function _gapToQuestion(field: string, context: string): string {
    const fieldMap: Record<string, string> = {
      product_catalogue: 'Can you walk me through your full product range and key specifications?',
      technical_differentiators: 'What makes your product technically different from alternatives in the market?',
      certifications: 'What certifications, standards, or approvals does your product carry?',
      case_studies: 'Can you share examples of where your product has been deployed and what results it delivered?',
      buyer_profiles: 'Who are your typical customers -- what role, industry, and operational challenge do they have?',
      competitive_positioning: 'How do you position against competitors -- where do you win, and where do you typically lose?',
      operational_context: 'What operational environment or conditions does your product need to perform in?',
      recent_news: 'What has changed in your business or product range in the last 12 months?',
    }
    return fieldMap[field] || `Can you tell me more about your ${field.replace(/_/g, ' ')}?`
  }

  // Deal Triggers handlers
  async function loadDealTriggers() {
    if (!kb?.supplier_id) return
    try {
      const res = await api.get(`/stratalyst/${kb.supplier_id}/deal-triggers`)
      if (res.data.deal_triggers?.length) {
        setDealTriggers(res.data.deal_triggers)
        setTriggersGenerated(true)
      }
    } catch { /* silent */ }
  }

  async function generateDealTriggers() {
    if (!kb?.supplier_id) return
    setTriggersLoading(true)
    try {
      const res = await api.post(`/stratalyst/${kb.supplier_id}/generate-deal-triggers`)
      setDealTriggers(res.data.deal_triggers || [])
      setTriggersGenerated(true)
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Failed to generate triggers. Build the Intelligence Seed first.')
    } finally { setTriggersLoading(false) }
  }

  async function saveDealTriggers(updated: any[]) {
    if (!kb?.supplier_id) return
    try {
      await api.patch(`/stratalyst/${kb.supplier_id}/deal-triggers`, { triggers: updated })
      setDealTriggers(updated)
    } catch { alert('Save failed.') }
  }

  function deleteTrigger(id: string) {
    const updated = dealTriggers.filter(t => t.id !== id)
    saveDealTriggers(updated)
  }

  function verifyTrigger(id: string) {
    const updated = dealTriggers.map(t => t.id === id ? { ...t, jason_verified: true, source: 'jason_verified' } : t)
    saveDealTriggers(updated)
  }

  // Supplier Reports handlers
  async function runAudit() {
    if (!kb?.supplier_id) return
    setAuditLoading(true)
    setAuditResult(null)
    try {
      const res = await api.get(`/supplier-reports/${kb.supplier_id}/audit`)
      setAuditResult(res.data)
    } catch {
      setAuditResult({ error: 'Audit failed. Please try again.' })
    } finally {
      setAuditLoading(false)
    }
  }

  async function runSynthesis() {
    if (!kb?.supplier_id) return
    setSynthesisLoading(true)
    setSynthesisResult(null)
    try {
      const res = await api.get(`/supplier-reports/${kb.supplier_id}/synthesis`)
      setSynthesisResult(res.data)
    } catch {
      setSynthesisResult({ error: 'Synthesis failed. Please try again.' })
    } finally {
      setSynthesisLoading(false)
    }
  }

  async function askQuestion() {
    if (!kb?.supplier_id || !qaQuestion.trim()) return
    setQaLoading(true)
    setQaResult(null)
    try {
      const res = await api.post(`/supplier-reports/${kb.supplier_id}/qa`, { question: qaQuestion.trim() })
      setQaResult(res.data)
    } catch {
      setQaResult({ error: 'Query failed. Please try again.' })
    } finally {
      setQaLoading(false)
    }
  }

  // VIEW
  return (
    <div className="max-w-4xl mx-auto">
      {/* ── Module identity ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5">
        <div style={{ width: 3, height: 18, borderRadius: 2, background: '#d4a843', flexShrink: 0 }} />
        <span className="text-xs font-bold uppercase tracking-widest" style={{ color: '#d4a843' }}>
          KNOWLEDGE BASE
        </span>
      </div>
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
                  <a href={kb.website_url?.startsWith('http') ? kb.website_url : `https://${kb.website_url}`} target="_blank" rel="noopener noreferrer"
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
            {/* Supplier location -- shown when set, with inline edit */}
            <div className="flex items-center gap-1.5 mt-1">
              {kb?.supplier_location ? (
                <span className="text-xs flex items-center gap-1" style={{ color: 'var(--stratagent-muted)' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  {kb.supplier_location}
                </span>
              ) : (
                <span className="text-xs italic" style={{ color: 'var(--stratagent-muted)', opacity: 0.5 }}>
                  No location set — add for geo-aware research
                </span>
              )}
              <button
                onClick={async () => {
                  const loc = prompt('Supplier location (City, State, Country):', kb?.supplier_location || '')
                  if (loc === null) return
                  try {
                    await api.patch('/knowledge-base/' + kb.supplier_id + '/profile-fields', { supplier_location: loc.trim() })
                    const fresh = await api.get('/knowledge-base/' + kb.supplier_id)
                    setKb(fresh.data)
                  } catch { alert('Could not update location') }
                }}
                className="text-xs opacity-40 hover:opacity-100 px-1 py-0.5 rounded"
                style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}
                title="Edit location">
                ✎
              </button>
            </div>
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

      {/* ── INTELLIGENCE SEED PANEL ── */}
      {(() => {
        const iseed = kb?.intelligence_seed || {}
        const hasSeed = !!(iseed?.identity?.product_plain?.value || kb?.manual_seed?.product_plain)
        const completeness = iseed?._meta?.completeness_pct ?? null
        const lastBuilt = iseed?._meta?.last_built ?? null
        const recFields: any[] = iseed?.recommended_fields ?? []

        const confBadge = (c: string, verified: boolean) => {
          if (verified) return <span title="Jason verified" style={{ color: 'var(--stratagent-gold)', fontSize: '10px', marginLeft: '4px' }}>✓</span>
          if (c === 'high') return <span title="High confidence" style={{ color: '#22c55e', fontSize: '10px', marginLeft: '4px' }}>●</span>
          if (c === 'medium') return <span title="Medium confidence" style={{ color: '#f59e0b', fontSize: '10px', marginLeft: '4px' }}>●</span>
          return <span title="Low confidence" style={{ color: '#ef4444', fontSize: '10px', marginLeft: '4px' }}>●</span>
        }

        const SeedField = ({ block, fieldKey, label }: { block: string, fieldKey: string, label: string }) => {
          const f = iseed?.[block]?.[fieldKey]
          const val = f?.value || ''
          const conf = f?.confidence || 'low'
          const verified = f?.jason_verified || false
          const isEditing = verifyingField?.block === block && verifyingField?.field === fieldKey
          if (!val && !isEditing) return null
          return (
            <div className="py-1.5" style={{ borderBottom: '1px solid var(--stratagent-border)' }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold" style={{ color: 'var(--stratagent-muted)' }}>{label}</span>
                  {confBadge(conf, verified)}
                  {isEditing ? (
                    <div className="mt-1.5 flex gap-2 items-start">
                      <textarea
                        value={verifyValue}
                        onChange={e => setVerifyValue(e.target.value)}
                        rows={2}
                        className="flex-1 px-2 py-1 rounded text-xs outline-none resize-none"
                        style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-gold)', color: 'var(--stratagent-text)' }}
                      />
                      <div className="flex flex-col gap-1">
                        <button onClick={() => verifySeedField(block, fieldKey, verifyValue)}
                                className="text-xs px-2 py-1 rounded font-semibold"
                                style={{ background: 'var(--stratagent-gold)', color: '#000' }}>✓</button>
                        <button onClick={() => { setVerifyingField(null); setVerifyValue('') }}
                                className="text-xs px-2 py-1 rounded"
                                style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>✕</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-text)', wordBreak: 'break-word' }}>{val}</p>
                  )}
                </div>
                {!isEditing && val && (
                  <button
                    onClick={() => { setVerifyingField({ block, field: fieldKey }); setVerifyValue(val) }}
                    title="Verify / Override"
                    className="text-xs opacity-30 hover:opacity-100 px-1 py-0.5 rounded flex-shrink-0 mt-3"
                    style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>✎</button>
                )}
              </div>
            </div>
          )
        }

        const BLOCKS = [
          { key: 'identity', label: 'Identity', fields: [
            { key: 'product_plain', label: 'What they sell' },
            { key: 'not_this', label: 'NOT this (disambiguation)' },
            { key: 'problem_solved', label: 'Problem solved' },
            { key: 'key_specs', label: 'Key specifications' },
            { key: 'certifications', label: 'Certifications' },
          ]},
          { key: 'buyer_intelligence', label: 'Buyer Intelligence', fields: [
            { key: 'buyer_type', label: 'Buyer type' },
            { key: 'use_case', label: 'Use case' },
            { key: 'decision_maker', label: 'Decision maker role' },
            { key: 'influencer', label: 'Influencer / specifier' },
            { key: 'procurement_path', label: 'Procurement path' },
          ]},
          { key: 'commercial_reality', label: 'Commercial Reality', fields: [
            { key: 'deal_size', label: 'Typical deal size' },
            { key: 'geography', label: 'Geography (hard constraint)' },
            { key: 'relationship_model', label: 'Relationship model' },
            { key: 'minimum_threshold', label: 'Minimum threshold' },
          ]},
          { key: 'winning_conditions', label: 'Winning Conditions', fields: [
            { key: 'we_win_when', label: 'We win when' },
            { key: 'differentiator', label: 'Key differentiator' },
            { key: 'proof_points', label: 'Proof points' },
          ]},
          { key: 'signal_recognition', label: 'Signal Recognition', fields: [
            { key: 'trigger_events', label: 'Buying trigger events' },
            { key: 'tender_keywords', label: 'Tender / procurement keywords' },
            { key: 'capex_indicators', label: 'CAPEX indicators' },
            { key: 'regulatory_drivers', label: 'Regulatory drivers' },
          ]},
          { key: 'ssi_context', label: 'SSI Context (Jason only)', fields: [
            { key: 'why_ssi_represents', label: 'Why SSI represents this supplier' },
            { key: 'strategic_priority', label: 'Strategic priority' },
            { key: 'known_contacts', label: 'Known contacts' },
            { key: 'internal_notes', label: 'Internal notes' },
          ]},
        ]

        return (
          <div className="mb-4 rounded-xl overflow-hidden"
               style={{ border: hasSeed ? '1px solid var(--stratagent-border)' : '1px solid #92400e' }}>

            {/* Header row */}
            <div className="px-4 py-3 flex items-center justify-between"
                 style={{ background: 'var(--stratagent-panel)' }}>
              <div>
                <div className="text-xs uppercase tracking-widest font-semibold"
                     style={{ color: hasSeed ? 'var(--stratagent-gold)' : '#f59e0b' }}>
                  {hasSeed ? 'Intelligence Seed' : '⚠ Intelligence Seed — Not built'}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  {completeness !== null && (
                    <span className="text-xs" style={{ color: completeness >= 70 ? '#22c55e' : completeness >= 40 ? '#f59e0b' : '#ef4444' }}>
                      {completeness}% complete
                    </span>
                  )}
                  {lastBuilt && (
                    <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                      Built {new Date(lastBuilt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  {!hasSeed && (
                    <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                      Agents need this to hunt intelligently
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                <button
                  onClick={buildSeed}
                  disabled={buildingSeed || !kb?.company_name}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 flex items-center gap-1.5"
                  style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                  {buildingSeed ? (
                    <>
                      <span style={{
                        display: 'inline-block',
                        width: '10px', height: '10px',
                        border: '2px solid #00000033',
                        borderTopColor: '#000',
                        borderRadius: '50%',
                        animation: 'spin 0.7s linear infinite',
                        flexShrink: 0,
                      }} />
                      Building...
                    </>
                  ) : hasSeed ? '↻ Rebuild' : '⚡ Build Seed'}
                </button>
                <button onClick={openSeedEditor}
                        className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                  ✎ Manual
                </button>
              </div>
            </div>

            {/* Build result flash */}
            {seedBuildResult && (
              <div className="px-4 py-2 text-xs font-semibold"
                   style={{ background: '#064e3b', color: 'var(--stratagent-green)' }}>
                ✓ Seed built — {seedBuildResult.intelligence_seed?._meta?.completeness_pct ?? '?'}% complete
                {' · '}{Object.keys(seedBuildResult.intelligence_seed || {}).filter(k => k !== '_meta').length} blocks populated
              </div>
            )}

            {/* 6-block accordion — only shown when seed has data */}
            {hasSeed && (
              <div style={{ background: 'var(--stratagent-dark)' }}>
                {BLOCKS.map(({ key: bk, label: bLabel, fields }) => {
                  const blockData = iseed?.[bk] || {}
                  const filledCount = fields.filter(f => blockData[f.key]?.value).length
                  const isOpen = expandedSeedBlock === bk
                  const isJasonOnly = bk === 'ssi_context'
                  return (
                    <div key={bk} style={{ borderTop: '1px solid var(--stratagent-border)' }}>
                      <button
                        className="w-full px-4 py-2.5 flex items-center justify-between text-left"
                        style={{ background: 'transparent' }}
                        onClick={() => setExpandedSeedBlock(isOpen ? null : bk)}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold" style={{ color: isJasonOnly ? 'var(--stratagent-gold)' : 'var(--stratagent-text)' }}>
                            {bLabel}
                          </span>
                          {isJasonOnly && <span className="text-xs" style={{ color: 'var(--stratagent-gold)', opacity: 0.7 }}>🔒</span>}
                          <span className="text-xs" style={{ color: filledCount > 0 ? '#22c55e' : 'var(--stratagent-muted)' }}>
                            {filledCount}/{fields.length}
                          </span>
                        </div>
                        <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{isOpen ? '▲' : '▼'}</span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3">
                          {fields.map(f => (
                            <SeedField key={f.key} block={bk} fieldKey={f.key} label={f.label} />
                          ))}
                          {fields.every(f => !blockData[f.key]?.value) && (
                            <p className="text-xs py-2" style={{ color: 'var(--stratagent-muted)' }}>
                              No data yet — click ⚡ Build Seed to populate this block
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Recommended Fields queue */}
                {recFields.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--stratagent-border)' }}>
                    <div className="px-4 py-2.5">
                      <span className="text-xs font-semibold uppercase tracking-widest"
                            style={{ color: '#f59e0b' }}>
                        Agent Recommendations ({recFields.length})
                      </span>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                        Agents flagged these knowledge gaps during research
                      </p>
                    </div>
                    {recFields.map((rf: any, i: number) => (
                      <div key={i} className="px-4 pb-2">
                        <div className="px-3 py-2 rounded-lg" style={{ background: 'var(--stratagent-panel)', border: '1px solid #92400e' }}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>{rf.field_name}</span>
                              <span className="text-xs ml-2" style={{ color: 'var(--stratagent-muted)' }}>— {rf.suggested_by}</span>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-text)' }}>{rf.rationale}</p>
                              {rf.draft_value && (
                                <p className="text-xs mt-0.5 italic" style={{ color: 'var(--stratagent-muted)' }}>Draft: {rf.draft_value}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* ── INDUSTRY TARGETING ── */}
      {kb && (
        <div className="mb-4 rounded-xl overflow-hidden"
             style={{ border: '1px solid var(--stratagent-border)' }}>
          <button
            className="w-full px-4 py-3 flex items-center justify-between text-left"
            style={{ background: 'var(--stratagent-panel)' }}
            onClick={() => setIndustryTargetingOpen(o => !o)}>
            <div>
              <div className="text-xs uppercase tracking-widest font-semibold"
                   style={{ color: 'var(--stratagent-gold)' }}>
                Industry Targeting
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                {targetNaceCodes.length > 0
                  ? `${targetNaceCodes.length} NACE code${targetNaceCodes.length !== 1 ? 's' : ''} — ${targetNaceCodes.slice(0, 4).join(', ')}${targetNaceCodes.length > 4 ? '…' : ''}`
                  : 'No codes set — add NACE Rev.2 codes to enable industry match scoring'}
              </div>
            </div>
            <span className="text-xs ml-4 flex-shrink-0" style={{ color: 'var(--stratagent-muted)' }}>
              {industryTargetingOpen ? '▲' : '▼'}
            </span>
          </button>

          {industryTargetingOpen && (
            <div className="px-4 py-4 space-y-3" style={{ background: 'var(--stratagent-dark)' }}>
              <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                NACE Rev. 2 codes (EU). Each prospect is automatically classified — codes here
                drive the industry match badge in Field Intelligence and boost STRATAMESH signals.
                Stage 2 will feed these into the SD score directly.
              </p>

              {/* Code pills */}
              <div className="flex flex-wrap gap-2 min-h-[32px]">
                {targetNaceCodes.length === 0 && (
                  <span className="text-xs italic" style={{ color: 'var(--stratagent-muted)' }}>
                    No codes yet
                  </span>
                )}
                {targetNaceCodes.map((code) => (
                  <span key={code}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-semibold"
                        style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold)', color: 'var(--stratagent-gold)' }}>
                    {code}
                    <button
                      onClick={() => setTargetNaceCodes(prev => prev.filter(c => c !== code))}
                      className="opacity-60 hover:opacity-100 leading-none"
                      style={{ color: 'var(--stratagent-gold)' }}>
                      ×
                    </button>
                  </span>
                ))}
              </div>

              {/* Combobox search + manual entry */}
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={naceInput}
                    onChange={e => {
                      setNaceInput(e.target.value)
                      setNaceDropdown(e.target.value.trim().length > 0)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setNaceDropdown(false); return }
                      if ((e.key === 'Enter' || e.key === ',') && naceInput.trim()) {
                        e.preventDefault()
                        const code = naceInput.trim().replace(/,$/, '').toUpperCase()
                        if (code && !targetNaceCodes.includes(code)) {
                          setTargetNaceCodes(prev => [...prev, code])
                        }
                        setNaceInput('')
                        setNaceDropdown(false)
                      }
                    }}
                    onFocus={() => { if (naceInput.trim()) setNaceDropdown(true) }}
                    onBlur={() => setTimeout(() => setNaceDropdown(false), 150)}
                    placeholder="Search or type a code — e.g. C20, chemical, energy…"
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-mono outline-none"
                    style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
                  />
                  <button
                    onClick={() => {
                      const code = naceInput.trim().replace(/,$/, '').toUpperCase()
                      if (code && !targetNaceCodes.includes(code)) {
                        setTargetNaceCodes(prev => [...prev, code])
                      }
                      setNaceInput('')
                      setNaceDropdown(false)
                    }}
                    disabled={!naceInput.trim()}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                    style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                    Add
                  </button>
                </div>

                {/* Dropdown results */}
                {naceDropdown && (() => {
                  const hits = searchNace(naceInput)
                  if (!hits.length) return null
                  return (
                    <div className="absolute z-50 w-full mt-1 rounded-lg overflow-hidden shadow-xl"
                         style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold)' }}>
                      {hits.map(entry => (
                        <button
                          key={entry.code}
                          onMouseDown={e => {
                            e.preventDefault()
                            if (!targetNaceCodes.includes(entry.code)) {
                              setTargetNaceCodes(prev => [...prev, entry.code])
                            }
                            setNaceInput('')
                            setNaceDropdown(false)
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:opacity-80 flex items-center gap-3"
                          style={{ borderBottom: '1px solid var(--stratagent-border)' }}>
                          <span className="font-mono font-bold flex-shrink-0 w-10"
                                style={{ color: entry.level === 'section' ? 'var(--stratagent-gold)' : 'var(--stratagent-text)' }}>
                            {entry.code}
                          </span>
                          <span style={{ color: 'var(--stratagent-muted)' }}>{entry.label}</span>
                          {targetNaceCodes.includes(entry.code) && (
                            <span className="ml-auto text-xs" style={{ color: '#22c55e' }}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )
                })()}
              </div>

              {/* STRATALYST Suggest button */}
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    if (!kb) return
                    setLoadingSuggestions(true)
                    setNaceSuggestions([])
                    try {
                      const res = await api.post(`/stratalyst/${kb.supplier_id}/suggest-nace`)
                      setNaceSuggestions(res.data?.suggestions || [])
                    } catch (e: any) {
                      alert(e.response?.data?.detail || 'Suggestion failed — build intelligence seed first')
                    } finally {
                      setLoadingSuggestions(false)
                    }
                  }}
                  disabled={loadingSuggestions}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40 flex items-center gap-2"
                  style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-gold)', color: 'var(--stratagent-gold)' }}>
                  {loadingSuggestions ? (
                    <>
                      <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #f59e0b44', borderTopColor: 'var(--stratagent-gold)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                      STRATALYST analysing…
                    </>
                  ) : (
                    '⚡ STRATALYST — Suggest codes'
                  )}
                </button>

                {naceSuggestions.length > 0 && (
                  <div className="rounded-lg overflow-hidden"
                       style={{ border: '1px solid var(--stratagent-gold-dim)' }}>
                    <div className="px-3 py-2 flex items-center justify-between"
                         style={{ background: 'var(--stratagent-panel)' }}>
                      <span className="text-xs font-semibold" style={{ color: 'var(--stratagent-gold)' }}>
                        {naceSuggestions.length} suggested codes
                      </span>
                      <button
                        onClick={() => {
                          const toAdd = naceSuggestions.map(s => s.code).filter(c => !targetNaceCodes.includes(c))
                          setTargetNaceCodes(prev => [...prev, ...toAdd])
                          setNaceSuggestions([])
                        }}
                        className="text-xs px-2 py-0.5 rounded font-semibold"
                        style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                        Accept all
                      </button>
                    </div>
                    {naceSuggestions.map(s => (
                      <div key={s.code} className="px-3 py-2 flex items-start gap-3"
                           style={{ borderTop: '1px solid var(--stratagent-border)', background: 'var(--stratagent-dark)' }}>
                        <span className="font-mono font-bold text-xs flex-shrink-0 w-10 mt-0.5"
                              style={{ color: 'var(--stratagent-text)' }}>
                          {s.code}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold" style={{ color: 'var(--stratagent-text)' }}>{s.label}</div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>{s.rationale}</div>
                        </div>
                        <button
                          onClick={() => {
                            if (!targetNaceCodes.includes(s.code)) {
                              setTargetNaceCodes(prev => [...prev, s.code])
                            }
                            setNaceSuggestions(prev => prev.filter(x => x.code !== s.code))
                          }}
                          className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                          style={{ background: targetNaceCodes.includes(s.code) ? 'var(--stratagent-panel)' : 'var(--stratagent-gold)', color: targetNaceCodes.includes(s.code) ? 'var(--stratagent-muted)' : '#000', border: '1px solid var(--stratagent-border)' }}>
                          {targetNaceCodes.includes(s.code) ? '✓ added' : '+ Add'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--stratagent-muted)' }}>
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={industryTargetingNotes}
                  onChange={e => setIndustryTargetingNotes(e.target.value)}
                  placeholder="e.g. Focus on refineries and chemical plants"
                  className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
                />
              </div>

              {/* Save button */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={saveIndustryTargeting}
                  disabled={savingIndustryTargeting}
                  className="px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40"
                  style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                  {savingIndustryTargeting ? 'Saving…' : 'Save'}
                </button>
                {industryTargetingSaved && (
                  <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                    ✓ Saved
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MANUAL SEED EDIT FORM (slide-down) ── */}
      {editingSeed && (
        <div className="mb-4 p-5 rounded-xl space-y-4"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-gold)' }}>
          <div className="text-xs uppercase tracking-widest font-semibold mb-1"
               style={{ color: 'var(--stratagent-gold)' }}>
            Manual Override — Your words take priority
          </div>
          <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
            These four fields anchor every agent. Edit only what you know is wrong or missing. Agent-built fields above stay intact.
          </p>

          {[
            { label: 'What does this supplier sell?', hint: 'Literal, plain English. e.g. "Industrial pipe insulation materials for high-temperature applications."', val: seedProductPlain, set: setSeedProductPlain },
            { label: 'Who buys this?', hint: 'The actual buyer type. e.g. "Industrial insulation contractors, EPCs, plant maintenance engineers."', val: seedBuyerType, set: setSeedBuyerType },
            { label: 'What do buyers use it for?', hint: 'The use case. e.g. "Insulating steam pipes and process vessels to reduce heat loss and meet fire regulations."', val: seedUseCase, set: setSeedUseCase },
            { label: 'What is this NOT? (disambiguation)', hint: 'Stops agents from confusing this with similar products. e.g. "NOT building insulation. NOT residential loft insulation. NOT acoustic panels."', val: seedNotThis, set: setSeedNotThis },
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
              {seedSaving ? 'Saving...' : 'Save'}
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

      {/* ── Quick Fill — direct profile field entry ── */}
      <div className="mt-4 rounded-xl overflow-hidden"
           style={{ border: '1px solid var(--stratagent-border)' }}>
        <button
          onClick={() => {
            if (!quickFillOpen) {
              // Pre-populate from current profile
              const p = kb?.profile || {}
              setQuickFillFields({
                product_catalogue:       p.product_catalogue       || '',
                technical_datasheets:    p.technical_datasheets    || '',
                certifications:          p.certifications          || '',
                case_studies:            p.case_studies            || '',
                competitive_positioning: p.competitive_positioning || '',
                pricing_framework:       p.pricing_framework       || '',
                distribution_channels:   p.distribution_channels   || '',
                reference_projects:      p.reference_projects      || '',
                objections_responses:    p.objections_responses    || '',
              })
            }
            setQuickFillOpen(o => !o)
          }}
          className="w-full flex items-center justify-between px-6 py-4"
          style={{ background: 'var(--stratagent-panel)', color: 'var(--stratagent-text)' }}>
          <div className="flex items-center gap-3">
            <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>Quick Fill — Type What You Know</span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#1c1400', color: 'var(--stratagent-gold)', border: '1px solid #92400e' }}>
              Direct entry · boosts depth instantly
            </span>
          </div>
          <span style={{ color: 'var(--stratagent-muted)' }}>{quickFillOpen ? '▲' : '▼'}</span>
        </button>

        {quickFillOpen && (() => {
          const FIELDS: { key: string; label: string; hint: string; weight: number }[] = [
            { key: 'product_catalogue',       label: 'Products & Services',      hint: 'List the main products/services, model names, variants, capacities.',           weight: 20 },
            { key: 'technical_datasheets',    label: 'Technical Specs',          hint: 'Key specs: dimensions, ratings, operating ranges, voltages, pressures.',        weight: 15 },
            { key: 'certifications',          label: 'Certifications & Standards', hint: 'ISO, CE, ATEX, DNV, UL, FDA, REACH, NORSOK — anything certified/compliant.',  weight: 10 },
            { key: 'case_studies',            label: 'Customer References',      hint: 'Named customers, projects, sectors served, outcomes delivered.',                weight: 20 },
            { key: 'competitive_positioning', label: 'Competitive Positioning',  hint: 'What makes this supplier different? Why do customers choose them over rivals?', weight: 10 },
            { key: 'pricing_framework',       label: 'Pricing Framework',        hint: 'Price points, volume tiers, MOQ, currency, typical contract size.',            weight: 8  },
            { key: 'distribution_channels',   label: 'Distribution Channels',    hint: 'Direct, distributor network, webshop, private label, geography covered.',      weight: 12 },
            { key: 'reference_projects',      label: 'Named Projects',           hint: 'Specific projects, sites, plant names, countries, scale (MW, km, units).',     weight: 10 },
            { key: 'objections_responses',    label: 'FAQs & Objections',        hint: 'Common questions, concerns, lead times, warranty, limitations and answers.',   weight: 5  },
          ]
          return (
            <div className="px-6 pb-6" style={{ background: 'var(--stratagent-panel)' }}>
              <p className="text-xs mb-4" style={{ color: 'var(--stratagent-muted)' }}>
                Type what you know directly — no URL needed. Each field scores up to its weight. Even a few sentences per field can push depth past 30.
              </p>
              <div className="space-y-4">
                {FIELDS.map(f => {
                  const currentScore = kb?.intelligence_depth?.scores?.[f.key] ?? 0
                  const pct = Math.round((currentScore / f.weight) * 100)
                  return (
                    <div key={f.key}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold" style={{ color: 'var(--stratagent-text)' }}>
                          {f.label}
                        </label>
                        <span className="text-xs" style={{ color: pct >= 50 ? '#10b981' : 'var(--stratagent-muted)' }}>
                          {currentScore.toFixed(1)} / {f.weight} pts ({pct}%)
                        </span>
                      </div>
                      <textarea
                        value={quickFillFields[f.key] || ''}
                        onChange={e => setQuickFillFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.hint}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
                        style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={saveQuickFill}
                  disabled={quickFillLoading}
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                  {quickFillLoading ? 'Saving...' : 'Save & Re-score'}
                </button>
                {quickFillSaved && (
                  <span className="text-xs font-semibold" style={{ color: '#10b981' }}>
                    ✓ Saved — intelligence depth updated
                  </span>
                )}
              </div>
            </div>
          )
        })()}
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
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
                Saved Images ({productImages.length})
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                  {selectedImageIds.size} selected
                </span>
                <button
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ color: 'var(--stratagent-gold)', border: '1px solid var(--stratagent-gold-dim)', background: 'transparent' }}
                  onClick={() => setSelectedImageIds(
                    selectedImageIds.size === productImages.length
                      ? new Set()
                      : new Set(productImages.map((img: any) => img.image_id || img.id).filter(Boolean))
                  )}>
                  {selectedImageIds.size === productImages.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {productImages.map(img => {
                const imgId = img.image_id || img.id || ''
                const isSelected = selectedImageIds.has(imgId)
                const isAnalysed = visualAnalysisResult?.analyzed_at && isSelected
                return (
                <div key={imgId}
                     className="rounded-lg overflow-hidden relative cursor-pointer"
                     onClick={() => setSelectedImageIds(prev => {
                       const next = new Set(prev)
                       if (next.has(imgId)) { next.delete(imgId) } else { next.add(imgId) }
                       return next
                     })}
                     style={{ border: isSelected ? '2px solid var(--stratagent-gold)' : '1px solid var(--stratagent-border)',
                              opacity: isSelected ? 1 : 0.45, transition: 'all 0.15s' }}>
                  {img.data && (
                    <div className="relative">
                      <img src={'data:' + img.content_type + ';base64,' + img.data}
                           alt={img.product_name} className="w-full h-28 object-cover" />
                      {/* Selection indicator */}
                      <div className="absolute top-1 left-1 w-5 h-5 rounded-full flex items-center justify-center"
                           style={{ background: isSelected ? 'var(--stratagent-gold)' : 'rgba(0,0,0,0.5)',
                                    border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.4)' }}>
                        {isSelected && <span style={{ color: '#000', fontSize: '0.6rem', fontWeight: 900 }}>✓</span>}
                      </div>
                      {isAnalysed && (
                        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-xs font-bold"
                             style={{ background: 'rgba(0,0,0,0.75)', color: '#22c55e', fontSize: '0.6rem' }}>
                          ✓ ANALYSED
                        </div>
                      )}
                    </div>
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
                )
              })}
            </div>
          </div>
        )}
      </div>
      {/* Visual Intelligence Panel */}
      <div className="mt-4 p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <div className="flex items-start justify-between mb-3 gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-widest"
                  style={{ color: 'var(--stratagent-gold)' }}>
              Visual Intelligence
            </span>
            <p className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>
              Gemini analyses your uploaded product images for quality, competitive positioning, channel fit, and marketing copy.
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            {/* Visual Analysis button — shows cached state */}
            {productImages.length > 0 && (
              <div className="flex items-center gap-1.5">
                {visualAnalysisResult?.cached && (
                  <span className="text-xs px-2 py-0.5 rounded"
                        style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                    ✓ {new Date((visualAnalysisResult.analyzed_at || 0) * 1000).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
                  </span>
                )}
                <button
                  onClick={() => runVisualAnalysis(true)}
                  disabled={visualAnalysisLoading || selectedImageIds.size === 0}
                  className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-2"
                  style={{ background: visualAnalysisResult?.cached ? 'var(--stratagent-dark)' : 'var(--stratagent-gold)',
                           color: visualAnalysisResult?.cached ? 'var(--stratagent-gold)' : '#000',
                           border: visualAnalysisResult?.cached ? '1px solid var(--stratagent-gold-dim)' : 'none' }}>
                  {visualAnalysisLoading && (
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  )}
                  {visualAnalysisLoading ? 'Analysing...' : visualAnalysisResult?.cached ? 'Re-analyse' : 'Analyse Images'}
                </button>
              </div>
            )}
            {/* Export Visual Intelligence .docx */}
            {visualAnalysisResult?.analysis && (
              <button
                onClick={() => exportDocx(
                  '/output/export-visual-report/' + kb.supplier_id, {},
                  `STRATAGENT_${kb.company_name}_Visual_Intelligence.docx`
                )}
                disabled={exportDocxLoading === '/output/export-visual-report/' + kb.supplier_id}
                className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-2"
                style={{ background: 'transparent', color: 'var(--stratagent-gold)',
                         border: '1px solid var(--stratagent-gold-dim)' }}>
                {exportDocxLoading === '/output/export-visual-report/' + kb.supplier_id
                  ? 'Exporting...' : 'Export .docx'}
              </button>
            )}
            {/* Market Scan button — shows cached state */}
            <div className="flex items-center gap-1.5">
              {productScanResult?.cached && (
                <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                  ✓ {new Date((productScanResult.scanned_at || 0) * 1000).toLocaleDateString('en-GB', { day:'numeric', month:'short' })}
                </span>
              )}
              <button
                onClick={() => runProductScan(true)}
                disabled={productScanLoading}
                className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-2"
                style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                {productScanLoading && (
                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {productScanLoading ? 'Scanning...' : productScanResult?.cached ? 'Re-scan Market' : 'Market Scan'}
              </button>
            </div>
          </div>
        </div>

        {productImages.length === 0 && !productScanResult && (
          <div className="text-xs py-3 text-center rounded-lg"
               style={{ background: 'var(--stratagent-dark)', border: '1px dashed var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
            Upload product images above to enable visual analysis — or run a Market Scan to discover channels
          </div>
        )}

        {visualAnalysisResult?.analysis && (() => {
          const a = visualAnalysisResult.analysis
          const qi = a.quality_indicators || {}
          const cp = a.competitive_position || {}
          const ca = a.commercial_appeal || {}
          const TIER_STYLES: Record<string, { bg: string; color: string; label: string }> = {
            premium:        { bg: '#1c1400', color: '#f59e0b', label: 'PREMIUM' },
            above_average:  { bg: '#071a0e', color: '#10b981', label: 'ABOVE AVERAGE' },
            market_average: { bg: '#0f1623', color: '#94a3b8', label: 'MARKET AVERAGE' },
            below_average:  { bg: '#1c0d00', color: '#f97316', label: 'BELOW AVERAGE' },
            commodity:      { bg: '#1a0a0a', color: '#ef4444', label: 'COMMODITY' },
          }
          const tier = TIER_STYLES[cp.tier] || TIER_STYLES['market_average']
          const qualityScores = [
            { label: 'Print Clarity',    value: qi.print_clarity },
            { label: 'Color Richness',   value: qi.color_richness },
            { label: 'Composition',      value: qi.composition_score },
            { label: 'Production Value', value: qi.production_value },
            { label: 'Overall Quality',  value: qi.overall_quality },
          ].filter(s => s.value !== undefined)
          const appealScores = [
            { label: 'Gift Potential',    value: ca.gift_potential },
            { label: 'Wall Art',          value: ca.wall_art_appeal },
            { label: 'Collector Appeal',  value: ca.collector_appeal },
            { label: 'Retail Display',    value: ca.retail_display_impact },
          ].filter(s => s.value !== undefined)

          function ScoreBar({ label, value }: { label: string; value: number }) {
            const barColor = value >= 80 ? '#10b981' : value >= 60 ? '#f59e0b' : '#ef4444'
            return (
              <div className="flex items-center gap-3">
                <span className="text-xs w-32 shrink-0" style={{ color: 'var(--stratagent-muted)' }}>{label}</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: '#1e293b' }}>
                  <div className="h-full rounded-full" style={{ width: `${value}%`, background: barColor }} />
                </div>
                <span className="text-xs w-7 text-right font-semibold" style={{ color: barColor }}>{value}</span>
              </div>
            )
          }

          return (
            <div className="space-y-5 mt-1">
              {/* Tier badge */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-widest"
                      style={{ background: tier.bg, color: tier.color, border: `1px solid ${tier.color}55` }}>
                  {tier.label}
                </span>
                <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                  Competitive Position · {visualAnalysisResult.images_used} image{visualAnalysisResult.images_used !== 1 ? 's' : ''} analysed
                </span>
              </div>

              {/* Quality scores */}
              {qualityScores.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
                    Quality Indicators
                  </div>
                  <div className="space-y-2">
                    {qualityScores.map(s => <ScoreBar key={s.label} label={s.label} value={s.value} />)}
                  </div>
                </div>
              )}

              {/* Marketing description */}
              {a.marketing_description && (
                <div className="p-4 rounded-lg"
                     style={{ background: 'var(--stratagent-dark)', borderLeft: '3px solid var(--stratagent-gold)' }}>
                  <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-gold)' }}>
                    Marketing Description
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--stratagent-text)' }}>
                    {a.marketing_description}
                  </p>
                </div>
              )}

              {/* Verdict */}
              {a.quality_verdict && (
                <p className="text-xs italic" style={{ color: '#94a3b8' }}>{a.quality_verdict}</p>
              )}

              {/* Differentiators & Weaknesses */}
              {(cp.differentiators?.length > 0 || cp.weaknesses?.length > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  {cp.differentiators?.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#10b981' }}>Strengths</div>
                      <ul className="space-y-1">
                        {cp.differentiators.map((d: string, i: number) => (
                          <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: 'var(--stratagent-text)' }}>
                            <span style={{ color: '#10b981' }}>+</span>{d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {cp.weaknesses?.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-widest mb-2" style={{ color: '#f97316' }}>Watch Points</div>
                      <ul className="space-y-1">
                        {cp.weaknesses.map((w: string, i: number) => (
                          <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: 'var(--stratagent-text)' }}>
                            <span style={{ color: '#f97316' }}>!</span>{w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Commercial Appeal */}
              {appealScores.length > 0 && (
                <div>
                  <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
                    Commercial Appeal
                  </div>
                  <div className="space-y-2">
                    {appealScores.map(s => <ScoreBar key={s.label} label={s.label} value={s.value} />)}
                  </div>
                </div>
              )}

              {/* Recommended Positioning */}
              {a.recommended_positioning && (
                <div className="text-xs p-3 rounded-lg"
                     style={{ background: '#0c1a2e', border: '1px solid #0ea5e933', color: '#7dd3fc' }}>
                  <span className="font-semibold uppercase tracking-wider">Recommended Position: </span>
                  {a.recommended_positioning}
                </div>
              )}
            </div>
          )
        })()}

        {/* Product Market Scan Results — field names match run_product_scan() return shape */}
        {productScanResult && (
          <div className="space-y-4 mt-4 pt-4"
               style={{ borderTop: visualAnalysisResult?.analysis ? '1px solid var(--stratagent-border)' : 'none' }}>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
                Market Scan — {productScanResult.supplier}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded"
                      style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-gold)', border: '1px solid var(--stratagent-border)' }}>
                  {productScanResult.signals_found || 0} signals · {productScanResult.signals_stored || 0} saved
                </span>
                <button
                  onClick={() => exportDocx(
                    '/output/export-market-scan/' + kb.supplier_id,
                    { scan: productScanResult },
                    `STRATAGENT_${kb.company_name}_Market_Scan.docx`
                  )}
                  disabled={exportDocxLoading === '/output/export-market-scan/' + kb.supplier_id}
                  className="px-3 py-1 rounded text-xs font-semibold disabled:opacity-40"
                  style={{ background: 'transparent', color: 'var(--stratagent-gold)', border: '1px solid var(--stratagent-gold-dim)' }}>
                  {exportDocxLoading === '/output/export-market-scan/' + kb.supplier_id ? 'Exporting...' : 'Export .docx'}
                </button>
              </div>
            </div>

            {/* Saturation bars by channel */}
            {productScanResult.saturation_by_channel && Object.keys(productScanResult.saturation_by_channel).length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
                  Channel Saturation
                </div>
                <div className="space-y-2">
                  {Object.entries(productScanResult.saturation_by_channel as Record<string, number>)
                    .sort(([,a],[,b]) => a - b)
                    .map(([ch, score]) => {
                      const barColor = score >= 70 ? '#ef4444' : score >= 50 ? '#f59e0b' : '#10b981'
                      const label = score >= 70 ? 'Crowded' : score >= 50 ? 'Moderate' : 'Open'
                      return (
                        <div key={ch} className="flex items-center gap-3">
                          <span className="text-xs w-28 shrink-0" style={{ color: 'var(--stratagent-text)' }}>{ch}</span>
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: '#1e293b' }}>
                            <div className="h-full rounded-full" style={{ width: `${score}%`, background: barColor }} />
                          </div>
                          <span className="text-xs w-16 text-right" style={{ color: barColor }}>{label} {score}</span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Open channels highlight */}
            {productScanResult.open_channels?.length > 0 && (
              <div className="p-3 rounded-lg"
                   style={{ background: '#071a0e', border: '1px solid #166534' }}>
                <span className="text-xs font-semibold" style={{ color: '#4ade80' }}>
                  Best opportunities: {productScanResult.open_channels.join(' · ')}
                </span>
              </div>
            )}

            {/* Top signals */}
            {productScanResult.top_signals?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--stratagent-muted)' }}>
                  Top Signals
                </div>
                {productScanResult.top_signals.slice(0, 5).map((sig: any, i: number) => (
                  <div key={i} className="p-3 rounded-lg"
                       style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold px-2 py-0.5 rounded"
                            style={{ background: 'var(--stratagent-gold)22', color: 'var(--stratagent-gold)' }}>
                        {sig.signal_type}
                      </span>
                      {sig.channel && (
                        <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{sig.channel}</span>
                      )}
                      {sig.relevance_score !== undefined && (
                        <span className="text-xs ml-auto" style={{ color: '#64748b' }}>
                          rel: {sig.relevance_score}
                        </span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--stratagent-text)' }}>{sig.headline}</div>
                  </div>
                ))}
              </div>
            )}

            {productScanResult.error && (
              <div className="text-xs p-3 rounded-lg"
                   style={{ background: '#1a0a0a', border: '1px solid #ef444433', color: '#f87171' }}>
                {productScanResult.error}
              </div>
            )}
          </div>
        )}

        {/* Generate Channel Brief — available once we have scan or visual data */}
        {(visualAnalysisResult?.analysis || productScanResult) && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--stratagent-border)' }}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs font-black uppercase tracking-widest"
                      style={{ color: '#0ea5e9' }}>
                  Channel Strategy Brief
                </span>
                <p className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                  Gemini synthesises the quality data and scan into a concrete launch plan.
                </p>
              </div>
              <button
                onClick={runChannelBrief}
                disabled={channelBriefLoading}
                className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-2 shrink-0"
                style={{ background: '#0c1a2e', border: '1px solid #0ea5e9', color: '#7dd3fc' }}>
                {channelBriefLoading && (
                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                )}
                {channelBriefLoading ? 'Generating...' : 'Generate Brief'}
              </button>
            </div>

            {channelBriefResult?.brief && (
              <div>
                <div className="mt-3 p-4 rounded-lg text-sm leading-relaxed whitespace-pre-wrap"
                     style={{ background: 'var(--stratagent-dark)', border: '1px solid #0ea5e933', color: 'var(--stratagent-text)', fontFamily: 'inherit' }}>
                  {channelBriefResult.brief}
                </div>
                <div className="flex justify-end mt-2">
                  <button
                    onClick={() => exportDocx(
                      '/output/export-channel-brief/' + kb.supplier_id,
                      { brief: channelBriefResult.brief, channel_name: channelBriefResult.channel_name || '' },
                      `STRATAGENT_${kb.company_name}_Channel_Brief.docx`
                    )}
                    disabled={exportDocxLoading === '/output/export-channel-brief/' + kb.supplier_id}
                    className="px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-2"
                    style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                    {exportDocxLoading === '/output/export-channel-brief/' + kb.supplier_id ? 'Exporting...' : 'Export .docx'}
                  </button>
                </div>
              </div>
            )}
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
                  <div className="space-y-0.5 mt-1">
                    <div style={{ color: '#ef4444' }}>{syncResult.errors.length} file{syncResult.errors.length !== 1 ? 's' : ''} could not be synced:</div>
                    {syncResult.errors.map((e: any, i: number) => (
                      <div key={i} style={{ color: '#ef4444' }} className="pl-2">
                        {e.file}: {e.error}
                      </div>
                    ))}
                  </div>
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
                  placeholder="Your answer -- skip if you don't know"
                  rows={2}
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none resize-none"
                  style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
                />
              </div>
            ))}

            <button
              onClick={submitInterviewAnswers}
              disabled={interviewLoading || Object.keys(interviewAnswers).length === 0}
              className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
              Submit Answers
            </button>
          </div>
        )}

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
            Ingested {stratalystResult.ingested_count} sources - Depth now {Math.round(stratalystResult.intelligence_depth?.total || 0)}
          </div>
        )}
      </div>


      {/* DEAL TRIGGERS PANEL */}
      <div className="mt-4 p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-xs font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--stratagent-gold)' }}>
              DEAL TRIGGERS
            </div>
            <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
              Real-world events that signal a prospect is entering a buying cycle. Used by STRATAGORA to score live signals.
            </p>
          </div>
          <button
            onClick={generateDealTriggers}
            disabled={triggersLoading}
            className="ml-4 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5 whitespace-nowrap"
            style={{ background: triggersLoading ? '#1e1e1e' : 'var(--stratagent-gold)', color: triggersLoading ? 'var(--stratagent-text)' : '#000' }}>
            {triggersLoading
              ? <><svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating...</>
              : triggersGenerated ? 'Regenerate' : 'Generate Triggers'}
          </button>
        </div>

        {!triggersGenerated && !triggersLoading && (
          <div className="text-center py-8" style={{ color: 'var(--stratagent-muted)' }}>
            <div className="text-2xl mb-2">&#9889;</div>
            <p className="text-xs">Click Generate Triggers to synthesise deal signals from the Intelligence Seed.</p>
            <p className="text-xs mt-1" style={{ color: '#555' }}>Requires a built Intelligence Seed.</p>
          </div>
        )}

        {triggersGenerated && dealTriggers.length === 0 && (
          <div className="text-xs text-center py-6" style={{ color: 'var(--stratagent-muted)' }}>
            No triggers found. Try regenerating after building the Intelligence Seed.
          </div>
        )}

        {dealTriggers.length > 0 && (
          <div className="space-y-3">
            {dealTriggers.map(trigger => {
              const typeColors: Record<string, string> = {
                CAPEX: '#3b82f6', REGULATORY: '#f97316', HIRING: '#10b981',
                TECHNOLOGY: '#8b5cf6', 'M&A': '#ec4899', ESG: '#22d3ee',
                SEASONAL: '#eab308', COMPETITIVE: '#ef4444',
              }
              const color = typeColors[trigger.trigger_type] || '#888'
              const isEditing = editingTrigger === trigger.id

              return (
                <div key={trigger.id} className="rounded-lg p-4"
                     style={{ background: 'var(--stratagent-dark)', border: `1px solid ${trigger.jason_verified ? color + '55' : 'var(--stratagent-border)'}` }}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: color + '22', color }}>
                        {trigger.trigger_type}
                      </span>
                      {trigger.jason_verified && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#10b98122', color: '#10b981' }}>verified</span>
                      )}
                      <span className="text-xs font-semibold" style={{ color: 'var(--stratagent-text)' }}>{trigger.title}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!trigger.jason_verified && (
                        <button onClick={() => verifyTrigger(trigger.id)}
                          className="text-xs px-2 py-0.5 rounded"
                          style={{ background: '#10b98122', color: '#10b981' }}>
                          Verify
                        </button>
                      )}
                      <button onClick={() => deleteTrigger(trigger.id)}
                        className="text-xs px-2 py-0.5 rounded"
                        style={{ background: '#ef444422', color: '#ef4444' }}>
                        Remove
                      </button>
                    </div>
                  </div>

                  <p className="text-xs mb-2" style={{ color: 'var(--stratagent-muted)' }}>{trigger.description}</p>

                  {trigger.rationale && (
                    <p className="text-xs mb-2 italic" style={{ color: '#666' }}>Why it works: {trigger.rationale}</p>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex gap-1 flex-wrap">
                      {(trigger.scan_keywords || []).map((kw: string, ki: number) => (
                        <span key={ki} className="text-xs px-1.5 py-0.5 rounded font-mono"
                              style={{ background: '#1a1a2e', color: '#7c8cf8', border: '1px solid #2d2d5e' }}>
                          {kw}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs ml-auto" style={{ color: '#555' }}>
                      ~{trigger.lead_time_days}d lead time
                    </span>
                  </div>
                </div>
              )
            })}

            <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--stratagent-border)' }}>
              <p className="text-xs" style={{ color: '#555' }}>
                {dealTriggers.filter((t: any) => t.jason_verified).length} of {dealTriggers.length} triggers verified.
                Verified triggers are used by STRATAGORA when scoring live signals.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* SUPPLIER REPORTS PANEL */}
      <div className="mt-4 p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <div className="mb-4">
          <div className="text-xs font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--stratagent-gold)' }}>
            SUPPLIER REPORTS
          </div>
          <p className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
            Intelligence Audit, Capability Synthesis, and KB Q&A -- all grounded in this supplier's knowledge base.
          </p>
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: 'var(--stratagent-dark)' }}>
          {(['audit', 'synthesis', 'qa'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setReportTab(tab)}
              className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors"
              style={{
                background: reportTab === tab ? 'var(--stratagent-gold)' : 'transparent',
                color: reportTab === tab ? '#000' : 'var(--stratagent-muted)',
              }}>
              {tab === 'audit' ? 'Intelligence Audit' : tab === 'synthesis' ? 'Capability Synthesis' : 'Q&A'}
            </button>
          ))}
        </div>

        {/* AUDIT TAB */}
        {reportTab === 'audit' && (
          <div>
            <button
              onClick={runAudit}
              disabled={auditLoading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 mb-4"
              style={{ background: auditLoading ? '#1e1e1e' : 'var(--stratagent-gold)', color: auditLoading ? 'var(--stratagent-text)' : '#000' }}>
              {auditLoading
                ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Running Audit...</>
                : 'Run Intelligence Audit'}
            </button>

            {auditResult && !auditResult.error && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => printReport('audit')}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border"
                  style={{ background: 'transparent', border: '1px solid var(--stratagent-gold)', color: 'var(--stratagent-gold)' }}>
                  Print Gap Analysis
                </button>
                <button
                  onClick={() => printReport('discovery')}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold border"
                  style={{ background: 'transparent', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                  Print Discovery Sheet
                </button>
              </div>
            )}

            {auditResult?.error && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--stratagent-dark)', border: '1px solid #ef4444', color: '#ef4444' }}>
                {auditResult.error}
              </div>
            )}

            {auditResult && !auditResult.error && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold" style={{ color: 'var(--stratagent-text)' }}>{auditResult.company_name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>Intelligence Depth: {auditResult.overall_depth}/100</div>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded"
                        style={{
                          background: auditResult.overall_depth >= 80 ? '#052e16' : auditResult.overall_depth >= 50 ? '#1a1500' : '#1a0a0a',
                          color: auditResult.overall_depth >= 80 ? '#10b981' : auditResult.overall_depth >= 50 ? 'var(--stratagent-gold)' : '#ef4444',
                          border: `1px solid ${auditResult.overall_depth >= 80 ? '#10b981' : auditResult.overall_depth >= 50 ? 'var(--stratagent-gold)' : '#ef4444'}`
                        }}>
                    {auditResult.overall_grade}
                  </span>
                </div>

                {auditResult.top_3_priorities?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--stratagent-gold)' }}>Top Priorities</div>
                    <div className="space-y-2">
                      {auditResult.top_3_priorities.map((p: any) => (
                        <div key={p.rank} className="p-3 rounded-lg" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                          <div className="flex items-start gap-2">
                            <span className="text-xs font-black shrink-0 mt-0.5" style={{ color: 'var(--stratagent-gold)' }}>#{p.rank}</span>
                            <div>
                              <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--stratagent-text)' }}>{p.field}</div>
                              <div className="text-xs mb-1" style={{ color: 'var(--stratagent-muted)' }}>{p.why_it_matters}</div>
                              <div className="text-xs" style={{ color: '#10b981' }}>{p.action}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {auditResult.elements?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--stratagent-muted)' }}>All Elements</div>
                    <div className="space-y-2">
                      {auditResult.elements.map((el: any, i: number) => {
                        const gc = el.grade === 'STRONG' ? '#10b981' : el.grade === 'ADEQUATE' ? 'var(--stratagent-gold)' : el.grade === 'WEAK' ? '#f97316' : '#ef4444'
                        return (
                          <div key={i} className="p-3 rounded-lg" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold" style={{ color: 'var(--stratagent-text)' }}>{el.field}</span>
                              <span className="text-xs font-bold" style={{ color: gc }}>{el.grade} {el.score}/100</span>
                            </div>
                            {el.what_is_missing && <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>Gap: {el.what_is_missing}</div>}
                            {el.recommended_source && <div className="text-xs mt-1" style={{ color: '#60a5fa' }}>Source: {el.recommended_source}</div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {auditResult.strengths?.length > 0 && (
                  <div className="p-3 rounded-lg" style={{ background: 'var(--stratagent-dark)', border: '1px solid #10b981' }}>
                    <div className="text-xs font-semibold mb-1" style={{ color: '#10b981' }}>Strengths</div>
                    {auditResult.strengths.map((s: string, i: number) => (
                      <div key={i} className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{s}</div>
                    ))}
                  </div>
                )}

                {auditResult.ready_for && (
                  <div className="text-xs px-3 py-2 rounded-lg" style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-muted)' }}>
                    Ready for: <span style={{ color: 'var(--stratagent-text)' }}>{auditResult.ready_for}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SYNTHESIS TAB */}
        {reportTab === 'synthesis' && (
          <div>
            <button
              onClick={runSynthesis}
              disabled={synthesisLoading}
              className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2 mb-4"
              style={{ background: synthesisLoading ? '#1e1e1e' : 'var(--stratagent-gold)', color: synthesisLoading ? 'var(--stratagent-text)' : '#000' }}>
              {synthesisLoading
                ? <><svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Generating...</>
                : 'Generate Capability Report'}
            </button>

            {synthesisResult && !synthesisResult.error && (
              <div className="mb-4">
                <button
                  onClick={() => printReport('synthesis')}
                  className="w-full py-2 rounded-lg text-xs font-semibold border"
                  style={{ background: 'transparent', border: '1px solid var(--stratagent-gold)', color: 'var(--stratagent-gold)' }}>
                  Print Capability Report
                </button>
              </div>
            )}

            {synthesisResult?.error && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--stratagent-dark)', border: '1px solid #ef4444', color: '#ef4444' }}>
                {synthesisResult.error}
              </div>
            )}

            {synthesisResult && !synthesisResult.error && (
              <div className="space-y-4">
                <div>
                  <div className="text-sm font-bold mb-1" style={{ color: 'var(--stratagent-text)' }}>{synthesisResult.company_name}</div>
                  <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{synthesisResult.report_title}</div>
                </div>
                {synthesisResult.executive_summary && (
                  <div className="p-3 rounded-lg" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-gold)' }}>
                    <div className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--stratagent-gold)' }}>Executive Summary</div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--stratagent-text)' }}>{synthesisResult.executive_summary}</p>
                  </div>
                )}
                {synthesisResult.product_range?.products?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--stratagent-muted)' }}>Product Range</div>
                    <div className="text-xs mb-2 font-semibold" style={{ color: 'var(--stratagent-text)' }}>{synthesisResult.product_range.headline}</div>
                    {synthesisResult.product_range.products.map((p: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg mb-2" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                        <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--stratagent-text)' }}>{p.name}</div>
                        <div className="text-xs mb-1" style={{ color: 'var(--stratagent-muted)' }}>{p.description}</div>
                        {p.operating_envelope && <div className="text-xs" style={{ color: '#60a5fa' }}>Specs: {p.operating_envelope}</div>}
                        {p.applications && <div className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>Applications: {p.applications}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {synthesisResult.technical_differentiators?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--stratagent-muted)' }}>Technical Differentiators</div>
                    {synthesisResult.technical_differentiators.map((d: string, i: number) => (
                      <div key={i} className="text-xs mb-1 pl-3 border-l-2" style={{ color: 'var(--stratagent-text)', borderColor: 'var(--stratagent-gold)' }}>{d}</div>
                    ))}
                  </div>
                )}
                {synthesisResult.target_buyer_profiles?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--stratagent-muted)' }}>Target Buyers</div>
                    {synthesisResult.target_buyer_profiles.map((b: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg mb-2" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                        <div className="text-xs font-semibold mb-0.5" style={{ color: 'var(--stratagent-text)' }}>{b.buyer_type}</div>
                        <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{b.why_they_buy}</div>
                        {b.typical_application && <div className="text-xs mt-0.5" style={{ color: '#60a5fa' }}>{b.typical_application}</div>}
                      </div>
                    ))}
                  </div>
                )}
                {synthesisResult.common_objections?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-widest font-semibold mb-2" style={{ color: 'var(--stratagent-muted)' }}>Objection Handling</div>
                    {synthesisResult.common_objections.map((o: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg mb-2" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                        <div className="text-xs font-semibold mb-1" style={{ color: '#f97316' }}>"{o.objection}"</div>
                        <div className="text-xs" style={{ color: 'var(--stratagent-text)' }}>{o.response}</div>
                      </div>
                    ))}
                  </div>
                )}
                {synthesisResult.competitive_positioning && (
                  <div className="p-3 rounded-lg" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)' }}>
                    <div className="text-xs uppercase tracking-widest font-semibold mb-1" style={{ color: 'var(--stratagent-muted)' }}>Competitive Position</div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--stratagent-text)' }}>{synthesisResult.competitive_positioning}</p>
                  </div>
                )}
                <div className="text-xs pt-2" style={{ color: 'var(--stratagent-muted)', borderTop: '1px solid var(--stratagent-border)' }}>
                  Prepared by {synthesisResult.prepared_by} -- {synthesisResult.prepared_for_org} -- {synthesisResult.contact_email}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Q&A TAB */}
        {reportTab === 'qa' && (
          <div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={qaQuestion}
                onChange={e => setQaQuestion(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && askQuestion()}
                placeholder="Ask anything about this supplier..."
                className="flex-1 px-3 py-2 rounded-lg text-sm"
                style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}
              />
              <button
                onClick={askQuestion}
                disabled={qaLoading || !qaQuestion.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
                {qaLoading ? '...' : 'Ask'}
              </button>
            </div>
            {qaResult?.error && (
              <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--stratagent-dark)', border: '1px solid #ef4444', color: '#ef4444' }}>
                {qaResult.error}
              </div>
            )}
            {qaResult && !qaResult.error && (
              <div className="space-y-3">
                <div className="p-4 rounded-lg" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-gold)' }}>
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--stratagent-muted)' }}>Q: {qaResult.question}</div>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--stratagent-text)' }}>{qaResult.answer}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs px-2 py-0.5 rounded font-semibold"
                        style={{
                          background: qaResult.confidence === 'HIGH' ? '#052e16' : qaResult.confidence === 'MEDIUM' ? '#1a1500' : '#1a0a0a',
                          color: qaResult.confidence === 'HIGH' ? '#10b981' : qaResult.confidence === 'MEDIUM' ? 'var(--stratagent-gold)' : '#ef4444',
                          border: `1px solid ${qaResult.confidence === 'HIGH' ? '#10b981' : qaResult.confidence === 'MEDIUM' ? 'var(--stratagent-gold)' : '#ef4444'}`
                        }}>
                    {qaResult.confidence} CONFIDENCE
                  </span>
                  <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>{qaResult.confidence_reason}</span>
                </div>
                {qaResult.missing_intel && (
                  <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--stratagent-dark)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
                    To answer more precisely: {qaResult.missing_intel}
                  </div>
                )}
                {qaResult.kb_fields_used?.length > 0 && (
                  <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                    Sources: {qaResult.kb_fields_used.join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  )
}
