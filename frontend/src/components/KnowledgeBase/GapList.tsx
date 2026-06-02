export default function GapList({ gaps }: { gaps: any[] }) {
  if (!gaps.length) return null

  return (
    <div className="p-6 rounded-xl mb-4"
         style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>
      <div className="text-xs uppercase tracking-widest mb-4"
           style={{ color: 'var(--stratagent-muted)' }}>
        Intelligence Gaps — Upload these to unlock more capability
      </div>
      <div className="space-y-3">
        {gaps.map((gap, i) => (
          <div key={i} className="flex items-start justify-between gap-4 py-2 border-b"
               style={{ borderColor: 'var(--stratagent-border)' }}>
            <div>
              <div className="text-sm font-medium" style={{ color: 'var(--stratagent-text)' }}>
                {gap.element}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--stratagent-muted)' }}>
                {gap.impact}
              </div>
            </div>
            <div className="text-xs shrink-0 px-2 py-1 rounded"
                 style={{ background: 'var(--stratagent-dark)', color: 'var(--stratagent-gold)' }}>
              +{Math.round(gap.target - gap.current)} pts
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
