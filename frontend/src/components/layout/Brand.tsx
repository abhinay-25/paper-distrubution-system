import { FileStack } from 'lucide-react'
import { APP_NAME, APP_TAGLINE } from '../../config/app'

/** Typographic wordmark with a simple icon. Identity text comes from config/app.ts. */
export function Brand() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-ink text-surface">
        <FileStack aria-hidden="true" className="size-[1.125rem]" />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-body font-semibold tracking-tight text-ink">{APP_NAME}</p>
        <p className="hidden truncate text-meta text-ink-muted sm:block">{APP_TAGLINE}</p>
      </div>
    </div>
  )
}
