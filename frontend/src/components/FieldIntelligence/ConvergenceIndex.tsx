const PATH_LABELS: Record<string, { label: string; color: string; description: string }> = {
  CONVERGENCE_PROPOSAL: {
    label: 'PATH A — CONVERGENCE PROPOSAL',
    color: '#10b981',
    description: 'Full technical proposal ready. Genuine mutual value confirmed.',
  },
  MUTUAL_VALUE_BRIEF: {
    label: 'PATH B — MUTUAL VALUE BRIEF',
    color: '#3b82f6',
    description: 'Value proposition and qualifying conversation ready.',
  },
  FIRST_SIGNAL: {
    label: 'PATH C — FIRST SIGNAL',
    color: '#f59e0b',
    description: 'Insight email only. Open the door, don\'t walk through it yet.',
  },
  PARK: {
    label: 'INSUFFICIENT ALIGNMENT',
    color: '#ef4444',
    description: 'Park this opportunity and watch for the right moment.',
  },
}

export default function ConvergenceIndex({
  score,
  company,
  reasoning,
  recommendedPath,
}: {
  score: number
  company: string
  reasoning?: string
  recommendedPath?: string
}) {
  const path = PATH_LABELS[recommendedPath || 'PARK']
  const color = score >= 90 ? '#10b981' : score >= 75 ? '#3b82f6' : score >= 60 ? '#f59e0b' : '#ef4444'

  return (
    <div className="p-6 rounded-xl"
         style={{ background: 'var(--stratagent-panel)', border: `1px solid ${color}` }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-widest mb-1"
               style={{ color: 'var(--stratagent-muted)' }}>
            Convergence Index — {company}
          </div>
          <div className="text-4xl font-black" style={{ color }}>
            {score}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold mb-1" style={{ color: path.color }}>
            {path.label}
          </div>
          <div className="text-xs" style={{ color: 'var(--stratagent-muted)' }}>
            {path.description}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-2 rounded-full overflow-hidden mb-4"
           style={{ background: 'var(--stratagent-dark)' }}>
        <div className="h-full rounded-full transition-all duration-1000"
             style={{ width: `${score}%`, background: color }} />
      </div>

      {reasoning && (
        <p className="text-xs italic" style={{ color: 'var(--stratagent-muted)' }}>
          {reasoning}
        </p>
      )}
    </div>
  )
}
