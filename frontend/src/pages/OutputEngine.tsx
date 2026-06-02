import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { api, setSession } from '../services/api'
import type { Session } from '../App'

export default function OutputEngine({ session }: { session: Session }) {
  const { profileId } = useParams()
  const [loading, setLoading] = useState(false)
  const [output, setOutput] = useState<any>(null)
  const [activeTab, setActiveTab] = useState(0)

  setSession(session.sessionId)

  async function generate() {
    if (!profileId || profileId === 'select') return
    setLoading(true)
    try {
      const res = await api.post('/output/generate', { profile_id: profileId })
      setOutput(res.data)
    } catch (e: any) {
      alert(e.response?.data?.detail?.message || e.response?.data?.detail || 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  if (!profileId || profileId === 'select') {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <div className="text-lg font-bold mb-2" style={{ color: 'var(--stratagent-text)' }}>
          No profile selected
        </div>
        <div className="text-sm" style={{ color: 'var(--stratagent-muted)' }}>
          Run Field Intelligence first, then click Generate to produce output.
        </div>
      </div>
    )
  }

  if (!output) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <button onClick={generate} disabled={loading}
                className="px-8 py-4 rounded-xl font-bold text-lg disabled:opacity-40"
                style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
          {loading ? 'Generating intelligence package...' : 'Generate Output'}
        </button>
        <p className="mt-4 text-xs" style={{ color: 'var(--stratagent-muted)' }}>
          Output path determined by Convergence Index
        </p>
      </div>
    )
  }

  const tabs = Object.keys(output.output).map(k => ({
    key: k,
    label: k.replace(/_/g, ' ').toUpperCase(),
    content: typeof output.output[k] === 'string'
      ? output.output[k]
      : JSON.stringify(output.output[k], null, 2),
  }))

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest mb-1"
               style={{ color: 'var(--stratagent-gold)' }}>
            {output.label}
          </div>
          <h2 className="text-2xl font-black" style={{ color: 'var(--stratagent-text)' }}>
            {output.company_name}
          </h2>
          <div className="text-sm mt-1" style={{ color: 'var(--stratagent-muted)' }}>
            Convergence Index: <span style={{ color: 'var(--stratagent-gold)' }}>{output.convergence_index}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {tabs.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(i)}
            className="px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-widest transition-colors"
            style={{
              background: activeTab === i ? 'var(--stratagent-gold)' : 'var(--stratagent-panel)',
              color: activeTab === i ? '#000' : 'var(--stratagent-muted)',
              border: '1px solid var(--stratagent-border)',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6 rounded-xl"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <pre className="text-sm whitespace-pre-wrap" style={{ color: 'var(--stratagent-text)', fontFamily: 'inherit' }}>
          {tabs[activeTab]?.content}
        </pre>
      </div>

      {/* Copy button */}
      <button
        onClick={() => navigator.clipboard.writeText(tabs[activeTab]?.content)}
        className="mt-3 px-4 py-2 rounded-lg text-xs"
        style={{ border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
        Copy to clipboard
      </button>
    </div>
  )
}
