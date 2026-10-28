import { type Ref } from 'react'
import { useNavigate } from 'react-router-dom'
import { Menu, Building2, LogOut, UserCheck } from 'lucide-react'
import { Badge } from '../ui/Badge'
import { Brand } from './Brand'
import { useAuth } from '../../context/AuthContext'
import { ROLE_DISPLAY_LABELS } from '../../types/auth'

type HeaderProps = {
  onOpenMenu: () => void
  menuButtonRef: Ref<HTMLButtonElement>
  menuOpen: boolean
}

export function Header({ onOpenMenu, menuButtonRef, menuOpen }: HeaderProps) {
  const { user, activeMembership, memberships, switchInstitution, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const roleLabel = activeMembership
    ? ROLE_DISPLAY_LABELS[activeMembership.role] || activeMembership.role
    : 'Member'

  return (
    <header className="glass border-b border-line">
      <div className="mx-auto flex h-16 max-w-380 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onOpenMenu}
          aria-label="Open navigation menu"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          className="-ml-2 flex size-11 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-canvas-deep lg:hidden"
        >
          <Menu aria-hidden="true" className="size-5" />
        </button>

        <Brand />

        <div className="ml-auto flex items-center gap-2.5 sm:gap-3">
          {/* Verified Institution Membership Indicator / Switcher */}
          {activeMembership && (
            <div className="flex items-center gap-2 rounded-control border border-line bg-surface-raised/80 px-2.5 py-1 text-meta text-ink-soft">
              <Building2 className="size-3.5 shrink-0 text-accent" />
              <span className="hidden md:inline font-medium shrink-0">Institution:</span>
              {memberships.length > 1 ? (
                <select
                  aria-label="Switch active institution membership"
                  value={activeMembership.institutionId}
                  onChange={(e) => void switchInstitution(e.target.value)}
                  className="bg-transparent font-medium text-ink focus:outline-none"
                >
                  {memberships.map((m) => (
                    <option key={m.institutionId} value={m.institutionId}>
                      {m.institution.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="max-w-48 truncate font-medium text-ink">
                  {activeMembership.institution.name}
                </span>
              )}
            </div>
          )}

          {/* Signed-in User Identity & Role Badge */}
          {user && activeMembership ? (
            <div className="flex items-center gap-2.5">
              <div className="hidden items-center gap-2 rounded-control border border-line bg-canvas px-2.5 py-1 sm:flex">
                <UserCheck className="size-3.5 shrink-0 text-success" />
                <div className="flex flex-col text-left leading-tight">
                  <span className="text-xs font-semibold text-ink">
                    {user.displayName}
                  </span>
                  <span className="font-mono text-[10px] text-ink-muted">
                    {user.email}
                  </span>
                </div>
              </div>

              <Badge tone="accent">{roleLabel}</Badge>

              <button
                type="button"
                onClick={() => void handleLogout()}
                title="Sign out of session"
                className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line bg-surface-raised px-2.5 py-1 text-meta font-medium text-ink-soft transition-colors hover:border-danger/40 hover:bg-danger-tint hover:text-danger"
              >
                <LogOut className="size-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <Badge tone="neutral">Not signed in</Badge>
          )}
        </div>
      </div>
    </header>
  )
}
