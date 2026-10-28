import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      className={cn('rounded-card border border-line bg-surface-raised/95 shadow-card', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: ComponentProps<'header'>) {
  return <header className={cn('px-5 py-4 sm:px-6', className)} {...props} />
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('p-5 sm:p-6', className)} {...props} />
}

type PageHeaderProps = {
  breadcrumb?: ReactNode
  eyebrow?: string
  title: string
  badge?: ReactNode
  description?: string
  actions?: ReactNode
  className?: string
}

/** The single h1 of a page. */
export function PageHeader({
  breadcrumb,
  eyebrow,
  title,
  badge,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'mb-6 flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {breadcrumb && <div className="mb-1.5">{breadcrumb}</div>}
        {eyebrow && (
          <p className="text-eyebrow font-semibold uppercase tracking-wider text-ink-muted">
            {eyebrow}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-page-title font-semibold tracking-tight text-ink">{title}</h1>
          {badge}
        </div>
        {description && <p className="max-w-2xl text-body text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

type SectionHeaderProps = {
  title: string
  description?: string
  actions?: ReactNode
  id?: string
}

export function SectionHeader({ title, description, actions, id }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 id={id} className="text-section font-semibold text-ink">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-support text-ink-muted">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
