import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

/** Table primitives for future list views. Wrapped for horizontal scroll on narrow screens. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto rounded-card border border-line bg-surface-raised/95">
      <table className={cn('w-full border-collapse text-left text-support', className)} {...props} />
    </div>
  )
}

export function Th({ className, scope = 'col', ...props }: ComponentProps<'th'>) {
  return (
    <th
      scope={scope}
      className={cn(
        'border-b border-line px-4 py-3 text-meta font-semibold uppercase tracking-wide text-ink-muted',
        className,
      )}
      {...props}
    />
  )
}

export function Td({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('border-b border-line px-4 py-3 text-ink last:border-b-0', className)} {...props} />
}
