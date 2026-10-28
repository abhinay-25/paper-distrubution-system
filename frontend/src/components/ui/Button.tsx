import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'outline' | 'destructive'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'bg-canvas-deep text-ink hover:bg-line',
  outline: 'border border-line-strong bg-transparent text-ink hover:bg-canvas-deep',
  destructive: 'bg-danger text-white hover:bg-danger-hover',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-label',
  md: 'min-h-11 px-4 text-support sm:min-h-10',
}

export type ButtonProps = ComponentProps<'button'> & {
  variant?: Variant
  size?: Size
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
}
