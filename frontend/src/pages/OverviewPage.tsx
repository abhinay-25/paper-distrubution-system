import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Building2,
  ClipboardCheck,
  FileText,
  FolderArchive,
  Inbox,
  Network,
  PenLine,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader, SectionHeader } from '../components/ui/Card';
import { EmptyState, ErrorMessage, Skeleton } from '../components/ui/Feedback';
import { useInstitution } from '../context/InstitutionContext';
import {
  fetchDashboardSummary,
  fetchExamPapers,
  fetchGenerationJobs,
  listSubmissions,
  type DashboardSummary,
} from '../lib/api';
import type { GenerationJob } from '../types/academic';
import type { ExamPaper, PaperStatus, PaperSubmission } from '../types/paper';

function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function paperStatusTone(status: PaperStatus): 'neutral' | 'accent' | 'success' | 'danger' | 'warning' {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'SUBMITTED':
      return 'accent';
    case 'REJECTED':
      return 'danger';
    default:
      return 'neutral';
  }
}

function generationStatusTone(status: string): 'neutral' | 'accent' | 'success' | 'danger' | 'warning' {
  switch (status) {
    case 'COMPLETED':
      return 'success';
    case 'RUNNING':
    case 'PENDING':
      return 'accent';
    case 'FAILED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function OverviewPage() {
  const { institutionId, institutionName, setInstitutionName } = useInstitution();

  // Summary metrics state
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Recent Papers state
  const [recentPapers, setRecentPapers] = useState<ExamPaper[]>([]);
  const [loadingPapers, setLoadingPapers] = useState<boolean>(true);
  const [papersError, setPapersError] = useState<string | null>(null);

  // Pending Approvals state
  const [pendingSubmissions, setPendingSubmissions] = useState<PaperSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState<boolean>(true);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);

  // Recent AI Generation Batches state
  const [recentBatches, setRecentBatches] = useState<GenerationJob[]>([]);
  const [loadingBatches, setLoadingBatches] = useState<boolean>(true);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const data = await fetchDashboardSummary();
      setSummary(data);
      setInstitutionName(data.institution?.name ?? null);
    } catch (err: unknown) {
      setSummaryError(
        err instanceof Error ? err.message : 'Unable to load institution summary metrics.',
      );
    } finally {
      setLoadingSummary(false);
    }
  }, [setInstitutionName]);

  const loadRecentPapers = useCallback(async () => {
    setLoadingPapers(true);
    setPapersError(null);
    try {
      const res = await fetchExamPapers({ page: 1, pageSize: 5 });
      setRecentPapers(res.data ?? []);
    } catch (err: unknown) {
      setPapersError(err instanceof Error ? err.message : 'Unable to load recent papers.');
    } finally {
      setLoadingPapers(false);
    }
  }, []);

  const loadPendingSubmissions = useCallback(async () => {
    setLoadingSubmissions(true);
    setSubmissionsError(null);
    try {
      const res = await listSubmissions({ status: 'PENDING', page: 1, pageSize: 5 });
      setPendingSubmissions(res.data ?? []);
    } catch (err: unknown) {
      setSubmissionsError(
        err instanceof Error ? err.message : 'Unable to load pending approval submissions.',
      );
    } finally {
      setLoadingSubmissions(false);
    }
  }, []);

  const loadRecentBatches = useCallback(async () => {
    setLoadingBatches(true);
    setBatchesError(null);
    try {
      const res = await fetchGenerationJobs({ page: 1, pageSize: 5 });
      setRecentBatches(res.data ?? []);
    } catch (err: unknown) {
      setBatchesError(err instanceof Error ? err.message : 'Unable to load recent AI batches.');
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    void Promise.allSettled([
      loadSummary(),
      loadRecentPapers(),
      loadPendingSubmissions(),
      loadRecentBatches(),
    ]);
  }, [loadSummary, loadRecentPapers, loadPendingSubmissions, loadRecentBatches]);

  useEffect(() => {
    refreshAll();
  }, [institutionId, refreshAll]);

  useEffect(() => {
    const handleRoleChange = () => refreshAll();
    window.addEventListener('pds-role-change', handleRoleChange);
    return () => window.removeEventListener('pds-role-change', handleRoleChange);
  }, [refreshAll]);

  const activeInstitutionName = summary?.institution?.name ?? institutionName;
  const isRefreshing =
    loadingSummary || loadingPapers || loadingSubmissions || loadingBatches;

  const isEmptyInstitution =
    summary !== null &&
    summary.subjects.total === 0 &&
    summary.questions.total === 0 &&
    summary.generationJobs.total === 0 &&
    summary.examinations.total === 0 &&
    summary.papers.total === 0 &&
    summary.submissions.total === 0;

  return (
    <div className="space-y-8">
      {/* A. Welcome and Page Header */}
      <PageHeader
        eyebrow={activeInstitutionName || 'Institution Workspace'}
        title="Overview"
        badge={
          summary?.institution?.status === 'ACTIVE' ? (
            <Badge tone="success">Active Tenant</Badge>
          ) : undefined
        }
        description="Institution-scoped summary of academic subjects, question bank inventory, AI generation batches, examination configurations, paper preparation, and approval reviews."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={refreshAll}
              disabled={isRefreshing}
            >
              <RefreshCw
                aria-hidden="true"
                className={`size-4 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
            <Link to="/questions/generate">
              <Button type="button" variant="primary" size="sm">
                <Sparkles aria-hidden="true" className="size-4" />
                Generate with AI
              </Button>
            </Link>
          </>
        }
      />

      {/* Active Institution Context Banner (when institution record is available) */}
      {activeInstitutionName && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-raised/90 px-5 py-3.5 shadow-card">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
              <Building2 aria-hidden="true" className="size-4.5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-support font-semibold text-ink">
                {activeInstitutionName}
              </p>
              <p className="text-meta text-ink-muted">
                {summary?.institution?.slug ? `Slug: ${summary.institution.slug} · ` : ''}
                Tenant ID: <span className="font-mono">{institutionId}</span>
              </p>
            </div>
          </div>
          {summary && summary.submissions.pending > 0 && (
            <Link
              to="/approvals"
              className="inline-flex items-center gap-1.5 rounded-control bg-warning-soft px-3 py-1.5 text-meta font-semibold text-warning transition-colors hover:bg-warning/15"
            >
              <ClipboardCheck aria-hidden="true" className="size-3.5" />
              {formatNumber(summary.submissions.pending)}{' '}
              {summary.submissions.pending === 1 ? 'submission awaits' : 'submissions await'} review
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          )}
        </div>
      )}

      {/* B. Summary Metric Cards */}
      <section aria-labelledby="metrics-heading">
        <SectionHeader
          id="metrics-heading"
          title="Institutional summary"
          description="Live totals across all academic and examination workflows for this institution."
        />

        {summaryError ? (
          <ErrorMessage message={summaryError} retry={loadSummary} />
        ) : loadingSummary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <Card key={idx}>
                <CardBody className="space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3.5 w-48" />
                </CardBody>
              </Card>
            ))}
          </div>
        ) : isEmptyInstitution ? (
          <EmptyState
            icon={Inbox}
            title="No academic records for this institution yet"
            description="Start by adding subjects and syllabus topics, authoring questions or generating batches with AI, and configuring examinations."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <Link to="/subjects">
                  <Button type="button" variant="primary" size="sm">
                    <Plus aria-hidden="true" className="size-4" />
                    Add First Subject
                  </Button>
                </Link>
                <Link to="/questions/new">
                  <Button type="button" variant="secondary" size="sm">
                    Create Question
                  </Button>
                </Link>
              </div>
            }
          />
        ) : summary ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* 1. Active Subjects */}
            <Card className="flex flex-col justify-between">
              <CardBody className="flex flex-col justify-between gap-4 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-label font-medium text-ink-muted">Active Subjects</p>
                    <p className="mt-2 font-display text-display font-semibold tracking-tight text-ink">
                      {formatNumber(summary.subjects.active)}
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-canvas-deep text-ink-soft">
                    <Network aria-hidden="true" className="size-5" />
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3 text-meta text-ink-muted">
                  <span>
                    {formatNumber(summary.subjects.total)} total
                    {summary.subjects.archived > 0
                      ? ` · ${formatNumber(summary.subjects.archived)} archived`
                      : ''}
                  </span>
                  <Link
                    to="/subjects"
                    className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
                  >
                    Manage
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </CardBody>
            </Card>

            {/* 2. Active Questions in Question Bank */}
            <Card className="flex flex-col justify-between">
              <CardBody className="flex flex-col justify-between gap-4 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-label font-medium text-ink-muted">Active Questions</p>
                    <p className="mt-2 font-display text-display font-semibold tracking-tight text-ink">
                      {formatNumber(summary.questions.active)}
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-canvas-deep text-ink-soft">
                    <BookOpen aria-hidden="true" className="size-5" />
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3 text-meta text-ink-muted">
                  <span>
                    {formatNumber(summary.questions.draft)} draft ·{' '}
                    {formatNumber(summary.questions.retired)} retired (
                    {formatNumber(summary.questions.total)} total)
                  </span>
                  <Link
                    to="/questions"
                    className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
                  >
                    Question Bank
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </CardBody>
            </Card>

            {/* 3. AI-Generation Batches */}
            <Card className="flex flex-col justify-between">
              <CardBody className="flex flex-col justify-between gap-4 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-label font-medium text-ink-muted">AI Generation Batches</p>
                      {summary.generationJobs.pendingCandidateReviews > 0 && (
                        <Badge tone="accent">
                          {formatNumber(summary.generationJobs.pendingCandidateReviews)} to review
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 font-display text-display font-semibold tracking-tight text-ink">
                      {formatNumber(summary.generationJobs.total)}
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent">
                    <Sparkles aria-hidden="true" className="size-5" />
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3 text-meta text-ink-muted">
                  <span>
                    {formatNumber(summary.generationJobs.completed)} completed
                    {summary.generationJobs.failed > 0
                      ? ` · ${formatNumber(summary.generationJobs.failed)} failed`
                      : ''}
                    {summary.generationJobs.running > 0
                      ? ` · ${formatNumber(summary.generationJobs.running)} running`
                      : ''}
                  </span>
                  <Link
                    to="/questions/generate"
                    className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
                  >
                    AI Generator
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </CardBody>
            </Card>

            {/* 4. Examinations Configured */}
            <Card className="flex flex-col justify-between">
              <CardBody className="flex flex-col justify-between gap-4 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-label font-medium text-ink-muted">Examinations Configured</p>
                    <p className="mt-2 font-display text-display font-semibold tracking-tight text-ink">
                      {formatNumber(summary.examinations.active)}
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-canvas-deep text-ink-soft">
                    <FileText aria-hidden="true" className="size-5" />
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3 text-meta text-ink-muted">
                  <span>
                    {formatNumber(summary.examinations.total)} total
                    {summary.examinations.inactive > 0
                      ? ` · ${formatNumber(summary.examinations.inactive)} inactive`
                      : ''}
                  </span>
                  <Link
                    to="/examinations"
                    className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
                  >
                    Examinations
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </CardBody>
            </Card>

            {/* 5. Papers by Workflow Status */}
            <Card className="flex flex-col justify-between">
              <CardBody className="flex flex-col justify-between gap-4 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-label font-medium text-ink-muted">Examination Papers</p>
                    <p className="mt-2 font-display text-display font-semibold tracking-tight text-ink">
                      {formatNumber(summary.papers.total)}
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-canvas-deep text-ink-soft">
                    <PenLine aria-hidden="true" className="size-5" />
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3 text-meta text-ink-muted">
                  <span>
                    {formatNumber(summary.papers.draft)} draft ·{' '}
                    {formatNumber(summary.papers.submitted)} submitted ·{' '}
                    {formatNumber(summary.papers.approved)} approved
                    {summary.papers.rejected > 0
                      ? ` · ${formatNumber(summary.papers.rejected)} rejected`
                      : ''}
                  </span>
                  <Link
                    to="/papers"
                    className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
                  >
                    Papers
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </CardBody>
            </Card>

            {/* 6. Pending Approvals / Submissions Awaiting Review */}
            <Card className="flex flex-col justify-between">
              <CardBody className="flex flex-col justify-between gap-4 h-full">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-label font-medium text-ink-muted">Pending Approvals</p>
                      {summary.submissions.pending > 0 && (
                        <Badge tone="warning">Needs Review</Badge>
                      )}
                    </div>
                    <p className="mt-2 font-display text-display font-semibold tracking-tight text-ink">
                      {formatNumber(summary.submissions.pending)}
                    </p>
                  </div>
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-canvas-deep text-ink-soft">
                    <ClipboardCheck aria-hidden="true" className="size-5" />
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-line pt-3 text-meta text-ink-muted">
                  <span>
                    {formatNumber(summary.submissions.approved)} approved ·{' '}
                    {formatNumber(
                      summary.submissions.changesRequested + summary.submissions.rejected,
                    )}{' '}
                    returned ({formatNumber(summary.submissions.total)} total)
                  </span>
                  <Link
                    to="/approvals"
                    className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
                  >
                    Approval Queue
                    <ArrowRight aria-hidden="true" className="size-3.5" />
                  </Link>
                </div>
              </CardBody>
            </Card>

            {/* 7. Source Documents & RAG Knowledge Base */}
            {summary.sourceDocuments && (
              <Card className="flex flex-col justify-between">
                <CardBody className="flex flex-col justify-between gap-4 h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-label font-medium text-ink-muted">Source Documents (RAG)</p>
                        {summary.sourceDocuments.processing > 0 && (
                          <Badge tone="accent">Processing</Badge>
                        )}
                      </div>
                      <p className="mt-2 font-display text-display font-semibold tracking-tight text-ink">
                        {formatNumber(summary.sourceDocuments.indexed)}
                      </p>
                    </div>
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-canvas-deep text-ink-soft">
                      <FolderArchive aria-hidden="true" className="size-5" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line pt-3 text-meta text-ink-muted">
                    <span>
                      {formatNumber(summary.sourceDocuments.totalChunks)} chunks indexed
                      {summary.sourceDocuments.failed > 0
                        ? ` · ${formatNumber(summary.sourceDocuments.failed)} failed`
                        : ''}
                    </span>
                    <Link
                      to="/source-documents"
                      className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-hover"
                    >
                      Knowledge Base
                      <ArrowRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        ) : null}
      </section>

      {/* C. Quick Actions (Primary Featured Actions + Secondary Shortcuts) */}
      <section aria-labelledby="quick-actions-heading">
        <SectionHeader
          id="quick-actions-heading"
          title="Quick actions"
          description="Jump directly into question authoring, AI generation, paper assembly, or approval review."
        />

        <div className="grid gap-4 lg:grid-cols-12">
          {/* Primary Featured Workflows (Left 7 cols) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            <Link
              to="/questions/generate"
              className="group flex flex-col justify-between rounded-card border border-line bg-surface-raised p-5 shadow-card transition-all hover:border-accent/40 hover:shadow-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-control bg-accent-soft text-accent">
                    <Sparkles aria-hidden="true" className="size-5" />
                  </span>
                  <Badge tone="accent">AI Assisted</Badge>
                </div>
                <h3 className="text-title font-semibold text-ink group-hover:text-accent">
                  Generate Questions with AI
                </h3>
                <p className="text-support text-ink-muted">
                  Generate structured MCQ, short-answer, long-answer, or numerical question batches
                  aligned to syllabus topics, then review and promote candidates into the bank.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-support font-semibold text-accent">
                Open AI Generator
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>

            <Link
              to="/papers"
              className="group flex flex-col justify-between rounded-card border border-line bg-surface-raised p-5 shadow-card transition-all hover:border-accent/40 hover:shadow-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-control bg-canvas-deep text-ink-soft group-hover:bg-accent-soft group-hover:text-accent">
                    <PenLine aria-hidden="true" className="size-5" />
                  </span>
                  <Badge tone="neutral">Paper Builder</Badge>
                </div>
                <h3 className="text-title font-semibold text-ink group-hover:text-accent">
                  Prepare or Continue a Paper
                </h3>
                <p className="text-support text-ink-muted">
                  Assemble examination sections from immutable question revisions, validate marks
                  and constraints, save version snapshots, and submit for independent approval.
                </p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1.5 text-support font-semibold text-accent">
                Go to Paper Preparation
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          </div>

          {/* Secondary Compact Shortcuts (Right 5 cols) */}
          <Card className="lg:col-span-5">
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                <li>
                  <Link
                    to="/approvals"
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-canvas-deep/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ClipboardCheck
                        aria-hidden="true"
                        className="size-4.5 shrink-0 text-ink-muted"
                      />
                      <div className="min-w-0">
                        <p className="text-support font-medium text-ink">
                          Review Pending Approvals
                        </p>
                        <p className="truncate text-meta text-ink-muted">
                          Inspect submitted paper snapshots and generate official PDFs
                        </p>
                      </div>
                    </div>
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
                <li>
                  <Link
                    to="/questions"
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-canvas-deep/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <BookOpen aria-hidden="true" className="size-4.5 shrink-0 text-ink-muted" />
                      <div className="min-w-0">
                        <p className="text-support font-medium text-ink">Browse Question Bank</p>
                        <p className="truncate text-meta text-ink-muted">
                          Filter questions, inspect revisions, or run AI duplicate checks
                        </p>
                      </div>
                    </div>
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
                <li>
                  <Link
                    to="/examinations"
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-canvas-deep/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText aria-hidden="true" className="size-4.5 shrink-0 text-ink-muted" />
                      <div className="min-w-0">
                        <p className="text-support font-medium text-ink">Configure Examinations</p>
                        <p className="truncate text-meta text-ink-muted">
                          Define total marks, passing marks, duration, and instructions
                        </p>
                      </div>
                    </div>
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
                <li>
                  <Link
                    to="/subjects"
                    className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-canvas-deep/50"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Network aria-hidden="true" className="size-4.5 shrink-0 text-ink-muted" />
                      <div className="min-w-0">
                        <p className="text-support font-medium text-ink">
                          Manage Subjects & Syllabus Topics
                        </p>
                        <p className="truncate text-meta text-ink-muted">
                          Maintain course codes and ordered course outcomes
                        </p>
                      </div>
                    </div>
                    <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                  </Link>
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* D. Recent Activity & Work */}
      <section aria-labelledby="recent-work-heading" className="space-y-4">
        <SectionHeader
          id="recent-work-heading"
          title="Recent examination activity"
          description="Latest examination papers, pending approval submissions, and AI question-generation batches."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 1. Recent Examination Papers */}
          <Card className="flex flex-col">
            <CardHeader className="flex items-center justify-between border-b border-line">
              <div>
                <h3 className="text-title font-semibold text-ink">Recent Examination Papers</h3>
                <p className="text-meta text-ink-muted">
                  Most recently updated drafts and submitted papers
                </p>
              </div>
              <Link
                to="/papers"
                className="inline-flex items-center gap-1 text-meta font-semibold text-accent hover:text-accent-hover"
              >
                View all
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </CardHeader>
            <CardBody className="flex-1 p-0">
              {papersError ? (
                <div className="p-5">
                  <ErrorMessage message={papersError} retry={loadRecentPapers} />
                </div>
              ) : loadingPapers ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-12 w-full" />
                  ))}
                </div>
              ) : recentPapers.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-support font-medium text-ink">No examination papers yet</p>
                  <p className="mt-1 text-meta text-ink-muted">
                    Create a paper from an examination configuration to start assembling sections.
                  </p>
                  <div className="mt-4">
                    <Link to="/papers">
                      <Button type="button" variant="secondary" size="sm">
                        Prepare Paper
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {recentPapers.map((paper) => (
                    <li key={paper.id}>
                      <Link
                        to={`/papers/${paper.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-canvas-deep/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-support font-medium text-ink">
                            {paper.title}
                          </p>
                          <p className="truncate text-meta text-ink-muted">
                            {paper.config?.subject
                              ? `${paper.config.subject.code} — ${paper.config.subject.name}`
                              : paper.config?.name ?? 'Examination Paper'}{' '}
                            · v{paper.version} · Updated {formatShortDate(paper.updatedAt)}
                          </p>
                        </div>
                        <Badge tone={paperStatusTone(paper.status)}>{paper.status}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* 2. Pending Approval Queue */}
          <Card className="flex flex-col">
            <CardHeader className="flex items-center justify-between border-b border-line">
              <div>
                <h3 className="text-title font-semibold text-ink">Submissions Awaiting Review</h3>
                <p className="text-meta text-ink-muted">
                  Immutable paper snapshots pending independent moderator decision
                </p>
              </div>
              <Link
                to="/approvals"
                className="inline-flex items-center gap-1 text-meta font-semibold text-accent hover:text-accent-hover"
              >
                Approval queue
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </Link>
            </CardHeader>
            <CardBody className="flex-1 p-0">
              {submissionsError ? (
                <div className="p-5">
                  <ErrorMessage message={submissionsError} retry={loadPendingSubmissions} />
                </div>
              ) : loadingSubmissions ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-12 w-full" />
                  ))}
                </div>
              ) : pendingSubmissions.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-support font-medium text-ink">
                    No submissions awaiting approval
                  </p>
                  <p className="mt-1 text-meta text-ink-muted">
                    All submitted question paper snapshots have been reviewed.
                  </p>
                  <div className="mt-4">
                    <Link to="/approvals">
                      <Button type="button" variant="secondary" size="sm">
                        View Approval History
                      </Button>
                    </Link>
                  </div>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {pendingSubmissions.map((sub) => (
                    <li key={sub.id}>
                      <Link
                        to={`/approvals/${sub.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-canvas-deep/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-support font-medium text-ink">
                            {sub.paper?.title ?? 'Submitted Paper'}
                          </p>
                          <p className="truncate text-meta text-ink-muted">
                            {sub.paper?.config?.subject
                              ? `${sub.paper.config.subject.code} — ${sub.paper.config.subject.name}`
                              : sub.paper?.config?.name ?? 'Submission'}{' '}
                            {sub.version ? `· Snapshot v${sub.version.versionNumber}` : ''} ·
                            Submitted {formatShortDate(sub.submittedAt)}
                          </p>
                        </div>
                        <Badge tone="warning">PENDING</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        {/* 3. Recent AI Generation Batches */}
        <Card>
          <CardHeader className="flex items-center justify-between border-b border-line">
            <div>
              <h3 className="text-title font-semibold text-ink">Recent AI Generation Batches</h3>
              <p className="text-meta text-ink-muted">
                Latest AI question-generation jobs and candidate batch counts
              </p>
            </div>
            <Link
              to="/questions/generate"
              className="inline-flex items-center gap-1 text-meta font-semibold text-accent hover:text-accent-hover"
            >
              Open AI Generator
              <ArrowRight aria-hidden="true" className="size-3.5" />
            </Link>
          </CardHeader>
          <CardBody className="p-0">
            {batchesError ? (
              <div className="p-5">
                <ErrorMessage message={batchesError} retry={loadRecentBatches} />
              </div>
            ) : loadingBatches ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-12 w-full" />
                ))}
              </div>
            ) : recentBatches.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <p className="text-support font-medium text-ink">
                  No AI generation batches run yet
                </p>
                <p className="mt-1 text-meta text-ink-muted">
                  Generate candidate questions for any active subject and review them before bank
                  promotion.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {recentBatches.map((job) => (
                  <li key={job.id}>
                    <Link
                      to="/questions/generate"
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-canvas-deep/50"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-support font-medium text-ink">
                          {job.subject
                            ? `${job.subject.code} — ${job.subject.name}`
                            : 'Subject Batch'}
                          {job.topic ? ` (${job.topic.name})` : ''}
                        </p>
                        <p className="truncate text-meta text-ink-muted">
                          {job.questionType.replace(/_/g, ' ')}
                          {job.difficulty ? ` · ${job.difficulty}` : ''} ·{' '}
                          {formatNumber(job._count?.generatedQuestions ?? job.count)} questions ·{' '}
                          {formatShortDate(job.createdAt)}
                        </p>
                      </div>
                      <Badge tone={generationStatusTone(job.status)}>{job.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
    </div>
  );
}
