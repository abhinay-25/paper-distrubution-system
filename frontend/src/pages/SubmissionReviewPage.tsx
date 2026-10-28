import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldAlert,
  FileText,
  FileCheck,
  Check,
  X,
  Download,
  Sparkles,
  Clock,
} from 'lucide-react';
import { Badge, type BadgeProps } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, PageHeader } from '../components/ui/Card';
import { ErrorMessage, Skeleton } from '../components/ui/Feedback';
import { TextArea } from '../components/ui/FormControls';
import { Modal } from '../components/ui/Modal';
import {
  getSubmission,
  reviewSubmission,
  generatePaperPdf,
  downloadPaperPdf,
  ApiError,
} from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { PaperSubmission, QuestionSlotRevision } from '../types/paper';

export function SubmissionReviewPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const [submission, setSubmission] = useState<PaperSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'blueprint' | 'validation'>('blueprint');

  const [decisionModal, setDecisionModal] = useState<{
    open: boolean;
    decision: 'APPROVED' | 'REJECTED';
    comments: string;
    submitting: boolean;
    error: string | null;
  }>({
    open: false,
    decision: 'APPROVED',
    comments: '',
    submitting: false,
    error: null,
  });

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfReady, setPdfReady] = useState(false);

  const { user, hasPermission } = useAuth();
  const canDecide = hasPermission('submissions:decide');
  const canGeneratePdf = hasPermission('pdf:generate');
  const canDownloadPdf = hasPermission('pdf:download');
  const isSubmitter = Boolean(
    submission && user && submission.submittedBy === user.id,
  );

  const loadData = useCallback(async () => {
    if (!submissionId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await getSubmission(submissionId);
      setSubmission(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load submission details');
    } finally {
      setLoading(false);
    }
  }, [submissionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDecisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submissionId || !decisionModal.decision) return;

    if (decisionModal.decision === 'REJECTED' && !decisionModal.comments.trim()) {
      setDecisionModal((prev) => ({
        ...prev,
        error: 'A rejection reason is mandatory. Please describe what changes are required.',
      }));
      return;
    }

    try {
      setDecisionModal((prev) => ({ ...prev, submitting: true, error: null }));
      await reviewSubmission(submissionId, {
        decision: decisionModal.decision,
        comments: decisionModal.comments.trim() || undefined,
      });
      setDecisionModal((prev) => ({ ...prev, open: false, submitting: false }));
      await loadData();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to record approval decision';
      setDecisionModal((prev) => ({ ...prev, submitting: false, error: msg }));
    }
  };

  const handleGeneratePdf = async () => {
    if (!submission?.paperId) return;
    try {
      setGeneratingPdf(true);
      await generatePaperPdf(submission.paperId, false);
      setPdfReady(true);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to generate PDF');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!submission?.paperId) return;
    try {
      await downloadPaperPdf(submission.paperId);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to download PDF');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardBody className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-48 w-full" />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (error || !submission) {
    return (
      <div className="space-y-4">
        <Link
          to="/approvals"
          className="inline-flex items-center gap-1.5 text-support font-medium text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Back to Approval Queue
        </Link>
        <ErrorMessage message={error || 'Submission not found'} retry={loadData} />
      </div>
    );
  }

  const snapshot: Record<string, unknown> =
    (submission.version?.snapshotJson as unknown as Record<string, unknown>) || {};
  const config: Record<string, unknown> =
    (snapshot['config'] as Record<string, unknown>) ||
    (submission.paper?.config as unknown as Record<string, unknown>) ||
    {};
  const subjectInfo = config['subject'] as { name?: string; code?: string } | undefined;
  const sections = (snapshot['sections'] as Array<{
    id?: string;
    sectionLabel?: string;
    totalSlots?: number;
    requiredAnswers?: number | null;
    sectionMarks?: string | number;
    slots?: Array<{
      id?: string;
      allocatedMarks?: string | number;
      orWithNext?: boolean;
      revision?: QuestionSlotRevision;
    }>;
  }>) || [];
  const validation = submission.validationSnapshot;
  let globalQNumber = 0;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link
            to="/approvals"
            className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Approval Queue</span>
          </Link>
        }
        eyebrow={`Submission Review • Snapshot v${submission.version?.versionNumber ?? 1}${
          subjectInfo?.code ? ` • ${subjectInfo.code}` : ''
        }`}
        title={submission.paper?.title || (snapshot['title'] as string) || 'Question Paper'}
        badge={
          <Badge tone={getStatusTone(submission.status)}>
            {getStatusIcon(submission.status)}
            {submission.status.replace('_', ' ')}
          </Badge>
        }
        description={`${(config['name'] as string) || 'Examination'} · Max Marks: ${String(
          config['totalMarks'] ?? 60,
        )} · Duration: ${
          config['durationMinutes'] ? Math.round((config['durationMinutes'] as number) / 60) + 'h' : '3h'
        }`}
        actions={
          <>
            {submission.status === 'PENDING' && canDecide && (
              <>
                <Button
                  type="button"
                  variant="primary"
                  disabled={isSubmitter}
                  title={isSubmitter ? 'Self-approval is prohibited by policy' : 'Approve this paper'}
                  onClick={() =>
                    setDecisionModal({ open: true, decision: 'APPROVED', comments: '', submitting: false, error: null })
                  }
                >
                  <Check className="size-4" />
                  Approve Paper
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSubmitter}
                  title={isSubmitter ? 'Self-rejection is prohibited by policy' : 'Reject this paper'}
                  onClick={() =>
                    setDecisionModal({ open: true, decision: 'REJECTED', comments: '', submitting: false, error: null })
                  }
                >
                  <X className="size-4" />
                  Reject Paper
                </Button>
              </>
            )}

            {submission.status === 'APPROVED' && (
              <>
                {!pdfReady ? (
                  canGeneratePdf && (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={handleGeneratePdf}
                      disabled={generatingPdf}
                    >
                      <Sparkles className="size-4" />
                      {generatingPdf ? 'Generating PDF…' : 'Generate College Template PDF'}
                    </Button>
                  )
                ) : (
                  <Badge tone="success">
                    <CheckCircle2 className="size-3.5" /> PDF Generated
                  </Badge>
                )}
                {canDownloadPdf && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadPdf}
                  >
                    <Download className="size-4" />
                    Download PDF
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      {/* Submission Metadata & Alerts Card */}
      <Card>
        <CardBody className="space-y-4">
          {/* Independence guard warning */}
          {isSubmitter && submission.status === 'PENDING' && (
            <div className="rounded-control border border-warning/30 bg-warning-soft p-3.5 text-warning flex items-start gap-2.5">
              <ShieldAlert className="size-5 shrink-0 mt-0.5" />
              <div className="text-meta">
                <p className="font-semibold">Independent Review Policy Enforced</p>
                <p className="mt-0.5 text-ink-soft">
                  You are signed in as the submitting author (
                  <code className="font-mono text-[11px]">{user?.email || submission.submittedBy}</code>).
                  Authors cannot approve or reject their own question paper. An independent
                  Reviewer (<code className="font-mono text-[11px]">MODERATOR</code>), Exam Controller, or
                  Institution Admin must sign in to authorize this paper.
                </p>
              </div>
            </div>
          )}

          {/* Reviewer feedback (rejection) */}
          {submission.reviewComments && (
            <div className="rounded-control border border-danger/30 bg-danger-soft p-3.5 text-danger flex items-start gap-2.5">
              <XCircle className="size-5 shrink-0 mt-0.5" />
              <div className="text-meta">
                <p className="font-semibold">Reviewer Feedback / Rejection Reason</p>
                <p className="mt-0.5">{submission.reviewComments}</p>
              </div>
            </div>
          )}

          {/* Metadata row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-meta text-ink-muted">
            <div>
              <span className="block text-ink-soft">Submitted By</span>
              <span className="font-mono text-ink font-medium text-[11px]">{submission.submittedBy.substring(0, 18)}…</span>
            </div>
            <div>
              <span className="block text-ink-soft">Submitted At</span>
              <span className="text-ink font-medium">
                {new Date(submission.submittedAt).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="block text-ink-soft">Reviewer</span>
              <span className="text-ink font-medium font-mono text-[11px]">
                {submission.decidedBy ? submission.decidedBy.substring(0, 14) + '…' : '—'}
              </span>
            </div>
            <div>
              <span className="block text-ink-soft">Decision At</span>
              <span className="text-ink font-medium">
                {submission.decidedAt ? new Date(submission.decidedAt).toLocaleString() : '—'}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-line">
        <button
          type="button"
          onClick={() => setActiveTab('blueprint')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-support font-medium transition-colors ${
            activeTab === 'blueprint'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <FileText className="size-4" />
          Paper Blueprint
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('validation')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-support font-medium transition-colors ${
            activeTab === 'validation'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-muted hover:text-ink'
          }`}
        >
          <FileCheck className="size-4" />
          Validation Snapshot
          {validation?.issues?.some((i) => i.severity === 'ERROR') && (
            <Badge tone="danger" className="ml-1">
              {validation.issues.filter((i) => i.severity === 'ERROR').length} ERR
            </Badge>
          )}
        </button>
      </div>

      {/* Tab: Blueprint — official college paper layout */}
      {activeTab === 'blueprint' && (
        <Card className="mx-auto max-w-4xl overflow-hidden border border-line-strong">
          {/* College paper header */}
          <div className="p-6 sm:p-8 border-b border-line">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="inline-flex h-8 min-w-[44px] items-center justify-center rounded-md border-[1.2px] border-ink px-2.5 text-support font-bold tracking-wide text-ink">
                R22
              </div>
              <div className="text-support font-bold text-ink">
                Code No.: {subjectInfo?.code || 'N/A'}
              </div>
            </div>
            <div className="text-center space-y-1">
              <p className="text-[15px] font-bold text-ink tracking-tight">
                CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)
              </p>
              <p className="text-support font-bold text-ink">{(config['name'] as string) || 'Examination'}</p>
              <h2 className="text-section font-bold text-ink mt-1">
                {subjectInfo?.name || (snapshot['title'] as string) || 'Subject'}
              </h2>
            </div>
            <div className="flex justify-between items-center mt-4 px-2 sm:px-4">
              <span className="text-support font-bold text-ink">
                Time: {config['durationMinutes'] ? `${Math.round((config['durationMinutes'] as number) / 60)} Hours` : '3 Hours'}
              </span>
              <span className="text-support font-bold text-ink">
                Max Marks: {String(config['totalMarks'] ?? 60)}
              </span>
            </div>
            <p className="mt-3 text-meta text-ink border-t border-line pt-3">
              <span className="font-semibold text-ink">Note: </span>
              {(config['instructions'] as string) ||
                'Answer ALL questions from Part-A & Part-B (Internal Choice) at one place in the same order.'}
            </p>
          </div>

          {/* Sections */}
          <div className="divide-y divide-line">
            {sections.length === 0 ? (
              <div className="p-8 text-center text-ink-muted">
                <FileText className="size-10 mx-auto mb-2 opacity-40" />
                <p className="text-support">No sections in this snapshot</p>
              </div>
            ) : (
              sections.map((section, sIdx: number) => {
                const slots = section.slots || [];
                const qCount = section.requiredAnswers || section.totalSlots || slots.length || 0;
                const firstSlotMarks = Number(slots[0]?.allocatedMarks ?? slots[0]?.revision?.marks ?? 0);
                const eachMarks = firstSlotMarks > 0 ? firstSlotMarks : qCount > 0 ? Math.round(Number(section.sectionMarks ?? 0) / qCount) : 0;
                const totalRequiredMarks = qCount > 0 && eachMarks > 0 ? qCount * eachMarks : Number(section.sectionMarks ?? 0);
                const rawLabel = (section.sectionLabel || '').trim();
                const heading = /^part\b/i.test(rawLabel) ? rawLabel.replace(/^part\s*[-–—]?\s*/i, 'Part - ') : `Part - ${rawLabel}`;

                return (
                  <div key={section.id || sIdx} className="p-6 space-y-4">
                    {/* Section header */}
                    <div className="text-center space-y-0.5">
                      <h3 className="text-section font-bold text-ink">
                        {heading}
                      </h3>
                      <p className="text-support text-ink font-bold">
                        ({qCount}Q X {eachMarks}M = {totalRequiredMarks} Marks)
                      </p>
                    </div>

                    {/* Column headers */}
                    <div
                      className="grid text-meta font-bold text-ink border-b border-line pb-1"
                      style={{ gridTemplateColumns: '32px 1fr 44px 36px 36px' }}
                    >
                      <span>No.</span>
                      <span></span>
                      <span className="text-center">M</span>
                      <span className="text-center">CO</span>
                      <span className="text-center">BT</span>
                    </div>

                    {/* Questions */}
                    <div className="divide-y divide-line/50">
                      {slots.map((slot, qIdx: number) => {
                        globalQNumber += 1;
                        const rev: Partial<QuestionSlotRevision> = slot.revision || {};
                        const marks = slot.allocatedMarks ?? rev.marks ?? 0;
                        const coVal = extractSlotCo(rev);
                        const btVal = extractSlotBt(rev);
                        return (
                          <div key={slot.id || qIdx}>
                            <div
                              className="py-3 grid gap-2 items-start"
                              style={{ gridTemplateColumns: '32px 1fr 44px 36px 36px' }}
                            >
                              <span className="text-support font-medium text-ink pt-0.5">
                                {globalQNumber}.
                              </span>
                              <div>
                                <p className="text-support text-ink leading-relaxed">
                                  {rev.questionText || '(empty)'}
                                </p>
                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                  <span className="rounded bg-canvas-deep px-1.5 py-0.5 text-[11px] text-ink-muted font-mono">
                                    {rev.questionType || 'SHORT_ANSWER'}
                                  </span>
                                  {rev.difficulty && (
                                    <span className="rounded bg-canvas-deep px-1.5 py-0.5 text-[11px] text-ink-muted">
                                      {rev.difficulty}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="text-center text-support font-semibold text-ink">
                                ({marks})
                              </span>
                              <span className="text-center text-support text-ink">{coVal}</span>
                              <span className="text-center text-support text-ink">{btVal}</span>
                            </div>
                            {slot.orWithNext && (
                              <div className="py-1.5 text-center">
                                <span className="text-support font-bold text-ink">(OR)</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-4 text-center text-ink font-bold text-support border-t border-line">
            *****
          </div>
        </Card>
      )}

      {/* Tab: Validation snapshot */}
      {activeTab === 'validation' && (
        <div className="space-y-4">
          <Card>
            <CardBody className="space-y-4">
              <h3 className="text-section font-semibold text-ink">Pre-Submission Validation Report</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Configured Marks', val: validation?.configTotalMarks, ok: true },
                  { label: 'Achievable Marks', val: validation?.achievableMarks, ok: true },
                  {
                    label: 'Marks Discrepancy',
                    val: validation?.marksDiscrepancy ?? 0,
                    ok: (validation?.marksDiscrepancy ?? 0) === 0,
                  },
                  { label: 'Question Slots', val: validation?.slotCount, ok: true },
                ].map(({ label, val, ok }) => (
                  <div key={label} className="rounded-control bg-canvas-deep p-3">
                    <span className="block text-meta text-ink-muted mb-1">{label}</span>
                    <span className={`text-title font-semibold ${ok ? 'text-ink' : 'text-danger'}`}>
                      {val ?? '—'}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 pt-1">
                <h4 className="text-support font-semibold text-ink">Validation Findings ({validation?.issues?.length ?? 0})</h4>
                {!validation?.issues?.length ? (
                  <p className="flex items-center gap-1.5 text-support text-success">
                    <CheckCircle2 className="size-4" /> All structural and marks invariants satisfied.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {validation.issues.map((issue, iIdx: number) => {
                      const isError = issue.severity === 'ERROR';
                      const isWarn = issue.severity === 'WARNING';
                      return (
                        <div
                          key={iIdx}
                          className={`flex items-start gap-2 rounded-control border p-3 text-meta ${
                            isError
                              ? 'border-danger/30 bg-danger-soft text-danger'
                              : isWarn
                              ? 'border-warning/30 bg-warning-soft text-warning'
                              : 'border-accent/30 bg-accent-soft text-accent-ink'
                          }`}
                        >
                          {isError ? (
                            <XCircle className="size-4 shrink-0 mt-0.5 text-danger" />
                          ) : isWarn ? (
                            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-warning" />
                          ) : (
                            <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-accent" />
                          )}
                          <div>
                            <span className="font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                              [{issue.severity}] {issue.code}
                            </span>
                            <span>{issue.message}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Difficulty distribution */}
              {validation?.difficultyDistribution && (
                <div className="pt-3 border-t border-line">
                  <h4 className="text-support font-semibold text-ink mb-2">Difficulty Distribution</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(validation.difficultyDistribution as Record<string, number>).map(([level, count]) => (
                      <span key={level} className="rounded-control bg-canvas-deep px-3 py-1 text-meta text-ink-muted font-medium">
                        {level}: <strong className="text-ink">{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Decision Modal */}
      <Modal
        isOpen={decisionModal.open}
        onClose={() => setDecisionModal((prev) => ({ ...prev, open: false }))}
        title={decisionModal.decision === 'APPROVED' ? 'Approve Question Paper' : 'Reject Question Paper'}
        description={
          decisionModal.decision === 'APPROVED'
            ? 'Approving this submission locks this exact version as the official blueprint and authorizes college-template PDF generation.'
            : 'Rejecting returns the paper to REJECTED state. Provide a clear reason so faculty can revise and re-submit.'
        }
      >
        <form onSubmit={handleDecisionSubmit} className="space-y-4">
          {decisionModal.error && <ErrorMessage message={decisionModal.error} />}

          <TextArea
            label={
              decisionModal.decision === 'REJECTED'
                ? 'Rejection Reason (Mandatory)'
                : 'Approval Remarks (Optional)'
            }
            rows={4}
            required={decisionModal.decision === 'REJECTED'}
            value={decisionModal.comments}
            onChange={(e) => setDecisionModal((prev) => ({ ...prev, comments: e.target.value }))}
            placeholder={
              decisionModal.decision === 'REJECTED'
                ? 'Explain why this paper is rejected and what must be corrected before re-submission…'
                : 'Any additional notes for records (optional)…'
            }
          />

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="outline"
              disabled={decisionModal.submitting}
              onClick={() => setDecisionModal((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={decisionModal.decision === 'APPROVED' ? 'primary' : 'destructive'}
              disabled={decisionModal.submitting}
            >
              {decisionModal.submitting
                ? 'Recording decision…'
                : decisionModal.decision === 'APPROVED'
                ? 'Confirm Approval'
                : 'Confirm Rejection'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function getStatusTone(status: string): NonNullable<BadgeProps['tone']> {
  switch (status) {
    case 'PENDING': return 'warning';
    case 'APPROVED': return 'success';
    case 'REJECTED': return 'danger';
    case 'CHANGES_REQUESTED': return 'warning';
    default: return 'neutral';
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'PENDING': return <Clock className="size-3.5" />;
    case 'APPROVED': return <CheckCircle2 className="size-3.5" />;
    case 'REJECTED': return <XCircle className="size-3.5" />;
    case 'CHANGES_REQUESTED': return <AlertTriangle className="size-3.5" />;
    default: return null;
  }
}

const BLOOMS_LEVEL_MAP: Record<string, number> = {
  REMEMBER: 1,
  UNDERSTAND: 2,
  APPLY: 3,
  ANALYZE: 4,
  EVALUATE: 5,
  CREATE: 6,
};

function extractSlotCo(rev?: Partial<QuestionSlotRevision>): number {
  const firstTopic =
    rev?.questionTopicMaps?.[0]?.topic ||
    rev?.question?.questionTopicMaps?.[0]?.topic;
  if (typeof firstTopic?.sequenceOrder === 'number' && firstTopic.sequenceOrder > 0) {
    return firstTopic.sequenceOrder;
  }
  const codeMatch = firstTopic?.code?.match(/(\d+)/);
  if (codeMatch) {
    return parseInt(codeMatch[1], 10);
  }
  return 1;
}

function extractSlotBt(rev?: Partial<QuestionSlotRevision>): number {
  const analysis = rev?.analyses?.[0];
  const blooms = analysis?.facultyBloomsLevel || analysis?.aiBloomsLevel;
  if (blooms && BLOOMS_LEVEL_MAP[blooms]) {
    return BLOOMS_LEVEL_MAP[blooms];
  }
  const diff = rev?.difficulty;
  if (diff === 'EASY') return 1;
  if (diff === 'MEDIUM') return 2;
  if (diff === 'HARD') return 3;
  return 2;
}
