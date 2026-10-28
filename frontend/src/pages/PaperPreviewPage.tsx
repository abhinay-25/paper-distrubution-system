import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  History,
  Save,
  CheckCircle2,
  AlertCircle,
  Eye,
  ShieldCheck,
  RefreshCw,
  Send,
  Download,
  FileText,
  Sparkles,
  FileCheck2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardBody, PageHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { TextArea } from '../components/ui/FormControls';
import { ErrorMessage, Skeleton } from '../components/ui/Feedback';
import {
  getPaperPreview,
  saveVersion,
  submitPaperForApproval,
  getPaperPdfDetails,
  generatePaperPdf,
  fetchPaperPdfBlob,
  downloadPaperPdf,
  ApiError,
} from '../lib/api';
import type { ExamPaper, PaperPdfArtifact, PaperSection, QuestionSlot } from '../types/paper';

function formatDurationHours(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return '3 Hours';
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return `${hours} Hour${hours > 1 ? 's' : ''}`;
  }
  return `${hours.toFixed(1)} Hours`;
}

function formatCleanMarks(marks: number | string | null | undefined): string {
  if (marks === null || marks === undefined || marks === '') return '0';
  const num = typeof marks === 'string' ? parseFloat(marks) : marks;
  if (Number.isNaN(num)) return '0';
  return Number.isInteger(num) ? `${num}` : `${Number(num.toFixed(2))}`;
}

function formatSectionHeadingLabel(sectionLabel?: string | null): string {
  const clean = (sectionLabel || 'A').trim();
  if (/^(part|section)\b/i.test(clean)) return clean;
  return `Part - ${clean}`;
}

function computeSectionSubtitle(section: PaperSection): string {
  const slots = section.slots || [];
  if (slots.length === 0) {
    return `(0Q X 0M = ${formatCleanMarks(section.sectionMarks)} Marks)`;
  }
  const answerCount =
    typeof section.requiredAnswers === 'number' && section.requiredAnswers > 0
      ? section.requiredAnswers
      : slots.length;
  const slotMarks = slots.map((s) => parseFloat(String(s.allocatedMarks ?? s.revision?.marks ?? 0)) || 0);
  const firstMark = slotMarks[0] ?? 0;
  const isUniform = slotMarks.every((m) => Math.abs(m - firstMark) < 0.01);

  if (isUniform && firstMark > 0) {
    const achievable = answerCount * firstMark;
    return `(${answerCount}Q X ${formatCleanMarks(firstMark)}M = ${formatCleanMarks(achievable)} Marks)`;
  }

  const rawSecMarks = Number(section.sectionMarks || 0);
  const avgMarks = answerCount > 0 ? rawSecMarks / answerCount : 0;
  return `(${answerCount}Q X ${formatCleanMarks(avgMarks)}M = ${formatCleanMarks(rawSecMarks)} Marks)`;
}

function deriveSlotCO(slot: QuestionSlot, fallbackIndex: number): string {
  const topic =
    slot.revision?.questionTopicMaps?.[0]?.topic ||
    slot.revision?.question?.questionTopicMaps?.[0]?.topic;
  if (typeof topic?.sequenceOrder === 'number' && topic.sequenceOrder > 0) {
    return String(topic.sequenceOrder);
  }
  if (typeof topic?.code === 'string') {
    const match = topic.code.match(/(\d+)/);
    if (match?.[1]) return match[1];
  }
  if (typeof topic?.name === 'string') {
    const match = topic.name.match(/(?:CO|UNIT|U)\s*(\d+)/i);
    if (match?.[1]) return match[1];
  }
  return String(Math.min(5, fallbackIndex + 1));
}

