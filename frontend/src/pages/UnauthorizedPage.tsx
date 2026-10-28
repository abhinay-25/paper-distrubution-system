import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { useAuth } from '../context/AuthContext';
import { ROLE_DISPLAY_LABELS, type Permission } from '../types/auth';

interface UnauthorizedPageProps {
  requiredPermission?: Permission;
  title?: string;
}

export function UnauthorizedPage({
  requiredPermission,
  title = '403 — Access Denied',
}: UnauthorizedPageProps) {
  const { user, activeMembership } = useAuth();
  const roleLabel = activeMembership
    ? ROLE_DISPLAY_LABELS[activeMembership.role] || activeMembership.role
    : 'Unassigned';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-10">
      <Card className="border-danger/30 bg-surface-raised p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger-tint text-danger">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="danger">403 Forbidden</Badge>
              <Badge tone="neutral">Role: {roleLabel}</Badge>
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
              {title}
            </h1>
            <p className="text-body leading-relaxed text-ink-muted">
              Your current institutional role (
              <span className="font-semibold text-ink">{roleLabel}</span>) does
              not have permission to access this resource or perform this
              operation.
            </p>
          </div>

          <div className="w-full rounded-lg border border-line bg-canvas p-4 text-meta text-ink-soft">
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div>
                <span className="font-medium text-ink-muted">Signed in as: </span>
                <span className="font-semibold text-ink">
                  {user?.displayName} ({user?.email})
                </span>
              </div>
              <div>
                <span className="font-medium text-ink-muted">Institution: </span>
                <span className="font-semibold text-ink">
                  {activeMembership?.institution.name || 'Unknown'}
                </span>
              </div>
              {requiredPermission && (
                <div className="sm:col-span-2">
                  <span className="font-medium text-ink-muted">
                    Required permission:{' '}
                  </span>
                  <code className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-ink">
                    {requiredPermission}
                  </code>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Link
              to="/"
              className="inline-flex min-h-10 items-center gap-2 rounded-control bg-accent px-4 py-2 text-body font-medium text-white transition-colors hover:bg-accent-hover"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Return to Overview Dashboard
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
