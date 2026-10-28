import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Filter,
  FileText,
  User,
} from 'lucide-react';
import { Badge, type BadgeProps } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, PageHeader } from '../components/ui/Card';
import { EmptyState, ErrorMessage, Skeleton } from '../components/ui/Feedback';
import { listSubmissions, ApiError } from '../lib/api';
import type { PaperSubmission, PaperSubmissionStatus } from '../types/paper';

export function ApprovalQueuePage() {
  const [submissions, setSubmissions] = useState<PaperSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const query = statusFilter !== 'ALL' ? { status: statusFilter } : undefined;
      const res = await listSubmissions(query);
      setSubmissions(res.data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load approval queue');
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Quality Assurance & Governance"
        title="Paper Approval Queue"
        description="Independent review and authorization workflow for examination papers before official distribution."
      />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
        <Filter className="size-4 text-accent ml-1" />
        <span className="text-meta font-medium text-ink-muted mr-2">Status:</span>
        {(
          [
            { id: 'ALL', label: 'All Submissions' },
            { id: 'PENDING', label: 'Pending Review' },
            { id: 'APPROVED', label: 'Approved' },
            { id: 'REJECTED', label: 'Rejected' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setStatusFilter(tab.id)}
            className={`rounded-control px-3 py-1.5 text-meta font-medium transition-colors ${
              statusFilter === tab.id
                ? 'bg-ink text-surface shadow-xs'
                : 'text-ink-soft hover:bg-canvas-deep hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {error && <ErrorMessage message={error} retry={loadQueue} />}

      {/* Loading state */}
      {loading ? (
        <Card>
          <CardBody className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </CardBody>
        </Card>
      ) : submissions.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={ClipboardCheck}
              title="No submissions found"
              description={
                statusFilter === 'ALL'
                  ? 'No question papers have been submitted for independent approval yet.'
                  : `No submissions matching status "${statusFilter}".`
              }
            />
          </CardBody>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {submissions.map((sub) => {
              const statusBadge = getStatusBadge(sub.status);
              const submittedDate = new Date(sub.submittedAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={sub.id}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between hover:bg-canvas-deep/40 transition-colors"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusBadge.tone}>
                        {statusBadge.icon}
                        {statusBadge.label}
                      </Badge>
                      <Badge tone="neutral" className="font-mono">
                        v{sub.version?.versionNumber ?? 1}
                      </Badge>
                      {sub.paper?.config?.subject && (
                        <Badge tone="accent" className="font-mono">
                          {sub.paper.config.subject.code}
                        </Badge>
                      )}
                    </div>

                    <h2 className="text-section font-semibold text-ink truncate">
                      {sub.paper?.title || 'Question Paper'}
                    </h2>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-meta text-ink-muted">
                      {sub.paper?.config?.name && (
                        <span className="flex items-center gap-1 truncate">
                          <FileText className="size-3.5" />
                          {sub.paper.config.name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="size-3.5" />
                        Submitted: {submittedDate}
                      </span>
                      <span className="flex items-center gap-1 font-mono">
                        <User className="size-3.5" />
                        By: {sub.submittedBy.substring(0, 8)}…
                      </span>
                    </div>

                    {sub.reviewComments && (
                      <div className="mt-2 rounded-control border border-danger/25 bg-danger-soft px-3 py-1.5 text-meta text-danger">
                        <span className="font-semibold">Reviewer feedback:</span> {sub.reviewComments}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    <Link to={`/approvals/${sub.id}`}>
                      <Button variant="primary" size="sm">
                        <span>Review</span>
                        <ArrowRight className="size-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

function getStatusBadge(status: PaperSubmissionStatus): {
  label: string;
  tone: NonNullable<BadgeProps['tone']>;
  icon: React.ReactNode;
} {
  switch (status) {
    case 'PENDING':
      return {
        label: 'Pending Review',
        tone: 'warning',
        icon: <Clock className="size-3.5" />,
      };
    case 'APPROVED':
      return {
        label: 'Approved',
        tone: 'success',
        icon: <CheckCircle2 className="size-3.5" />,
      };
    case 'REJECTED':
      return {
        label: 'Rejected',
        tone: 'danger',
        icon: <XCircle className="size-3.5" />,
      };
    case 'CHANGES_REQUESTED':
      return {
        label: 'Changes Requested',
        tone: 'warning',
        icon: <AlertCircle className="size-3.5" />,
      };
  }
}

