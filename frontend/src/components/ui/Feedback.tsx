import type { ComponentProps, ReactNode } from 'react'
import { AlertCircle, type LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center',
        className,
      )}
    >
      <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-canvas-deep text-ink-muted">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h3 className="text-section font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-md text-support text-ink-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/** Inline error message announced to assistive technology. */
export function ErrorMessage({
  children,
  message,
  retry,
  className,
}: {
  children?: ReactNode
  message?: string
  retry?: () => void
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start justify-between gap-2 rounded-control border border-danger/25 bg-danger-soft px-3 py-2.5 text-support text-danger',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>{message || children}</div>
      </div>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="underline font-medium hover:opacity-80 shrink-0 ml-2"
        >
          Retry
        </button>
      )}
    </div>
  )
}

/** Loading placeholder. Hidden from screen readers; use alongside a live status where needed. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-control bg-canvas-deep', className)}
      {...props}
    />
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-support text-ink-muted">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-line-strong border-t-accent"
      />
      {label}
    </span>
  )
}
