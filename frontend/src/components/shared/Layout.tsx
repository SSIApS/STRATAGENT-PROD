import { NavLink } from 'react-router-dom'
import type { Session } from '../../App'

const NAV = [
  { to: '/dashboard', label: 'DASHBOARD' },
  { to: '/knowledge-base', label: 'KNOWLEDGE BASE' },
  { to: '/stratascout', label: 'STRATASCOUT' },
  { to: '/field-intelligence', label: 'FIELD INTELLIGENCE' },
  { to: '/active-watch', label: 'ACTIVE WATCH' },
  { to: '/stratalink', label: 'STRATALINK' },
  { to: '/strategist', label: 'STRATEGIST' },
  { to: '/product-analysis', label: 'PRODUCTS' },
]

export default function Layout({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session
  onSessionUpdate: (s: Session) => void
}) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--stratagent-dark)' }}>

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b"
              style={{ borderColor: 'var(--stratagent-border)', background: 'var(--stratagent-panel)' }}>
        <div className="flex items-center gap-8">
          <img
            src="/stratagent-logo-nav.png"
            alt="STRATAGENT"
            style={{ height: '28px', width: 'auto' }}
          />
          <nav className="flex gap-6">
            {NAV.map(n => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `text-xs tracking-widest uppercase transition-colors ${
                    isActive ? 'text-white' : 'hover:text-white'
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? 'var(--stratagent-gold)' : 'var(--stratagent-muted)',
                })}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Internal mode indicator */}
        <div className="text-xs uppercase tracking-widest"
             style={{ color: 'var(--stratagent-muted)' }}>
          Internal
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-xs border-t text-center"
              style={{ borderColor: 'var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
        Jason L. Smith &middot; Strategic Sales International ApS &middot; info@strategic.dk &middot; CVR: 41945621 &middot; Roskilde, Denmark
        &nbsp;&middot;&nbsp; STRATAGENT &mdash; The Intelligence Behind Agentic Sales.
      </footer>
    </div>
  )
}
