import { useId, type ComponentProps, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

const controlBase =
  'block w-full rounded-control border bg-surface-raised px-3 text-body text-ink placeholder:text-ink-faint ' +
  'transition-colors duration-150 hover:border-ink-faint disabled:cursor-not-allowed disabled:bg-canvas-deep disabled:opacity-60 ' +
  'aria-[invalid=true]:border-danger'

const controlBorder = 'border-line-strong'

type FieldProps = {
  label: string
  helperText?: string
  error?: string
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode
}

/** Associates a label, helper text and error message with a control. */
function Field({ label, helperText, error, children }: FieldProps) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const describedBy = [helperText ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label font-medium text-ink-soft">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {helperText && (
        <p id={helpId} className="text-meta text-ink-muted">
          {helperText}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-meta font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

type CommonProps = { label: string; helperText?: string; error?: string }

export function TextInput({
  label,
  helperText,
  error,
  className,
  ...props
}: CommonProps & Omit<ComponentProps<'input'>, 'id'>) {
  return (
    <Field label={label} helperText={helperText} error={error}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(controlBase, controlBorder, 'min-h-11 sm:min-h-10', className)}
          {...props}
        />
      )}
    </Field>
  )
}

export function Select({
  label,
  helperText,
  error,
  className,
  children,
  ...props
}: CommonProps & Omit<ComponentProps<'select'>, 'id'>) {
  return (
    <Field label={label} helperText={helperText} error={error}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(controlBase, controlBorder, 'min-h-11 sm:min-h-10', className)}
          {...props}
        >
          {children}
        </select>
      )}
    </Field>
  )
}

export function TextArea({
  label,
  helperText,
  error,
  className,
  rows = 4,
  ...props
}: CommonProps & Omit<ComponentProps<'textarea'>, 'id'>) {
  return (
    <Field label={label} helperText={helperText} error={error}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={cn(controlBase, controlBorder, 'py-2', className)}
          {...props}
        />
      )}
    </Field>
  )
}
