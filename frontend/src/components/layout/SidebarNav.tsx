import { NavLink, useLocation } from 'react-router-dom'
import { navigation, type NavItem } from '../../config/navigation'
import { useAuth } from '../../context/AuthContext'
import { cn } from '../../lib/cn'

const itemBase =
  'flex min-h-11 items-center gap-3 rounded-control px-3 text-support font-medium transition-colors duration-150 lg:min-h-10'

function Item({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const Icon = item.icon
  const { pathname } = useLocation()

  if (item.status === 'planned') {
    // Not a link: the feature does not exist yet.
    return (
      <li>
        <span aria-disabled="true" className={cn(itemBase, 'cursor-not-allowed text-ink-faint')}>
          <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          <span className="shrink-0 rounded-full bg-canvas-deep px-2 py-0.5 text-meta font-medium text-ink-muted">Soon</span>
        </span>
      </li>
    )
  }

  // Question Bank (/questions) should stay active on /questions/new and /questions/:id/*
  // without colliding with AI Generator (/questions/generate).
  const isQuestionBankRoute =
    item.to === '/questions' &&
    (pathname === '/questions' ||
      (pathname.startsWith('/questions/') && !pathname.startsWith('/questions/generate')))

  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === '/' || item.to === '/questions'}
        onClick={onNavigate}
        className={({ isActive }) => {
          const active = isActive || isQuestionBankRoute
          return cn(
            itemBase,
            active
              ? 'bg-surface-raised text-ink shadow-card ring-1 ring-line'
              : 'text-ink-soft hover:bg-canvas-deep/70 hover:text-ink',
          )
        }}
      >
        {({ isActive }) => {
          const active = isActive || isQuestionBankRoute
          return (
            <>
              <Icon aria-hidden="true" className={cn('size-[1.125rem] shrink-0', active && 'text-accent')} />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </>
          )
        }}
      </NavLink>
    </li>
  )
}

/** Grouped primary navigation, driven by config/navigation.ts and filtered by user RBAC permissions. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { hasPermission } = useAuth()

  return (
    <nav aria-label="Primary" className="flex flex-col gap-6">
      {navigation.map((group) => {
        const visibleItems = group.items.filter(
          (item) => !item.requiredPermission || hasPermission(item.requiredPermission),
        )
        if (visibleItems.length === 0) return null

        return (
          <div key={group.id}>
            <h2 id={`nav-${group.id}`} className="mb-2 px-3 text-meta font-semibold uppercase tracking-wider text-ink-muted">
              {group.label}
            </h2>
            <ul aria-labelledby={`nav-${group.id}`} className="flex flex-col gap-0.5">
              {visibleItems.map((item) => (
                <Item key={item.id} item={item} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}
