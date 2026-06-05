interface Gap {
  element: string
  impact: string
  current: number
  target: number
}

interface Props {
  gaps: Gap[]
  onGapClick?: (element: string) => void
}

export default function GapList({ gaps, onGapClick }: Props) {
  if (!gaps.length) return null

  return (
    <div className="p-6 rounded-xl mb-4"
         style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
      <div className="text-xs uppercase tracking-widest mb-1"
           style={{ color: 'var(--stratagent-muted)' }}>
        Intelligence Gaps
      </div>
      <p className="text-xs mb-4" style={{ color: 'var(--stratagent-muted)' }}>
        Click a gap to jump to the source upload field with context pre-filled.
      </p>
      <div className="space-y-1">
        {gaps.map((gap, i) => (
          <button
            key={i}
            onClick={() => onGapClick?.(gap.element)}
            className="w-full text-left flex items-start justify-between gap-4 py-3 px-3 rounded-lg"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--stratagent-dark)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium" style={{ color: 'var(--stratagent-text)' }}>
                {gap.element}
                <span className="ml-2 text-xs" style={{ color: 'var(--stratagent-gold)', opacity: 0.6 }}>
                  + add source
                </span>
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                {gap.impact}
              </div>
            </div>
            <div className="text-xs shrink-0 px-2 py-1 rounded"
                 style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-gold)' }}>
              +{Math.round(gap.target - gap.current)} pts
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
