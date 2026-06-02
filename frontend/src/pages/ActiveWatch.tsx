import { useState } from 'react'
import { api, setSession } from '../services/api'
import type { Session } from '../App'

export default function ActiveWatch({ session }: { session: Session }) {
  const [supplierId, setSupplierId] = useState('')
  const [positions, setPositions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)

  setSession(session.sessionId)

  async function loadPositions() {
    if (!supplierId) return
    setLoading(true)
    try {
      const res = await api.get(`/active-watch/${supplierId}`)
      setPositions(res.data.positions)
    } catch {
      alert('Failed to load positions')
    } finally {
      setLoading(false)
    }
  }

  async function scan() {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await api.post(`/active-watch/scan/${supplierId}`)
      setScanResult(res.data)
      await loadPositions()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Scan failed')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-black mb-1" style={{ color: 'var(--stratagent-text)' }}>
        Active Watch
      </h2>
      <p className="text-sm mb-8" style={{ color: 'var(--stratagent-muted)' }}>
        Monitored Positions — parked opportunities waiting for the right trigger.
      </p>

      <div className="flex gap-3 mb-6">
        <input
          value={supplierId}
          onChange={e => setSupplierId(e.target.value)}
          placeholder="Supplier ID"
          className="flex-1 px-4 py-2 rounded-lg text-sm outline-none"
          style={{
            background: 'var(--stratagent-panel)',
            border: '1px solid var(--stratagent-border)',
            color: 'var(--stratagent-text)',
          }}
        />
        <button onClick={loadPositions} disabled={loading || !supplierId}
                className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)', color: 'var(--stratagent-text)' }}>
          Load
        </button>
        {positions.length > 0 && (
          <button onClick={scan} disabled={scanning}
                  className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                  style={{ background: 'var(--stratagent-gold)', color: '#000' }}>
            {scanning ? 'Scanning...' : 'Scan for Triggers'}
          </button>
        )}
      </div>

      {scanResult && (
        <div className="mb-4 p-4 rounded-lg text-sm"
             style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-green)', color: 'var(--stratagent-green)' }}>
          Scanned {scanResult.scanned} positions · {scanResult.surfaced?.length || 0} surfaced · {scanResult.still_watching} still watching
        </div>
      )}

      <div className="space-y-3">
        {positions.map((p, i) => (
          <div key={i} className="p-4 rounded-xl"
               style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold text-sm" style={{ color: 'var(--stratagent-text)' }}>
                  {p.company_name}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>
                  Parked: {p.reason_parked}
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>
                  Trigger: {p.trigger?.type} {p.trigger?.value ? `→ ${p.trigger.value}` : ''}
                </div>
              </div>
              <div className="text-xs px-2 py-1 rounded"
                   style={{
                     background: p.status === 'surfaced' ? '#064e3b' : 'var(--stratagent-dark)',
                     color: p.status === 'surfaced' ? 'var(--stratagent-green)' : 'var(--stratagent-muted)',
                   }}>
                {p.status === 'surfaced' ? '⚡ SURFACED' : '◉ WATCHING'}
              </div>
            </div>
          </div>
        ))}

        {positions.length === 0 && supplierId && !loading && (
          <div className="text-center py-12 text-sm" style={{ color: 'var(--stratagent-muted)' }}>
            No monitored positions. Prospects with Convergence Index below 60 are automatically parked here.
          </div>
        )}
      </div>
    </div>
  )
}
