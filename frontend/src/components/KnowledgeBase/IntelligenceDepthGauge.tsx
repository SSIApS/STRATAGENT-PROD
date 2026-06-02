const ELEMENTS = [
  { key: 'product_catalogue', label: 'Product Catalogue', weight: 20 },
  { key: 'technical_datasheets', label: 'Technical Datasheets', weight: 15 },
  { key: 'certifications', label: 'Certifications', weight: 10 },
  { key: 'case_studies', label: 'Case Studies', weight: 20 },
  { key: 'competitive_positioning', label: 'Competitive Positioning', weight: 10 },
  { key: 'pricing_framework', label: 'Pricing Framework', weight: 10 },
  { key: 'reference_projects', label: 'Reference Projects', weight: 10 },
  { key: 'objections_responses', label: 'Objections & Responses', weight: 5 },
]

function thresholdColor(total: number): string {
  if (total >= 90) return '#10b981'
  if (total >= 80) return '#3b82f6'
  if (total >= 50) return '#f59e0b'
  return '#ef4444'
}

export default function IntelligenceDepthGauge({
  scores,
  total,
  thresholdStatus,
}: {
  scores: Record<string, number>
  total: number
  thresholdStatus: any
}) {
  const color = thresholdColor(total)

  return (
    <div className="p-6 rounded-xl mb-4"
         style={{ background: 'var(--stratagent-panel)', border: '1px solid var(--stratagent-border)' }}>

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs uppercase tracking-widest"
              style={{ color: 'var(--stratagent-muted)' }}>
          Intelligence Depth
        </span>
        <span className="text-2xl font-black" style={{ color }}>
          {Math.round(total)}%
        </span>
      </div>

      {/* Master bar */}
      <div className="h-3 rounded-full mb-6 overflow-hidden"
           style={{ background: 'var(--stratagent-dark)' }}>
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${total}%`, background: color }}
        />
      </div>

      {/* Threshold markers */}
      <div className="flex justify-between text-xs mb-6"
           style={{ color: 'var(--stratagent-muted)' }}>
        <span>0</span>
        <span style={{ color: total >= 50 ? '#f59e0b' : undefined }}>50 · FIRST SIGNAL</span>
        <span style={{ color: total >= 80 ? '#3b82f6' : undefined }}>80 · PROPOSAL</span>
        <span style={{ color: total >= 90 ? '#10b981' : undefined }}>90 · SINGULARITY</span>
      </div>

      {/* Element breakdown */}
      <div className="space-y-2">
        {ELEMENTS.map(el => {
          const score = scores[el.key] || 0
          const pct = (score / el.weight) * 100
          return (
            <div key={el.key} className="flex items-center gap-3">
              <span className="text-xs w-40 shrink-0" style={{ color: 'var(--stratagent-muted)' }}>
                {el.label}
              </span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                   style={{ background: 'var(--stratagent-dark)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(pct, 100)}%`, background: color }}
                />
              </div>
              <span className="text-xs w-8 text-right" style={{ color: 'var(--stratagent-muted)' }}>
                {Math.round(score)}/{el.weight}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
