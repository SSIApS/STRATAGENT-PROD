import React from 'react'

interface State {
  error: Error | null
  info: string
}

export default class GlobalErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null, info: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, info: '' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[STRATAGENT] Render crash:', error.message)
    console.error(info.componentStack)
    this.setState({ info: info.componentStack ?? '' })
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#0c0f1a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
          <div style={{ maxWidth: 560, width: '100%', background: '#1c0a0a', border: '1px solid #7f1d1d', borderRadius: 12, padding: '2rem' }}>
            <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              STRATAGENT -- Render Error
            </div>
            <div style={{ color: '#fca5a5', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {this.state.error.message}
            </div>
            <pre style={{ color: '#94a3b8', fontSize: '0.7rem', maxHeight: 160, overflow: 'auto', marginBottom: '1.5rem', whiteSpace: 'pre-wrap' }}>
              {this.state.info}
            </pre>
            <button
              onClick={() => { window.location.href = '/dashboard' }}
              style={{ background: '#7f1d1d', color: '#fca5a5', border: '1px solid #ef4444', borderRadius: 6, padding: '0.5rem 1.25rem', fontSize: '0.75rem', cursor: 'pointer' }}
            >
              Return to Dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
