import { useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import type { Session } from '../App'

const API = 'http://127.0.0.1:9000'

// Inject spin keyframe once
if (typeof document !== 'undefined' && !document.getElementById('dash-spin-style')) {
  const s = document.createElement('style')
  s.id = 'dash-spin-style'
  s.textContent = '@keyframes dashSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'
  document.head.appendChild(s)
}

// ── Intelligence Pipeline (top tier) ──────────────────────────────────────────
const PIPELINE = [
  {
    key: 'kb',
    label: 'KNOWLEDGE BASE',
    tagline: 'Supplier intelligence foundation',
    description: 'Build deep dossiers on every supplier. Upload product images, track intelligence depth, and give every agent the context it needs to act.',
    path: '/knowledge-base',
    accent: '#d4a843',
    stat: 'suppliers',
  },
  {
    key: 'scout',
    label: 'STRATASCOUT',
    tagline: 'Discovery & prospecting engine',
    description: 'Surface new suppliers, products, and distribution channels by scanning the web on demand. Convert candidates into Knowledge Base entries in one click.',
    path: '/stratascout',
    accent: '#818cf8',
    stat: null,
  },
  {
    key: 'fi',
    label: 'FIELD INTELLIGENCE',
    tagline: 'Live channel & market research',
    description: 'Commission grounded market research for any KB supplier. Channel fit, competitor mapping, buyer signals, and pricing benchmarks — regionally aware.',
    path: '/field-intelligence',
    accent: '#38bdf8',
    stat: null,
  },
]

// ── Action Modules (second tier) ─────────────────────────────────────────────
const ACTIONS = [
  {
    key: 'watch',
    label: 'ACTIVE WATCH',
    tagline: 'Persistent signal monitoring',
    description: 'Park opportunities and set triggers. STRATAGORA surfaces them when market conditions shift.',
    path: '/active-watch',
    accent: '#fb923c',
    stat: 'watches',
  },
  {
    key: 'link',
    label: 'STRATALINK',
    tagline: 'Outreach & relationship engine',
    description: 'Draft intelligence-backed outreach emails, track contact status, and move from signal to conversation.',
    path: '/stratalink',
    accent: '#4ade80',
    stat: null,
  },
  {
    key: 'strategist',
    label: 'STRATEGIST',
    tagline: 'Senior strategic advisor',
    description: 'Cross-module synthesis. Prioritised action list based on current KB state, scan results, and active pipeline.',
    path: '/strategist',
    accent: '#f472b6',
    stat: null,
  },
  {
    key: 'products',
    label: 'PRODUCTS',
    tagline: 'Product market analysis',
    description: 'Register any product — own, affiliate, or client. STRATAGORA classifies and scans market opportunity automatically.',
    path: '/product-analysis',
    accent: '#06b6d4',
    stat: 'products',
  },
]

interface Stats {
  suppliers: number
  products: number
  watches: number
  signals: number
}

export default function Dashboard({ session }: { session: Session }) {
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    async function loadStats() {
      const [kbR, prR] = await Promise.allSettled([
        fetch(`${API}/api/knowledge-base/`),
        fetch(`${API}/api/product-registry/`),
      ])
      const kb = kbR.status === 'fulfilled' && kbR.value.ok ? await kbR.value.json() : null
      const pr = prR.status === 'fulfilled' && prR.value.ok ? await prR.value.json() : null
      setStats({
        suppliers: kb?.knowledge_bases?.length ?? kb?.count ?? 0,
        products: pr?.count ?? pr?.products?.length ?? 0,
        watches: 0,
        signals: 0,
      })
    }
    loadStats()
  }, [])

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  function getStatLabel(key: string | null): string | null {
    if (!stats || !key) return null
    const val = stats[key as keyof Stats]
    if (val === 0) return null
    return `${val} ${key === 'suppliers' ? 'in KB' : key === 'products' ? 'tracked' : 'active'}`
  }

  return (
    <div className="max-w-6xl mx-auto">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="mb-10 flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-xs font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ background: 'var(--stratagent-gold)22', color: 'var(--stratagent-gold)', border: '1px solid var(--stratagent-gold)44' }}>
              INTERNAL
            </span>
            <span className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
              Strategic Sales International ApS
            </span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-1">
            Intelligence Platform
          </h1>
          <p className="text-sm" style={{ color: 'var(--stratagent-muted)' }}>
            The Intelligence Behind Agentic Sales &mdash; {session?.name || 'Jason L. Smith'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
            {today}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--stratagent-gold)' }}>
            STRATAGENT v2
          </p>
        </div>
      </div>

      {/* ── Live stats bar ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-10">
        {[
          { label: 'Suppliers in KB', value: stats?.suppliers, icon: '◈' },
          { label: 'Products Tracked', value: stats?.products, icon: '◆' },
          { label: 'Watch Targets', value: stats?.watches, icon: '◉' },
          { label: 'Signals Generated', value: stats?.signals, icon: '◎' },
        ].map(s => (
          <div key={s.label} className="rounded-lg px-4 py-3 flex items-center gap-3"
               style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
            <span className="text-lg" style={{ color: 'var(--stratagent-gold)' }}>{s.icon}</span>
            <div>
              <div className="text-xl font-black text-white leading-none">
                {stats === null
                  ? <span style={{ display: 'inline-block', width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--stratagent-gold)', borderTopColor: 'transparent', animation: 'dashSpin 0.8s linear infinite' }} />
                  : (s.value ?? 0)
                }
              </div>
              <div className="text-xs mt-0.5 uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
                {s.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Intelligence Pipeline ─────────────────────────────────────────── */}
      <div className="mb-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
            Intelligence Pipeline
          </div>
          <div className="flex-1 h-px" style={{ background: 'var(--stratagent-border)' }} />
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {PIPELINE.map(mod => {
            const statLabel = getStatLabel(mod.stat)
            return (
              <button
                key={mod.key}
                onClick={() => navigate(mod.path)}
                className="text-left p-5 rounded-xl transition-all group"
                style={{ background: 'var(--stratagent-panel)', border: `1px solid var(--stratagent-border)` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="text-xs font-black tracking-widest uppercase" style={{ color: mod.accent }}>
                    {mod.label}
                  </div>
                  {statLabel && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-bold"
                          style={{ background: mod.accent + '18', color: mod.accent }}>
                      {statLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium mb-2 text-white">{mod.tagline}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--stratagent-muted)' }}>
                  {mod.description}
                </p>
                <div className="mt-4 text-xs font-bold uppercase tracking-widest flex items-center gap-1"
                     style={{ color: mod.accent }}>
                  Open &#8594;
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Action Modules ───────────────────────────────────────────────── */}
      <div className="mb-2">
        <div className="flex items-center gap-3 mb-4">
          <div className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--stratagent-muted)' }}>
            Action Modules
          </div>
          <div className="flex-1 h-px" style={{ background: 'var(--stratagent-border)' }} />
        </div>
        <div className="grid grid-cols-4 gap-4 mb-10">
          {ACTIONS.map(mod => {
            const statLabel = getStatLabel(mod.stat)
            return (
              <button
                key={mod.key}
                onClick={() => navigate(mod.path)}
                className="text-left p-4 rounded-xl transition-all"
                style={{ background: 'var(--stratagent-panel)', border: `1px solid var(--stratagent-border)` }}>
                <div className="flex items-start justify-between mb-2">
                  <div className="text-xs font-black tracking-widest uppercase leading-tight" style={{ color: mod.accent }}>
                    {mod.label}
                  </div>
                  {statLabel && (
                    <span className="text-xs px-1.5 py-0.5 rounded font-bold ml-1 shrink-0"
                          style={{ background: mod.accent + '18', color: mod.accent }}>
                      {statLabel}
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium mb-1.5 text-white leading-snug">{mod.tagline}</p>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--stratagent-muted)' }}>
                  {mod.description}
                </p>
                <div className="mt-3 text-xs font-bold uppercase tracking-widest"
                     style={{ color: mod.accent }}>
                  Open &#8594;
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Carnegie principle ───────────────────────────────────────────── */}
      <div className="p-6 rounded-xl flex items-start gap-6"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <div className="text-4xl font-black shrink-0" style={{ color: 'var(--stratagent-gold)', opacity: 0.3, lineHeight: 1 }}>&ldquo;</div>
        <div>
          <p className="text-sm italic text-white leading-relaxed">
            You can make more friends in two months by becoming genuinely interested in other people
            than you can in two years by trying to get other people interested in you.
          </p>
          <p className="text-xs mt-2 font-bold uppercase tracking-widest" style={{ color: 'var(--stratagent-gold)' }}>
            Dale Carnegie &mdash; The founding principle of STRATAGENT
          </p>
        </div>
      </div>

    </div>
  )
}
