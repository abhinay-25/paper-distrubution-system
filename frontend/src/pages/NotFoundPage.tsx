import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui/Feedback'
import { PageHeader } from '../components/ui/Card'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="The page you requested does not exist or is not available yet." />
      <EmptyState
        icon={Compass}
        title="Nothing here"
        description="Check the address, or return to the overview."
        action={
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-accent px-4 text-support font-medium text-white transition-colors hover:bg-accent-hover sm:min-h-10"
          >
            Back to overview
          </Link>
        }
      />
    </>
  )
}
