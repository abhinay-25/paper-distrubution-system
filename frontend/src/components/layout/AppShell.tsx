import { X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { Brand } from './Brand'
import { DevBar } from './DevBar'
import { Header } from './Header'
import { SidebarNav } from './SidebarNav'

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Application frame: header, desktop sidebar, mobile drawer and the routed content region. */
export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [headerOffset, setHeaderOffset] = useState(64)
  const topStackRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const closeMenu = useCallback(() => {
    setMenuOpen(false)
    menuButtonRef.current?.focus()
  }, [])

  // Keep the desktop sidebar's sticky top offset and viewport height synchronized
  // with the combined height of DevBar (when visible/expanded) and Header.
  useEffect(() => {
    const el = topStackRef.current
    if (!el) return

    const updateHeight = () => {
      const next = el.getBoundingClientRect().height
      if (next > 0) setHeaderOffset(Math.round(next))
    }

    updateHeight()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight)
      observer.observe(el)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    // Drawer is mobile-only: close it if the viewport grows to desktop width.
    const onResize = () => {
      if (window.innerWidth >= 1024) setMenuOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', onResize)
    }
  }, [menuOpen, closeMenu])

  const shellStyle = {
    '--shell-header-offset': `${headerOffset}px`,
  } as CSSProperties

  return (
    <div className="min-h-screen" style={shellStyle}>
      <a
        href="#main-content"
        className="sr-only z-50 rounded-control bg-ink px-4 py-2 text-support text-surface focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>

      <div ref={topStackRef} className="sticky top-0 z-30">
        <DevBar />
        <Header onOpenMenu={() => setMenuOpen(true)} menuButtonRef={menuButtonRef} menuOpen={menuOpen} />
      </div>

      <div className="mx-auto flex max-w-380">
        <aside
          style={{
            top: 'var(--shell-header-offset, 4rem)',
            height: 'calc(100vh - var(--shell-header-offset, 4rem))',
          }}
          className="sticky hidden w-68 shrink-0 self-start overflow-y-auto border-r border-line/60 py-6 pl-5 pr-3 lg:block"
        >
          <SidebarNav />
        </aside>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile drawer. `invisible` removes it from tab order and the accessibility tree while closed. */}
      <div
        id="mobile-navigation"
        className={cn(
          'fixed inset-0 z-40 lg:hidden',
          menuOpen ? 'visible' : 'invisible transition-[visibility] delay-200',
        )}
      >
        <div
          onClick={closeMenu}
          aria-hidden="true"
          className={cn(
            'absolute inset-0 bg-ink/30 transition-opacity duration-200',
            menuOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className={cn(
            'glass absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col border-r border-line shadow-overlay',
            'transition-transform duration-200 ease-out',
            menuOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-16 items-center justify-between gap-2 border-b border-line px-4">
            <Brand />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeMenu}
              aria-label="Close navigation menu"
              className="flex size-11 shrink-0 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-canvas-deep"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-6">
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      </div>
    </div>
  )
}
