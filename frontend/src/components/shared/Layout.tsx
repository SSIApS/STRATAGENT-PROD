import { NavLink } from 'react-router-dom'
import type { Session } from '../../App'

const NAV = [
  { to: '/dashboard', label: 'DASHBOARD' },
  { to: '/knowledge-base', label: 'KNOWLEDGE BASE' },
  { to: '/field-intelligence', label: 'FIELD INTELLIGENCE' },
  { to: '/active-watch', label: 'ACTIVE WATCH' },
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
          <span className="text-lg font-black tracking-tighter"
                style={{ color: 'var(--stratagent-gold)' }}>
            STRATAGENT
          </span>
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

        {/* Actions remaining */}
        <div className="flex items-center gap-2 text-xs"
             style={{ color: 'var(--stratagent-muted)' }}>
          <span>ACTIONS REMAINING</span>
          <span className="font-bold text-sm"
                style={{ color: session.actionsRemaining <= 1 ? 'var(--stratagent-red)' : 'var(--stratagent-gold)' }}>
            {session.actionsRemaining}
          </span>
          <span>/ 5</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 text-xs border-t text-center"
              style={{ borderColor: 'var(--stratagent-border)', color: 'var(--stratagent-muted)' }}>
        Jason L. Smith · Strategic Sales International ApS · info@strategic.dk · CVR: 41945621 · Roskilde, Denmark
        &nbsp;·&nbsp; STRATAGENT — The Intelligence Behind Agentic Sales.
      </footer>
    </div>
  )
}
