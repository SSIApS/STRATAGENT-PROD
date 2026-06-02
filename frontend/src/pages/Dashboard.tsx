import { useNavigate } from 'react-router-dom'
import type { Session } from '../App'

const MODULES = [
  {
    key: 'kb',
    label: 'KNOWLEDGE BASE',
    description: 'Build supplier intelligence. Upload documents. Track Intelligence Depth.',
    path: '/knowledge-base',
    icon: '◈',
  },
  {
    key: 'fi',
    label: 'FIELD INTELLIGENCE',
    description: 'Research prospects. Score alignment. Generate Relationship Profiles.',
    path: '/field-intelligence',
    icon: '◎',
  },
  {
    key: 'aw',
    label: 'ACTIVE WATCH',
    description: 'Park opportunities. Set triggers. Surface them when the moment is right.',
    path: '/active-watch',
    icon: '◉',
  },
  {
    key: 'oe',
    label: 'OUTPUT ENGINE',
    description: 'Generate graduated documents. Proposals, briefs, and first signals.',
    path: '/output/select',
    icon: '◆',
  },
]

export default function Dashboard({ session }: { session: Session }) {
  const navigate = useNavigate()

  return (
    <div className="max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-black tracking-tight mb-2"
            style={{ color: 'var(--stratagent-text)' }}>
          Intelligence Platform
        </h1>
        <p style={{ color: 'var(--stratagent-muted)' }} className="text-sm">
          Build supplier intelligence. Research prospects. Generate documents worth sending.
        </p>
      </div>

      {/* Module grid */}
      <div className="grid grid-cols-2 gap-4">
        {MODULES.map(mod => (
          <button
            key={mod.key}
            onClick={() => navigate(mod.path)}
            className="text-left p-6 rounded-xl transition-all hover:scale-[1.01]"
            style={{
              background: 'var(--stratagent-panel)',
              border: '1px solid var(--stratagent-border)',
            }}>
            <div className="flex items-start gap-4">
              <span className="text-2xl mt-1" style={{ color: 'var(--stratagent-gold)' }}>
                {mod.icon}
              </span>
              <div>
                <div className="text-xs tracking-widest uppercase font-bold mb-2"
                     style={{ color: 'var(--stratagent-gold)' }}>
                  {mod.label}
                </div>
                <div className="text-sm" style={{ color: 'var(--stratagent-muted)' }}>
                  {mod.description}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Founding principle */}
      <div className="mt-10 p-6 rounded-xl text-center"
           style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
        <p className="text-sm italic" style={{ color: 'var(--stratagent-muted)' }}>
          "You can make more friends in two months by becoming genuinely interested in other people
          than you can in two years by trying to get other people interested in you."
        </p>
        <p className="text-xs mt-2" style={{ color: 'var(--stratagent-gold-dim)' }}>
          Dale Carnegie · The founding principle of STRATAGENT
        </p>
      </div>
    </div>
  )
}