function deriveSlotBT(slot: QuestionSlot): number {
  const analysis = slot.revision?.analyses?.[0];
  const rawBlooms = (analysis?.facultyBloomsLevel || analysis?.aiBloomsLevel || '').toUpperCase();
  if (rawBlooms.includes('REMEMBER') || rawBlooms === 'L1') return 1;
  if (rawBlooms.includes('UNDERSTAND') || rawBlooms === 'L2') return 2;
  if (rawBlooms.includes('APPLY') || rawBlooms === 'L3') return 3;
  if (rawBlooms.includes('ANALYZE') || rawBlooms === 'L4') return 4;
  if (rawBlooms.includes('EVALUATE') || rawBlooms === 'L5') return 5;
  if (rawBlooms.includes('CREATE') || rawBlooms === 'L6') return 6;

  if (slot.revision?.difficulty === 'HARD') return 4;
  if (slot.revision?.difficulty === 'MEDIUM') return 2;
  return 1;
}

export function PaperPreviewPage() {
  const { paperId } = useParams<{ paperId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const modeParam = searchParams.get('mode') === 'candidate' ? 'candidate' : 'faculty';
  const [mode, setMode] = useState<'faculty' | 'candidate'>(modeParam);
  const [previewSurface, setPreviewSurface] = useState<'sheet' | 'pdf'>('sheet');

  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Official PDF artifact state (for APPROVED papers)
  const [pdfArtifact, setPdfArtifact] = useState<PaperPdfArtifact | null>(null);
  const [loadingPdfMeta, setLoadingPdfMeta] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loadingPdfViewer, setLoadingPdfViewer] = useState(false);

  // Save version modal state
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [changeNote, setChangeNote] = useState('');
  const [savingVersion, setSavingVersion] = useState(false);

  // Submit for approval modal state
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);
  const [submitNotes, setSubmitNotes] = useState('');
  const [submittingPaper, setSubmittingPaper] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadPdfMetadata = useCallback(async (targetPaperId: string) => {
    setLoadingPdfMeta(true);
    setPdfError(null);
    try {
      const details = await getPaperPdfDetails(targetPaperId);
      setPdfArtifact(details);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 404) {
        setPdfArtifact(null);
      } else {
        setPdfError(err instanceof Error ? err.message : 'Unable to check PDF artifact status.');
      }
    } finally {
      setLoadingPdfMeta(false);
    }
  }, []);

  const loadPreview = useCallback(
    async (previewMode: 'faculty' | 'candidate') => {
      if (!paperId) return;
      setLoading(true);
      setError(null);
      setConflictError(null);
      try {
        const data = await getPaperPreview(paperId, previewMode);
        setPaper(data);
        if (data.status === 'APPROVED') {
          await loadPdfMetadata(data.id);
        } else {
          setPdfArtifact(null);
          setPreviewSurface('sheet');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load paper preview');
      } finally {
        setLoading(false);
      }
    },
    [paperId, loadPdfMetadata],
  );

  useEffect(() => {
    setSearchParams({ mode }, { replace: true });
    if (paperId) {
      void loadPreview(mode);
    }
  }, [paperId, mode, loadPreview, setSearchParams]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  async function handleGenerateOrRegeneratePdf(forceRegenerate: boolean) {
    if (!paper) return;
    setGeneratingPdf(true);
    setPdfError(null);
    try {
      await generatePaperPdf(paper.id, forceRegenerate);
      const updatedDetails = await getPaperPdfDetails(paper.id);
      setPdfArtifact(updatedDetails);
      setSuccessMessage(
        forceRegenerate
          ? 'Official CBIT examination PDF regenerated and SHA-256 checksum updated.'
          : 'Official CBIT examination PDF generated and verified.',
      );
      setTimeout(() => setSuccessMessage(null), 5000);

      // Refresh embedded viewer if currently active
      if (previewSurface === 'pdf') {
        await handleOpenEmbeddedPdf(paper.id);
      }
    } catch (err: unknown) {
      setPdfError(err instanceof Error ? err.message : 'Failed to generate official PDF');
    } finally {
      setGeneratingPdf(false);
    }
  }

  async function handleOpenEmbeddedPdf(targetPaperId = paper?.id) {
    if (!targetPaperId) return;
    setLoadingPdfViewer(true);
    setPdfError(null);
    try {
      const { blob } = await fetchPaperPdfBlob(targetPaperId);
      setPdfBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      setPreviewSurface('pdf');
    } catch (err: unknown) {
      setPdfError(err instanceof Error ? err.message : 'Failed to load PDF stream for preview');
    } finally {
      setLoadingPdfViewer(false);
    }
  }

  async function handleDownloadPdf() {
    if (!paper) return;
    setDownloadingPdf(true);
    setPdfError(null);
    try {
      if (!pdfArtifact) {
        await generatePaperPdf(paper.id, false);
        await loadPdfMetadata(paper.id);
      }
      await downloadPaperPdf(paper.id);
    } catch (err: unknown) {
      setPdfError(err instanceof Error ? err.message : 'Failed to download PDF artifact');
    } finally {
      setDownloadingPdf(false);
    }
  }

  async function handleSaveVersion(e: React.FormEvent) {
    e.preventDefault();
    if (!paperId || !paper) return;

    setSavingVersion(true);
    setConflictError(null);
    try {
      const result = await saveVersion(
        paperId,
        changeNote.trim() || undefined,
        paper.concurrencyVersion ?? 0,
      );
      setSuccessMessage(`Version #${result.versionNumber} saved successfully.`);
      setPaper((prev) =>
        prev
          ? {
              ...prev,
              concurrencyVersion: result.concurrencyVersion,
            }
          : prev,
      );
      setIsSaveModalOpen(false);
      setChangeNote('');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(
          'This paper was modified by someone else. Please reload before saving.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Failed to save version');
      }
    } finally {
      setSavingVersion(false);
    }
  }

  async function handleSubmitForApproval(e: React.FormEvent) {
    e.preventDefault();
    if (!paperId) return;
    setSubmittingPaper(true);
    setSubmitError(null);
    try {
      await submitPaperForApproval(paperId, submitNotes.trim() || undefined);
      setSuccessMessage('Paper successfully submitted for independent approval.');
      setIsSubmitModalOpen(false);
      setSubmitNotes('');
      await loadPreview(mode);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit paper for approval');
    } finally {
      setSubmittingPaper(false);
    }
  }

  if (loading && !paper) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-72" />
        <Card className="mx-auto max-w-5xl">
          <CardBody className="space-y-4 p-8">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="space-y-4">
        <ErrorMessage message={error || 'Paper not found'} retry={() => void loadPreview(mode)} />
        <Link to={paperId ? `/papers/${paperId}` : '/papers'}>
          <Button variant="outline">
            <ArrowLeft className="size-4" />
            Back to Builder
          </Button>
        </Link>
      </div>
    );
  }

  const sortedSections = [...(paper.sections || [])].sort(
    (a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0),
  );

  // Precompute continuous starting question number for each section
  const sectionStartNumbers: number[] = [];
  let runningQNum = 1;
  for (const sec of sortedSections) {
    sectionStartNumbers.push(runningQNum);
    runningQNum += (sec.slots || []).length;
  }

  const subjectCode = paper.config?.subject?.code || '22CIE18';
  const subjectName = paper.config?.subject?.name || paper.title;
  const examName = paper.config?.name || 'B.E. (CET) VII Sem (Main) Examination November 2025';
  const durationLabel = formatDurationHours(paper.config?.durationMinutes);
  const maxMarksLabel = formatCleanMarks(paper.config?.totalMarks ?? 60);
  const defaultInstructions =
    '"Answer ALL questions from Part-A and Part-B (including internal choices) at one place and in the same order as in the question paper."';
  const instructionsText = paper.config?.instructions?.trim() || defaultInstructions;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link
            to={`/papers/${paper.id}`}
            className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Builder</span>
          </Link>
        }
        eyebrow={`Preview & Versioning • Lock Token #${paper.concurrencyVersion ?? 0}`}
        title={paper.title}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">v{paper.version}</Badge>
            {paper.status === 'APPROVED' && <Badge tone="success">Approved</Badge>}
            {paper.status === 'SUBMITTED' && <Badge tone="accent">Pending Approval</Badge>}
            {paper.status === 'REJECTED' && <Badge tone="danger">Changes Requested</Badge>}
            {paper.status === 'DRAFT' && <Badge tone="warning">Draft</Badge>}
          </div>
        }
        description={
          paper.config?.name
            ? `${paper.config.name}${
                paper.config.subject ? ` (${paper.config.subject.code})` : ''
              }`
            : undefined
        }
        actions={
          <>
            {/* Faculty vs Candidate Mode Switcher */}
            <div className="flex rounded-control border border-line bg-canvas-deep p-0.5">
              <button
                type="button"
                onClick={() => setMode('faculty')}
                className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-meta font-medium transition-colors ${
                  mode === 'faculty'
                    ? 'bg-surface-raised text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Eye className="size-3.5" />
                Faculty View
              </button>
              <button
                type="button"
                onClick={() => setMode('candidate')}
                className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-meta font-medium transition-colors ${
                  mode === 'candidate'
                    ? 'bg-surface-raised text-ink shadow-xs'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                <ShieldCheck className="size-3.5" />
                Candidate View
              </button>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/papers/${paper.id}/versions`)}
            >
              <History className="size-4" />
              View History
            </Button>

            {paper.status === 'APPROVED' && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => void handleDownloadPdf()}
                disabled={downloadingPdf || generatingPdf}
              >
                <Download className="size-3.5" />
                {downloadingPdf ? 'Downloading…' : 'Download PDF'}
              </Button>
            )}

            {(paper.status === 'DRAFT' || paper.status === 'REJECTED') && mode === 'faculty' && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  setSubmitNotes('');
                  setSubmitError(null);
                  setIsSubmitModalOpen(true);
                }}
              >
                <Send className="size-3.5" />
                Submit for Approval
              </Button>
            )}

            {(paper.status === 'DRAFT' || paper.status === 'REJECTED') && mode === 'faculty' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsSaveModalOpen(true)}
              >
                <Save className="size-4" />
                Save Version
              </Button>
            )}
          </>
        }
      />

      {/* Rejection Banner */}
      {paper.rejectionReason && paper.status === 'REJECTED' && (
        <div className="flex items-start gap-2.5 rounded-card border border-danger/40 bg-danger-soft/40 p-4 text-support text-danger">
          <AlertCircle className="mt-0.5 size-5 shrink-0" />
          <div>
            <span className="block font-semibold">Reviewer Feedback & Changes Requested</span>
            <span className="mt-0.5 block">{paper.rejectionReason}</span>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successMessage && (
        <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success-soft p-3 text-support font-medium text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 409 Conflict Banner */}
      {conflictError && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-card border border-danger/40 bg-danger-soft/40 p-4 text-danger sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 shrink-0" />
            <span className="text-support font-medium">{conflictError}</span>
          </div>
          <Button size="sm" variant="destructive" onClick={() => void loadPreview(mode)}>
            <RefreshCw className="mr-1 size-3.5" />
            Reload Paper
          </Button>
        </div>
      )}

      {/* Official PDF Artifact Bar (for APPROVED papers) */}
      {paper.status === 'APPROVED' && (
        <Card className="mx-auto max-w-5xl">
          <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <FileCheck2 className="size-4 text-accent" />
                <span className="text-support font-semibold text-ink">
                  Official CBIT Examination PDF Artifact
                </span>
                {pdfArtifact ? (
                  <>
                    <Badge tone={pdfArtifact.integrityVerified !== false ? 'success' : 'danger'}>
                      {pdfArtifact.integrityVerified !== false
                        ? 'SHA-256 Verified'
                        : 'Integrity Mismatch'}
                    </Badge>
                    <Badge tone="neutral">
                      {pdfArtifact.pageCount} {pdfArtifact.pageCount === 1 ? 'Page' : 'Pages'}
                    </Badge>
                    <Badge tone="neutral">{pdfArtifact.templateId}</Badge>
                  </>
                ) : loadingPdfMeta ? (
                  <Badge tone="neutral">Checking artifact…</Badge>
                ) : (
                  <Badge tone="warning">Not Generated Yet</Badge>
                )}
              </div>
              {pdfArtifact ? (
                <p className="text-meta text-ink-muted">
                  File: <code className="font-mono text-[11px] text-ink">{pdfArtifact.fileName}</code>{' '}
                  · {(pdfArtifact.fileSizeBytes / 1024).toFixed(1)} KB · SHA-256:{' '}
                  <code className="font-mono text-[11px] text-ink">
                    {pdfArtifact.checksumSha256.slice(0, 16)}…
                  </code>
                </p>
              ) : (
                <p className="text-meta text-ink-muted">
                  Generate the official print-ready CBIT question paper PDF bound to this approved
                  snapshot.
                </p>
              )}
              {pdfError && <p className="text-meta font-medium text-danger">{pdfError}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {pdfArtifact ? (
                <>
                  <div className="flex rounded-control border border-line bg-canvas-deep p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewSurface('sheet')}
                      className={`rounded-control px-2.5 py-1 text-meta font-medium transition-colors ${
                        previewSurface === 'sheet'
                          ? 'bg-surface-raised text-ink shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      Formatted Sheet
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleOpenEmbeddedPdf(paper.id)}
                      disabled={loadingPdfViewer}
                      className={`rounded-control px-2.5 py-1 text-meta font-medium transition-colors ${
                        previewSurface === 'pdf'
                          ? 'bg-surface-raised text-ink shadow-xs'
                          : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {loadingPdfViewer ? 'Loading PDF…' : 'Embedded PDF'}
                    </button>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleGenerateOrRegeneratePdf(true)}
                    disabled={generatingPdf}
                  >
                    <RefreshCw className={`size-3.5 ${generatingPdf ? 'animate-spin' : ''}`} />
                    {generatingPdf ? 'Regenerating…' : 'Regenerate PDF'}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => void handleGenerateOrRegeneratePdf(false)}
                  disabled={generatingPdf}
                >
                  <Sparkles className="size-3.5" />
                  {generatingPdf ? 'Generating Official PDF…' : 'Generate Official PDF'}
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Candidate View Confidentiality Notice */}
      {mode === 'candidate' && (
        <div className="mx-auto flex max-w-5xl items-center justify-between rounded-card border border-accent/30 bg-accent-soft/30 p-3.5">
          <div className="flex items-center gap-2.5 text-accent">
            <ShieldCheck className="size-5 shrink-0" />
            <div>
              <p className="text-support font-semibold text-ink">
                Candidate View — Answer keys & internal notes stripped
              </p>
              <p className="text-meta text-ink-muted">
                Displays only candidate-facing examination metadata, question prompts, marks, CO, and
                BT columns.
              </p>
            </div>
          </div>
          <Badge tone="accent">Print Preview</Badge>
        </div>
      )}

      {/* Embedded PDF Viewer Surface (when toggled for APPROVED paper) */}
      {previewSurface === 'pdf' && pdfBlobUrl ? (
        <Card className="mx-auto max-w-5xl overflow-hidden border border-line shadow-card">
          <div className="flex items-center justify-between border-b border-line bg-canvas-deep px-5 py-3">
            <div className="flex items-center gap-2 text-support font-medium text-ink">
              <FileText className="size-4 text-accent" />
              <span>Embedded Official PDF Preview ({pdfArtifact?.fileName})</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => void handleDownloadPdf()}>
              <Download className="size-3.5" />
              Download PDF
            </Button>
          </div>
          <iframe
            title="Official Examination Question Paper PDF"
            src={pdfBlobUrl}
            className="h-[820px] w-full border-0 bg-canvas"
          />
        </Card>
      ) : (
        /* CBIT Examination Paper Sheet Layout */
        <Card className="mx-auto max-w-5xl overflow-hidden border border-line bg-surface-raised shadow-card">
          {/* Institutional Header Replicating Social_Engineering_22CIE18.pdf */}
          <div className="border-b border-line px-6 py-7 sm:px-10">
            {/* Top Row: Regulation Box (R22) & Code No. */}
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center justify-center rounded-md border-2 border-ink px-3 py-1 font-display text-support font-bold tracking-wide text-ink">
                R22
              </span>
              <span className="font-serif text-support font-bold text-ink">
                Code No.: {subjectCode}
              </span>
            </div>

            {/* Centered Institution, Exam Name, and Subject Name */}
            <div className="mt-3 space-y-1 text-center font-serif">
              <p className="text-support font-bold tracking-wide text-ink sm:text-base">
                CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)
              </p>
              <p className="text-support font-bold text-ink">{examName}</p>
              <h2 className="pt-1 text-title font-bold text-ink">{subjectName}</h2>
            </div>

            {/* Time & Max Marks Row */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 font-serif text-support font-bold text-ink">
              <span>Time: {durationLabel}</span>
              <span>Max Marks: {maxMarksLabel}</span>
            </div>

            {/* Mandatory Candidate Note */}
            <div className="mt-2.5 flex items-baseline gap-2 font-serif text-support leading-relaxed text-ink">
              <span className="shrink-0 font-bold italic">Note:</span>
              <p className="text-ink">{instructionsText}</p>
            </div>

            {/* Faculty Internal Notes (Faculty View Only) */}
            {mode === 'faculty' && paper.notes && (
              <div className="mt-4 rounded-control border border-warning/30 bg-warning-soft/40 p-3 text-left font-sans text-meta text-ink">
                <span className="font-semibold text-warning">Faculty Internal Paper Notes: </span>
                <span className="text-ink-soft">{paper.notes}</span>
              </div>
            )}
          </div>

          {/* Paper Sections and Questions */}
          <CardBody className="space-y-8 px-6 py-7 sm:px-10">
            {sortedSections.length === 0 ? (
              <div className="py-12 text-center text-support text-ink-muted">
                No sections or questions have been added to this question paper yet.
              </div>
            ) : (
              sortedSections.map((sec, secIdx) => {
                const startNum = sectionStartNumbers[secIdx] ?? 1;
                const sortedSlots = [...(sec.slots || [])].sort(
                  (a, b) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0),
                );
                const sectionHeading = formatSectionHeadingLabel(sec.sectionLabel);
                const sectionSubtitle = computeSectionSubtitle(sec);

                return (
                  <div key={sec.id} className="space-y-3">
                    {/* Centered Section Heading & Marks Subtitle */}
                    <div className="space-y-0.5 text-center font-serif">
                      <h3 className="text-support font-bold text-ink sm:text-base">
                        {sectionHeading}
                      </h3>
                      <p className="text-support font-bold text-ink">{sectionSubtitle}</p>
                      {sec.description && (
                        <p className="pt-0.5 font-sans text-meta italic text-ink-muted">
                          {sec.description}
                        </p>
                      )}
                    </div>

                    {/* Tabular Question List with M | CO | BT Headers */}
                    {sortedSlots.length === 0 ? (
                      <p className="py-4 text-center text-support italic text-ink-muted">
                        (No questions assigned to this section)
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-line font-serif text-meta font-bold text-ink">
                              <th className="w-10 py-1.5 pr-2">Q.No</th>
                              <th className="py-1.5 pr-4">Question</th>
                              <th className="w-14 py-1.5 text-center">M</th>
                              <th className="w-12 py-1.5 text-center">CO</th>
                              <th className="w-12 py-1.5 text-center">BT</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-line/60">
                            {sortedSlots.map((slot, qIdx) => {
                              const qNumber = startNum + qIdx;
                              const marksVal = formatCleanMarks(
                                slot.allocatedMarks ?? slot.revision?.marks ?? 0,
                              );
                              const coVal = deriveSlotCO(slot, qIdx);
                              const btVal = deriveSlotBT(slot);

                              return (
                                <tr key={slot.id} className="align-top">
                                  <td className="py-3 pr-2 font-serif text-support font-medium text-ink">
                                    {qNumber}
                                  </td>
                                  <td className="py-3 pr-4">
                                    <p className="whitespace-pre-line font-serif text-support leading-relaxed text-ink">
                                      {slot.revision.questionText}
                                    </p>

                                    {/* Faculty-only metadata & answer key */}
                                    {mode === 'faculty' && (
                                      <div className="mt-2 space-y-2 font-sans">
                                        <div className="flex flex-wrap items-center gap-1.5 text-meta">
                                          <Badge tone="neutral">
                                            Rev #{slot.revision.revisionNumber}
                                          </Badge>
                                          <Badge tone="neutral">{slot.revision.questionType}</Badge>
                                          {slot.revision.difficulty && (
                                            <Badge
                                              tone={
                                                slot.revision.difficulty === 'EASY'
                                                  ? 'success'
                                                  : slot.revision.difficulty === 'HARD'
                                                  ? 'danger'
                                                  : 'warning'
                                              }
                                            >
                                              {slot.revision.difficulty}
                                            </Badge>
                                          )}
                                          {slot.revision.questionTopicMaps?.map((tm) => (
                                            <span
                                              key={tm.topic.id}
                                              className="rounded bg-canvas-deep px-2 py-0.5 text-[11px] font-medium text-ink-muted"
                                            >
                                              {tm.topic.code ? `${tm.topic.code}: ` : ''}
                                              {tm.topic.name}
                                            </span>
                                          ))}
                                          {slot.notes && (
                                            <span className="text-meta font-medium text-warning">
                                              Note: {slot.notes}
                                            </span>
                                          )}
                                        </div>

                                        {slot.revision.explanation && (
                                          <div className="rounded-control border border-line bg-canvas-deep/50 p-2.5 text-meta text-ink-muted">
                                            <strong className="mb-0.5 block font-semibold text-ink">
                                              Marking Scheme / Explanation:
                                            </strong>
                                            <p className="whitespace-pre-line">
                                              {slot.revision.explanation}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 text-center font-serif text-support text-ink">
                                    ({marksVal})
                                  </td>
                                  <td className="py-3 text-center font-serif text-support text-ink">
                                    {coVal}
                                  </td>
                                  <td className="py-3 text-center font-serif text-support text-ink">
                                    {btVal}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Terminal Marker ***** */}
            <div className="pt-4 text-center font-serif text-support font-bold tracking-widest text-ink">
              *****
            </div>
          </CardBody>
        </Card>
      )}

      {/* Modal: Save Version */}
      <Modal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        title="Save Paper Snapshot Version"
        description="Creates an immutable snapshot version with an optimistic concurrency check."
      >
        <form onSubmit={handleSaveVersion} className="space-y-4">
          <div className="space-y-1 rounded-control border border-line bg-canvas-deep/40 p-3 text-meta text-ink-muted">
            <p>
              Current Paper: <strong className="text-ink">{paper.title}</strong>
            </p>
            <p>
              Expected Lock Token:{' '}
              <strong className="text-ink">#{paper.concurrencyVersion ?? 0}</strong>
            </p>
            <p className="text-[11px] text-ink-faint">
              If another faculty member saves changes concurrently, a conflict will be detected and
              you will be prompted to reload.
            </p>
          </div>

          <TextArea
            label="Change Note (Optional)"
            placeholder="e.g. Balanced Section B marks, verified syllabus coverage for Midterm 2026..."
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
            rows={3}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={savingVersion}>
              {savingVersion ? 'Saving Snapshot...' : 'Save Version Snapshot'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Submit for Approval */}
      <Modal
        isOpen={isSubmitModalOpen}
        onClose={() => setIsSubmitModalOpen(false)}
        title="Submit Question Paper for Independent Review"
        description="Submitting will validate the paper structure, save an immutable blueprint snapshot, and route it to independent reviewers for authorization."
      >
        <form onSubmit={handleSubmitForApproval} className="space-y-4">
          {submitError && <ErrorMessage message={submitError} />}
          <div className="space-y-1 rounded-control bg-canvas-deep p-3 text-meta text-ink-muted">
            <p>
              Paper: <strong className="text-ink">{paper.title}</strong>
            </p>
            <p>
              Examination: <strong className="text-ink">{paper.config?.name}</strong>
            </p>
            <p className="text-[11px] text-ink-faint">
              Note: The paper must satisfy all marks calculation and section rules before it can be
              submitted.
            </p>
          </div>

          <TextArea
            label="Submitter Notes (Optional)"
            placeholder="e.g. Prepared for VII Sem regular examinations. All Part-B internal choices verified."
            value={submitNotes}
            onChange={(e) => setSubmitNotes(e.target.value)}
            rows={3}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSubmitModalOpen(false)}
              disabled={submittingPaper}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submittingPaper}>
              {submittingPaper ? 'Submitting for Review...' : 'Confirm Submission'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
