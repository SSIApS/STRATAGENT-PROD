import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, setSession } from '../services/api'
import type { Session } from '../App'

const TRIGGER_COLOUR: Record<string, string> = {
  time:      '#f59e0b',
  event:     '#7c3aed',
  threshold: '#0ea5e9',
  document:  '#22c55e',
}

const TRIGGER_LABEL: Record<string, string> = {
  time:      'TIME',
  event:     'EVENT',
  threshold: 'SD THRESHOLD',
  document:  'DOCUMENT',
}

function AgeDot({ days }: { days: number }) {
  const colour = days > 30 ? '#ef4444' : days > 14 ? '#f59e0b' : '#22c55e'
  return (
    <span className="inline-flex items-center gap-1 text-xs" style={{ color: colour }}>
      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: colour }} />
      {days}d
    </span>
  )
}

function TriggerBadge({ type }: { type: string }) {
  const colour = TRIGGER_COLOUR[type] || '#64748b'
  const label = TRIGGER_LABEL[type] || type.toUpperCase()
  return (
    <span className="text-xs px-2 py-0.5 rounded font-mono font-semibold"
          style={{ background: colour + '22', color: colour, border: '1px solid ' + colour + '44' }}>
      {label}
    </span>
  )
}

function StatusBadge({ status, urgency, urgencyColour }: { status: string, urgency: string, urgencyColour: string }) {
  if (status === 'surfaced') {
    return (
      <span className="text-xs px-2 py-1 rounded font-semibold animate-pulse"
            style={{ background: '#064e3b', color: '#22c55e', border: '1px solid #22c55e44' }}>
        {'⚡'} {urgency}
      </span>
    )
  }
  return (
    <span className="text-xs px-2 py-1 rounded"
          style={{ background: urgencyColour + '18', color: urgencyColour, border: '1px solid ' + urgencyColour + '33' }}>
      {urgency}
    </span>
  )
}

interface Position {
  id: string
  supplier_id: string
  company_name: string
  reason_parked: string
  trigger: { type: string; value?: string; days?: number }
  notes?: string
  status: string
  surfaced_reason?: string
  age_days: number
  urgency_label: string
  urgency_colour: string
  priority_score: number
}

