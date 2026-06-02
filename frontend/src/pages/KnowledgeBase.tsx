import { useState } from 'react'
import { api, setSession } from '../services/api'
import type { Session } from '../App'
import IntelligenceDepthGauge from '../components/KnowledgeBase/IntelligenceDepthGauge'
import GapList from '../components/KnowledgeBase/GapList'

export default function KnowledgeBase({ session }: { session: Session }) {
  const [step, setStep] = useState<'create' | 'view'>('create')
  const [companyName, setCompanyName] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [kb, setKb] = useState<any>(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [newlyUnlocked, setNewlyUnlocked] = useState<string | null>(null)

  setSession(session.sessionId)

  async function createKB() {
    setLoading(true)
    try {
      const res = await api.post('/knowledge-base/create', {
        company_name: companyName,
        website_url: websiteUrl || null,
      })
      setKb(res.data)
      setStep('view')
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Failed to create Knowledge Base')
    } finally {
      setLoading(false)
    }
  }

  async function uploadDocument(file: File) {
    setUploadLoading(true)
    setNewlyUnlocked(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await api.post(`/knowledge-base/${kb.supplier_id}/upload`, form)
      setKb(res.data)
      if (res.data.newly_unlocked) setNewlyUnlocked(res.data.newly_unlocked)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Upload failed')
    } finally {
      setUploadLoading(false)
    }
  }

  if (step === 'create') {
    return (
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--stratagent-text)' }}>
          New Knowledge Base
        </h2>
        <p className="text-sm mb-8" style={{ color: 'var(--stratagent-muted)' }}>
          Enter the supplier's name and website. STRATAGENT will research them automatically.
        </p>

        <div className="space-y-4 p-6 rounded-xl"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2"
                   style={{ color: 'var(--stratagent-muted)' }}>
              Company Name *
            </label>
            <input
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="e.g. Acme Industrial Components GmbH"
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
              Website URL
            </label>
            <input
              value={websiteUrl}
              onChange={e => setWebsiteUrl(e.target.value)}
              placeholder="https://www.example.com"
              className="w-full px-4 py-3 rounded-lg text-sm outline-none"
              style={{
                background: 'var(--stratagent-dark)',
                border: '1px solid var(--stratagent-border)',
                color: 'var(--stratagent-text)',
              }}
            />
          </div>
          <button
            onClick={createKB}
            disabled={loading || !companyName}
            className="w-full py-3 rounded-lg font-semibold text-sm disabled:opacity-40"
            style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            {loading ? 'Researching supplier...' : 'Build Knowledge Base'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black" style={{ color: 'var(--stratagent-text)' }}>
            {kb?.company_name}
          </h2>
          <p className="text-xs uppercase tracking-widest mt-1"
             style={{ color: 'var(--stratagent-gold)' }}>
            {kb?.threshold_status?.label}
          </p>
        </div>
        <button onClick={() => { setStep('create'); setKb(null) }}
                className="text-xs px-4 py-2 rounded-lg"
                style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
          + New Supplier
        </button>
      </div>

      {newlyUnlocked && (
        <div className="mb-4 p-4 rounded-lg text-sm font-semibold"
             style={{ background: '#064e3b', color: 'var(--stratagent-green)', border: '1px solid var(--stratagent-green)' }}>
          ✓ {newlyUnlocked}
        </div>
      )}

      <IntelligenceDepthGauge
        scores={kb?.intelligence_depth?.scores || {}}
        total={kb?.intelligence_depth?.total || 0}
        thresholdStatus={kb?.threshold_status}
      />

      <GapList gaps={kb?.gaps || []} />

      {/* Document upload */}
      <div className="mt-6 p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <div className="text-xs uppercase tracking-widest mb-4"
             style={{ color: 'var(--stratagent-muted)' }}>
          Upload Document (PDF)
        </div>
        <label className="flex items-center justify-center w-full py-8 rounded-lg cursor-pointer transition-colors"
               style={{ border: '2px dashed var(--stratagent-border)' }}>
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => e.target.files?.[0] && uploadDocument(e.target.files[0])}
            disabled={uploadLoading}
          />
          <span style={{ color: 'var(--stratagent-muted)' }} className="text-sm">
            {uploadLoading ? 'Extracting intelligence...' : 'Click to upload PDF'}
          </span>
        </label>
      </div>
    </div>
  )
}
