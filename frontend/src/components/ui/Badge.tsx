import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  neutral: 'bg-canvas-deep text-ink-soft',
  accent: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export type BadgeProps = ComponentProps<'span'> & { tone?: Tone }

/**
 * Status label. Always carries visible text, so meaning is never conveyed by color alone.
 */
export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-meta font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  )
}
