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
  KB:         '/knowledge-base',
  FI:         '/field-intelligence',
  WATCH:      '/active-watch',
  OUTPUT:     '/output',
  SCOUT:      '/stratascout',
  STRATALINK: '/stratalink',
}

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
            CI {call.ci}
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

function ActionCard({ action, navigate }: { action: any; navigate: any }) {
  const modColour = MODULE_COLOUR[action.module] || '#64748b'
  const effortColour = EFFORT_COLOUR[action.effort] || '#64748b'
  const route = MODULE_ROUTE[action.module]
  return (
    <div className="p-4 rounded-xl flex gap-4"
         style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-2xl font-black" style={{ color: 'var(--stratagent-gold)' }}>
          {action.priority}
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded font-mono"
              style={{ background: modColour + '22', color: modColour, border: '1px solid ' + modColour + '44' }}>
          {action.module}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm mb-1" style={{ color: 'var(--stratagent-text)' }}>
          {action.action}
        </div>
        <p className="text-xs mb-2" style={{ color: 'var(--stratagent-muted)' }}>
          {action.why}
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: effortColour }}>
            ⏱ {action.effort}
          </span>
          {route && (
            <button
              onClick={() => navigate(route)}
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-muted)', border: '1px solid var(--stratagent-border)' }}>
              Go →
            </button>
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
  const navigate = useNavigate()

  setSession(session.sessionId)

  useEffect(() => { loadSnapshot() }, [])

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

  async function generateBrief() {
    setGenerating(true)
    try {
      const res = await api.post('/strategist/brief')
      setBrief(res.data.brief)
      setGeneratedAt(res.data.generated_at)
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Brief generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const generatedTime = generatedAt
    ? new Date(generatedAt * 1000).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="max-w-4xl mx-auto">

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
          <h2 className="text-2xl font-black" style={{ color: 'var(--stratagent-text)' }}>
            Monday Brief
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--stratagent-muted)' }}>
            Who to call. What changed. Where to point your energy.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={generateBrief}
            disabled={generating || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: generating ? '#1e1e1e' : 'var(--stratagent-gold)', color: generating ? 'var(--stratagent-text)' : '#000' }}>
            {generating ? 'Generating brief…' : brief ? '↻ Refresh Brief' : '▶ Generate Brief'}
          </button>
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
                  <ActionCard key={action.priority} action={action} navigate={navigate} />
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

          {/* Watch Alerts */}
          {brief.watch_alerts?.length > 0 && (
            <div className="p-5 rounded-xl space-y-2"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid #7c3aed44' }}>
              <div className="text-xs font-mono uppercase tracking-widest mb-1" style={{ color: '#7c3aed' }}>
                Watch Alerts
              </div>
              {brief.watch_alerts.map((alert: string, i: number) => (
                <div key={i} className="flex gap-2 text-xs" style={{ color: 'var(--stratagent-text)' }}>
                  <span style={{ color: '#7c3aed' }}>⚡</span>
                  {alert}
                </div>
              ))}
            </div>
          )}

          {/* KB Health */}
          {brief.kb_health && (
            <div className="p-5 rounded-xl"
                 style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
              <div className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--stratagent-muted)' }}>
                Knowledge Base Health
              </div>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Strongest', value: brief.kb_health.strongest, colour: '#22c55e' },
                  { label: 'Weakest', value: brief.kb_health.weakest, colour: '#ef4444' },
                  { label: 'Fix First', value: brief.kb_health.fix_first, colour: '#f59e0b' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="text-xs mb-1" style={{ color: item.colour }}>{item.label}</div>
                    <div className="text-xs" style={{ color: 'var(--stratagent-text)' }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