function PositionCard({
  position, kbMap, expanded, onToggle, onDismiss, onPromote,
}: {
  position: Position
  kbMap: Record<string, string>
  expanded: boolean
  onToggle: () => void
  onDismiss: () => void
  onPromote: () => void
}) {
  const supplierName = kbMap[position.supplier_id] || position.supplier_id
  const isDismissed = position.status === 'dismissed'
  const isSurfaced = position.status === 'surfaced'

  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: 'var(--stratagent-panel)',
        border: '1px solid ' + (isSurfaced ? '#22c55e66' : 'var(--stratagent-border)'),
      }}
      onClick={onToggle}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm" style={{ color: 'var(--stratagent-text)' }}>
                {position.company_name}
              </span>
              <TriggerBadge type={position.trigger?.type} />
              <AgeDot days={position.age_days} />
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--stratagent-muted)' }}>
              {supplierName} {'·'} {position.reason_parked}
            </div>
            {isSurfaced && position.surfaced_reason && (
              <div className="mt-2 text-xs p-2 rounded" style={{ background: '#064e3b', color: '#22c55e' }}>
                {'⚡'} {position.surfaced_reason}
              </div>
            )}
          </div>
          <StatusBadge
            status={position.status}
            urgency={position.urgency_label}
            urgencyColour={position.urgency_colour}
          />
        </div>
      </div>

      {expanded && !isDismissed && (
        <div className="px-4 pb-4 border-t" style={{ borderColor: 'var(--stratagent-border)' }}>
          <div className="pt-3 space-y-2">
            {position.trigger?.value && (
              <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                <span style={{ color: 'var(--stratagent-text)' }}>Trigger condition:</span>{' '}
                {position.trigger.value}
              </div>
            )}
            {position.trigger?.days && (
              <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                <span style={{ color: 'var(--stratagent-text)' }}>Time window:</span>{' '}
                {position.trigger.days} days
              </div>
            )}
            {position.notes && (
              <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
                <span style={{ color: 'var(--stratagent-text)' }}>Notes:</span>{' '}
                {position.notes}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={e => { e.stopPropagation(); onPromote() }}
                className="px-3 py-1.5 rounded text-xs font-semibold"
                style={{ background: 'var(--stratagent-gold)', color: '#000' }}
              >
                Promote to FI {'→'}
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDismiss() }}
                className="px-3 py-1.5 rounded text-xs"
                style={{
                  background: 'var(--stratagent-dark)',
                  color: 'var(--stratagent-muted)',
                  border: '1px solid var(--stratagent-border)',
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ActiveWatch({ session }: { session: Session }) {
  const [positions, setPositions] = useState<Position[]>([])
  const [counts, setCounts] = useState({ watching: 0, surfaced: 0, promoted: 0, dismissed: 0 })
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [showDismissed, setShowDismissed] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [kbMap, setKbMap] = useState<Record<string, string>>({})
  const navigate = useNavigate()

  setSession(session.sessionId)

  useEffect(() => { loadAll() }, [showDismissed])

  useEffect(() => {
    api.get('/knowledge-base/').then(r => {
      const map: Record<string, string> = {}
      for (const kb of r.data.knowledge_bases || r.data || []) {
        map[kb.id || kb.supplier_id] = kb.company_name
      }
      setKbMap(map)
    }).catch(() => {})
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const res = await api.get('/active-watch/all?include_dismissed=' + showDismissed)
      setPositions(res.data.positions || [])
      setCounts(res.data.counts || { watching: 0, surfaced: 0, promoted: 0, dismissed: 0 })
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  async function runScan() {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await api.post('/active-watch/scan-all')
      setScanResult(res.data)
      await loadAll()
    } catch (e: any) {
      alert(e.response?.data?.detail || 'STRATADAR scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function dismiss(id: string) {
    try {
      await api.post('/active-watch/' + id + '/dismiss')
      await loadAll()
    } catch {
      alert('Dismiss failed')
    }
  }

  async function promote(id: string, company: string, supplierId: string) {
    try {
      await api.post('/active-watch/' + id + '/promote')
      navigate('/field-intelligence', { state: { supplier_id: supplierId, company_name: company } })
    } catch {
      alert('Promote failed')
    }
  }

  const watching = positions.filter(p => p.status === 'watching')
  const surfaced = positions.filter(p => p.status === 'surfaced')
  const dismissed = positions.filter(p => p.status === 'dismissed')
  const hasActive = watching.length + surfaced.length > 0

  return (
    <div className="max-w-4xl mx-auto">
      {/* STRATADAR Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={{ background: '#7c3aed22', color: '#7c3aed', border: '1px solid #7c3aed44' }}
            >
              STRATADAR
            </span>
            <span className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
              Active Watch Monitor
            </span>
          </div>
          <h2 className="text-2xl font-black" style={{ color: 'var(--stratagent-text)' }}>
            Active Watch
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--stratagent-muted)' }}>
            Monitored positions waiting for the right trigger.
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning || !hasActive}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          style={{
            background: scanning ? '#1e1e1e' : 'var(--stratagent-gold)',
            color: scanning ? 'var(--stratagent-text)' : '#000',
          }}
        >
          {scanning ? 'Scanning…' : '◎ STRATADAR SCAN'}
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'WATCHING', value: counts.watching, colour: '#7c3aed' },
          { label: 'SURFACED', value: counts.surfaced, colour: '#22c55e' },
          { label: 'PROMOTED', value: counts.promoted, colour: '#0ea5e9' },
        ].map(stat => (
          <div
            key={stat.label}
            className="p-3 rounded-xl text-center"
            style={{ background: 'var(--stratagent-panel)', border: '1px solid ' + stat.colour + '33' }}
          >
            <div className="text-2xl font-black" style={{ color: stat.colour }}>{stat.value}</div>
            <div className="text-xs mt-0.5 font-mono" style={{ color: 'var(--stratagent-muted)' }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Scan Result Banner */}
      {scanResult && (
        <div
          className="mb-4 p-4 rounded-lg text-sm"
          style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-green)', color: 'var(--stratagent-green)' }}
        >
          STRATADAR scanned {scanResult.scanned} positions across {scanResult.suppliers_scanned} suppliers
          {' · '}{scanResult.newly_surfaced} newly surfaced
          {scanResult.errors?.length > 0 && (
            <span className="ml-2" style={{ color: '#ef4444' }}>
              {' · '}{scanResult.errors.length} errors
            </span>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-sm py-8 text-center" style={{ color: 'var(--stratagent-muted)' }}>
          Loading positions...
        </div>
      )}

      {/* Surfaced — action required */}
      {!loading && surfaced.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-mono mb-2" style={{ color: '#22c55e' }}>
            {'⚡'} SURFACED {'—'} ACTION REQUIRED
          </div>
          <div className="space-y-3">
            {surfaced.map(p => (
              <PositionCard
                key={p.id}
                position={p}
                kbMap={kbMap}
                expanded={expandedId === p.id}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                onDismiss={() => dismiss(p.id)}
                onPromote={() => promote(p.id, p.company_name, p.supplier_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Watching */}
      {!loading && watching.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-mono mb-2" style={{ color: 'var(--stratagent-muted)' }}>
            {'◎'} WATCHING
          </div>
          <div className="space-y-3">
            {watching.map(p => (
              <PositionCard
                key={p.id}
                position={p}
                kbMap={kbMap}
                expanded={expandedId === p.id}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                onDismiss={() => dismiss(p.id)}
                onPromote={() => promote(p.id, p.company_name, p.supplier_id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !hasActive && dismissed.length === 0 && (
        <div className="text-center py-16 text-sm" style={{ color: 'var(--stratagent-muted)' }}>
          <div className="text-4xl mb-3">{'◎'}</div>
          <div>No positions in Active Watch.</div>
          <div className="mt-1 text-xs">
            Prospects with SD below 60 are automatically parked here from Field Intelligence.
          </div>
        </div>
      )}

      {/* Show Dismissed toggle */}
      {counts.dismissed > 0 && (
        <button
          onClick={() => setShowDismissed(v => !v)}
          className="text-xs mt-4"
          style={{ color: 'var(--stratagent-muted)' }}
        >
          {showDismissed ? '↑ Hide dismissed' : '↓ Show ' + String(counts.dismissed) + ' dismissed'}
        </button>
      )}
      {showDismissed && dismissed.length > 0 && (
        <div className="mt-3 space-y-2 opacity-50">
          {dismissed.map(p => (
            <PositionCard
              key={p.id}
              position={p}
              kbMap={kbMap}
              expanded={false}
              onToggle={() => {}}
              onDismiss={() => {}}
              onPromote={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
}
