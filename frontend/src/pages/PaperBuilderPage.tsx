import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Layers,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Info,
  Send,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardBody, PageHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { TextInput, TextArea, Select } from '../components/ui/FormControls';
import { ErrorMessage } from '../components/ui/Feedback';
import {
  fetchExamPaper,
  submitExamPaper,
  validateExamPaper,
  addPaperSection,
  updatePaperSection,
  deletePaperSection,
  addQuestionSlot,
  updateQuestionSlot,
  deleteQuestionSlot,
  fetchQuestions,
  fetchTopics,
  ApiError,
} from '../lib/api';
import type {
  ExamPaper,
  PaperSection,
  PaperValidationResult,
  PaperStatus,
} from '../types/paper';
import type { Question, Topic } from '../types/academic';

function getStatusTone(status: PaperStatus) {
  switch (status) {
    case 'APPROVED':
      return 'success';
    case 'SUBMITTED':
      return 'accent';
    case 'DRAFT':
      return 'warning';
    case 'REJECTED':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function PaperBuilderPage() {
  const { paperId } = useParams<{ paperId: string }>();

  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [validation, setValidation] = useState<PaperValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Section modal state
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<PaperSection | null>(null);
  const [sectionLabel, setSectionLabel] = useState('');
  const [sectionTitle, setSectionTitle] = useState('');
  const [sectionDescription, setSectionDescription] = useState('');
  const [requiredAnswers, setRequiredAnswers] = useState<string>('');

  // Question Picker modal state
  const [isQuestionPickerOpen, setIsQuestionPickerOpen] = useState(false);
  const [targetSectionId, setTargetSectionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');

  // Right sidebar tab
  const [activeTab, setActiveTab] = useState<'validation' | 'syllabus' | 'summary'>('validation');

  useEffect(() => {
    if (paperId) {
      loadPaper();
    }
  }, [paperId]);

  async function loadPaper() {
    if (!paperId) return;
    setLoading(true);
    setError(null);
    setConflictError(null);
    try {
      const data = await fetchExamPaper(paperId);
      setPaper(data);
      // Automatically trigger validation
      runValidation(data.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load question paper');
    } finally {
      setLoading(false);
    }
  }

  async function runValidation(id = paperId) {
    if (!id) return;
    setValidating(true);
    try {
      const result = await validateExamPaper(id);
      setValidation(result);
    } catch (err: unknown) {
      console.error('Validation check failed', err);
    } finally {
      setValidating(false);
    }
  }

  function handleOperationError(err: unknown, defaultMessage: string) {
    if (err instanceof ApiError && err.status === 409) {
      setConflictError(
        'This paper was modified by someone else or in another session. Please reload the paper before making further changes.',
      );
    } else {
      alert(err instanceof Error ? err.message : defaultMessage);
    }
  }

  // Section operations
  function openAddSectionModal() {
    setEditingSection(null);
    const nextCode = String.fromCharCode(65 + (paper?.sections.length || 0));
    setSectionLabel(nextCode);
    setSectionTitle(`Section ${nextCode}`);
    setSectionDescription('');
    setRequiredAnswers('');
    setIsSectionModalOpen(true);
  }

  function openEditSectionModal(section: PaperSection) {
    setEditingSection(section);
    setSectionLabel(section.sectionLabel);
    setSectionTitle(section.title);
    setSectionDescription(section.description || '');
    setRequiredAnswers(section.requiredAnswers ? String(section.requiredAnswers) : '');
    setIsSectionModalOpen(true);
  }

  async function handleSaveSection(e: React.FormEvent) {
    e.preventDefault();
    if (!paperId || !sectionLabel.trim() || !sectionTitle.trim()) return;

    try {
      const reqVal = requiredAnswers.trim() ? Number(requiredAnswers) : null;
      if (editingSection) {
        await updatePaperSection(paperId, editingSection.id, {
          sectionLabel: sectionLabel.trim(),
          title: sectionTitle.trim(),
          description: sectionDescription.trim() || null,
          requiredAnswers: reqVal,
        });
      } else {
        await addPaperSection(paperId, {
          sectionLabel: sectionLabel.trim(),
          title: sectionTitle.trim(),
          description: sectionDescription.trim() || undefined,
          sequenceOrder: (paper?.sections.length || 0) + 1,
          requiredAnswers: reqVal,
        });
      }

      setIsSectionModalOpen(false);
      await loadPaper();
    } catch (err: unknown) {
      handleOperationError(err, 'Failed to save section');
    }
  }

  async function handleDeleteSection(sectionId: string) {
    if (!paperId || !confirm('Are you sure you want to remove this section and all its questions?'))
      return;
    try {
      await deletePaperSection(paperId, sectionId);
      await loadPaper();
    } catch (err: unknown) {
      handleOperationError(err, 'Failed to delete section');
    }
  }

  // Slot operations
  async function handleUpdateSlotMarks(sectionId: string, slotId: string, newMarks: number) {
    if (!paperId || isNaN(newMarks) || newMarks <= 0) return;
    try {
      await updateQuestionSlot(paperId, sectionId, slotId, { allocatedMarks: newMarks });
      await loadPaper();
    } catch (err: unknown) {
      handleOperationError(err, 'Failed to update marks');
    }
  }

  async function handleRemoveSlot(sectionId: string, slotId: string) {
    if (!paperId) return;
    try {
      await deleteQuestionSlot(paperId, sectionId, slotId);
      await loadPaper();
    } catch (err: unknown) {
      handleOperationError(err, 'Failed to remove question slot');
    }
  }

  // Question Picker
  async function openQuestionPicker(sectionId: string) {
    setTargetSectionId(sectionId);
    setIsQuestionPickerOpen(true);
    setQuestionsLoading(true);
    try {
      const subjectId = paper?.config.subjectId;
      const [questionsRes, topicsRes] = await Promise.all([
        fetchQuestions({
          subjectId,
          pageSize: 100,
        }),
        subjectId ? fetchTopics(subjectId) : Promise.resolve({ data: [] }),
      ]);
      setQuestions(questionsRes.data);
      setTopics(topicsRes.data);
    } catch (err: unknown) {
      console.error('Failed to load eligible questions', err);
    } finally {
      setQuestionsLoading(false);
    }
  }

  async function handleAddQuestionToSection(q: Question) {
    if (!paperId || !targetSectionId) return;
    try {
      const revisionId = q.currentRevision?.id;
      if (!revisionId) {
        alert('Question has no immutable revision available');
        return;
      }

      const defaultMarks = Number(q.currentRevision?.marks) || 5;

      await addQuestionSlot(paperId, targetSectionId, {
        questionId: q.id,
        revisionId,
        allocatedMarks: defaultMarks,
        sequenceOrder: 0,
      });

      // Update paper state
      await loadPaper();
      setSuccessMessage(`Added question to section`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: unknown) {
      handleOperationError(err, 'Failed to add question to section');
    }
  }

  // Paper submit
  async function handleSubmitPaper() {
    if (!paperId || !paper) return;
    if (validation && !validation.valid) {
      alert('Paper has validation errors that must be resolved before submission.');
      return;
    }

    if (!confirm('Submit this question paper for formal approval? Once submitted, the draft cannot be edited.'))
      return;

    setSubmitting(true);
    try {
      await submitExamPaper(paperId, 'Draft completed and submitted via Paper Builder');
      setSuccessMessage('Question paper successfully submitted!');
      await loadPaper();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  // Filtered questions for the picker
  const filteredQuestions = questions.filter((q) => {
    const rev = q.currentRevision;
    if (!rev) return false;

    if (searchQuery.trim()) {
      const text = rev.questionText.toLowerCase();
      if (!text.includes(searchQuery.toLowerCase())) return false;
    }
    if (selectedTopicId) {
      const hasTopic = rev.topics?.some((tm) => tm.id === selectedTopicId);
      if (!hasTopic) return false;
    }
    if (selectedDifficulty && rev.difficulty !== selectedDifficulty) {
      return false;
    }
    return true;
  });

  const isDraft = paper?.status === 'DRAFT';
  const configMarks = Number(paper?.config.totalMarks || 0);
  const achievableMarks = validation?.achievableMarks ?? 0;
  const printedMarks = validation?.printedMarks ?? 0;
  const isMarksMatching = Math.abs(achievableMarks - configMarks) <= 0.01;

  if (loading) {
    return (
      <div className="py-20 text-center text-body text-ink-muted">
        Loading question paper workspace...
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="space-y-4">
        <ErrorMessage message={error || 'Paper not found'} />
        <Link to="/papers">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" />
            Back to Paper List
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link
            to="/papers"
            className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Paper Drafts</span>
          </Link>
        }
        eyebrow={`${paper.config.subject ? `${paper.config.subject.code} — ${paper.config.subject.name}` : 'Paper Blueprint'} • Lock #${paper.concurrencyVersion ?? 0}`}
        title={paper.title}
        badge={
          <div className="flex items-center gap-2">
            <Badge tone={getStatusTone(paper.status)}>{paper.status}</Badge>
            <Badge tone="neutral" className="font-mono">
              v{paper.version}
            </Badge>
          </div>
        }
        description={`Examination: ${paper.config.name}${
          paper.config.durationMinutes ? ` • Duration: ${paper.config.durationMinutes} min` : ''
        }`}
        actions={
          <>
            <Link to={`/papers/${paper.id}/preview`}>
              <Button size="sm" variant="outline">
                <Eye className="size-4" />
                Preview
              </Button>
            </Link>

            <Button
              size="sm"
              variant="outline"
              onClick={() => runValidation()}
              disabled={validating}
            >
              <RefreshCw className={`size-4 ${validating ? 'animate-spin' : ''}`} />
              Revalidate
            </Button>

            {isDraft && (
              <Button
                size="sm"
                variant={validation?.valid ? 'primary' : 'outline'}
                onClick={handleSubmitPaper}
                disabled={submitting || (validation !== null && !validation.valid)}
                title={
                  validation && !validation.valid
                    ? 'Resolve all validation errors before submitting'
                    : 'Submit paper draft for approval'
                }
              >
                <Send className="size-4" />
                {submitting ? 'Submitting...' : 'Submit Paper'}
              </Button>
            )}
          </>
        }
      />

      {conflictError && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-danger/40 bg-danger-soft/40 p-4 text-danger">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span className="text-sm font-medium">{conflictError}</span>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => loadPaper()}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" />
            Reload Paper
          </Button>
        </div>
      )}

      {successMessage && (
        <div className="rounded-control bg-success-soft p-3 text-sm font-medium text-success border border-success/30">
          {successMessage}
        </div>
      )}

      {/* Marks Calculation Banner */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardBody className="p-3">
            <span className="text-meta text-ink-muted">Target Config</span>
            <p className="text-title font-semibold text-ink">{configMarks} marks</p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-3">
            <span className="text-meta text-ink-muted">Achievable Total</span>
            <p
              className={`text-title font-semibold ${
                isMarksMatching ? 'text-success' : 'text-danger'
              }`}
            >
              {achievableMarks} marks
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-3">
            <span className="text-meta text-ink-muted">Printed Total</span>
            <p className="text-title font-semibold text-ink">{printedMarks} marks</p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-3">
            <span className="text-meta text-ink-muted">Questions</span>
            <p className="text-title font-semibold text-ink">
              {validation?.slotCount || 0} slots
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-3">
            <span className="text-meta text-ink-muted">Blueprint Status</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {validation?.valid ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success">Valid</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-danger" />
                  <span className="text-sm font-medium text-danger">
                    Issues ({validation?.issues.filter((i) => i.severity === 'ERROR').length || 0})
                  </span>
                </>
              )}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Main Workspace Layout (Canvas on Left, Validation Panel on Right) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: Sections & Questions Canvas */}
        <div className="space-y-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-section font-semibold text-ink">Sections & Questions</h2>
            {isDraft && (
              <Button size="sm" variant="outline" onClick={openAddSectionModal}>
                <Plus className="h-4 w-4" />
                Add Section
              </Button>
            )}
          </div>

          {paper.sections.length === 0 ? (
            <Card>
              <CardBody className="py-12 text-center">
                <Layers className="mx-auto h-12 w-12 text-ink-faint" />
                <h3 className="mt-3 text-title font-medium text-ink">No sections defined</h3>
                <p className="mt-1 text-body text-ink-muted">
                  Add a section to begin assigning questions to this paper.
                </p>
                {isDraft && (
                  <Button className="mt-4" onClick={openAddSectionModal}>
                    <Plus className="h-4 w-4" />
                    Add First Section
                  </Button>
                )}
              </CardBody>
            </Card>
          ) : (
            paper.sections.map((sec) => {
              const secSummary = validation?.sectionSummaries.find(
                (s) => s.sectionId === sec.id,
              );
              return (
                <Card key={sec.id} className="overflow-hidden border border-line">
                  {/* Section Header */}
                  <div className="flex flex-col gap-2 border-b border-line bg-canvas-deep/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-surface px-2 py-0.5 font-bold text-ink">
                          {sec.sectionLabel}
                        </span>
                        <h3 className="font-semibold text-ink text-body">{sec.title}</h3>
                        {sec.requiredAnswers ? (
                          <Badge tone="accent">
                            Choice: Answer {sec.requiredAnswers} of {sec.slots.length}
                          </Badge>
                        ) : (
                          <Badge tone="neutral">All Mandatory</Badge>
                        )}
                      </div>
                      {sec.description && (
                        <p className="mt-1 text-sm text-ink-muted">{sec.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right text-sm">
                        <span className="text-ink-muted">Section: </span>
                        <strong className="text-ink">
                          {secSummary?.achievableMarks ?? Number(sec.sectionMarks)} marks
                        </strong>
                        {secSummary?.isOptionalChoice && (
                          <span className="text-xs text-ink-muted block">
                            (Printed: {secSummary.printedMarks})
                          </span>
                        )}
                      </div>

                      {isDraft && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditSectionModal(sec)}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteSection(sec.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section Question Slots */}
                  <CardBody className="p-4 space-y-3">
                    {sec.slots.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-ink-muted">
                        <p>No questions assigned to this section.</p>
                        {isDraft && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2"
                            onClick={() => openQuestionPicker(sec.id)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Select Questions from Bank
                          </Button>
                        )}
                      </div>
                    ) : (
                      sec.slots.map((slot, slotIdx) => (
                        <div
                          key={slot.id}
                          className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-ink-faint sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div className="flex items-start gap-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-canvas-deep text-xs font-bold text-ink">
                              Q{slotIdx + 1}
                            </span>
                            <div className="space-y-1">
                              <p className="text-body text-ink font-medium">
                                {slot.revision.questionText}
                              </p>
                              <div className="flex flex-wrap items-center gap-2 pt-0.5">
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
                                    className="rounded bg-canvas-deep px-1.5 py-0.5 text-xs text-ink-muted"
                                  >
                                    {tm.topic.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <div className="flex items-center gap-1">
                              <label
                                htmlFor={`marks-${slot.id}`}
                                className="text-xs text-ink-muted whitespace-nowrap"
                              >
                                Marks:
                              </label>
                              <input
                                id={`marks-${slot.id}`}
                                type="number"
                                min="0.5"
                                step="0.5"
                                disabled={!isDraft}
                                defaultValue={Number(slot.allocatedMarks)}
                                onBlur={(e) =>
                                  handleUpdateSlotMarks(
                                    sec.id,
                                    slot.id,
                                    parseFloat(e.target.value),
                                  )
                                }
                                className="w-16 rounded border border-line px-2 py-1 text-sm text-center font-semibold text-ink focus:border-accent focus:outline-none disabled:bg-canvas-deep"
                              />
                            </div>

                            {isDraft && (
                              <button
                                type="button"
                                onClick={() => handleRemoveSlot(sec.id, slot.id)}
                                className="p-1 text-ink-muted hover:text-danger"
                                title="Remove question from paper"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {isDraft && sec.slots.length > 0 && (
                      <div className="pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openQuestionPicker(sec.id)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add Question to Section {sec.sectionLabel}
                        </Button>
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>

        {/* Right Column: Validation, Coverage & Rules Inspector */}
        <div className="space-y-4">
          <Card className="border border-line">
            <CardHeader className="p-3 border-b border-line bg-canvas-deep/50">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Validation & Findings</h3>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTab('validation')}
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      activeTab === 'validation'
                        ? 'bg-surface text-ink shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Issues
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('syllabus')}
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      activeTab === 'syllabus'
                        ? 'bg-surface text-ink shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Syllabus
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('summary')}
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      activeTab === 'summary'
                        ? 'bg-surface text-ink shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Summary
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardBody className="p-4 space-y-4 max-h-[700px] overflow-y-auto">
              {activeTab === 'validation' && (
                <div className="space-y-3">
                  {!validation || validation.issues.length === 0 ? (
                    <div className="py-6 text-center text-sm text-ink-muted">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-success mb-2" />
                      <p className="font-medium text-ink">All validation checks passed</p>
                      <p className="text-xs mt-1">This question paper satisfies all configured rules.</p>
                    </div>
                  ) : (
                    validation.issues.map((issue, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg border p-3 text-xs ${
                          issue.severity === 'ERROR'
                            ? 'border-danger/30 bg-danger-soft/30 text-danger'
                            : issue.severity === 'WARNING'
                            ? 'border-warning/30 bg-warning-soft/30 text-ink'
                            : 'border-accent/30 bg-accent-soft/30 text-ink'
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {issue.severity === 'ERROR' ? (
                            <AlertCircle className="h-4 w-4 shrink-0 text-danger" />
                          ) : issue.severity === 'WARNING' ? (
                            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
                          ) : (
                            <Info className="h-4 w-4 shrink-0 text-accent" />
                          )}
                          <div>
                            <span className="font-semibold uppercase tracking-wider text-[10px]">
                              {issue.severity}: {issue.code}
                            </span>
                            <p className="mt-0.5 text-ink leading-relaxed">{issue.message}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'syllabus' && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-ink uppercase tracking-wider">
                    Syllabus Topic Distribution
                  </h4>
                  {!validation || validation.syllabusTopicCoverage.length === 0 ? (
                    <p className="text-xs text-ink-muted py-4 text-center">
                      No topic mappings identified in the current selection.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {validation.syllabusTopicCoverage.map((t) => (
                        <div
                          key={t.topicId}
                          className="rounded-lg border border-line p-2.5 bg-canvas-deep/30"
                        >
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-ink">{t.topicName}</span>
                            <span className="font-bold text-accent">{t.allocatedMarks} marks</span>
                          </div>
                          <div className="flex justify-between text-[11px] text-ink-muted mt-1">
                            <span>{t.questionCount} question(s)</span>
                            <span>
                              {((t.allocatedMarks / (validation.achievableMarks || 1)) * 100).toFixed(0)}% of paper
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'summary' && (
                <div className="space-y-3 text-xs">
                  <div className="rounded-lg border border-line p-3 space-y-2 bg-canvas-deep/30">
                    <p className="font-semibold text-ink">Difficulty Distribution</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-surface rounded p-1.5 border border-line">
                        <span className="text-success font-bold text-sm">
                          {validation?.difficultyDistribution?.EASY || 0}
                        </span>
                        <p className="text-[10px] text-ink-muted">Easy</p>
                      </div>
                      <div className="bg-surface rounded p-1.5 border border-line">
                        <span className="text-warning font-bold text-sm">
                          {validation?.difficultyDistribution?.MEDIUM || 0}
                        </span>
                        <p className="text-[10px] text-ink-muted">Medium</p>
                      </div>
                      <div className="bg-surface rounded p-1.5 border border-line">
                        <span className="text-danger font-bold text-sm">
                          {validation?.difficultyDistribution?.HARD || 0}
                        </span>
                        <p className="text-[10px] text-ink-muted">Hard</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-line p-3 space-y-1 bg-canvas-deep/30">
                    <p className="font-semibold text-ink">Paper Blueprint Specs</p>
                    <p className="text-ink-muted">Config: {paper.config.name}</p>
                    <p className="text-ink-muted">Subject: {paper.config.subject?.name}</p>
                    <p className="text-ink-muted">Target Marks: {configMarks} marks</p>
                    <p className="text-ink-muted">
                      Passing Marks: {Number(paper.config.passingMarks || 0)} marks
                    </p>
                    <p className="text-ink-muted">
                      Duration: {paper.config.durationMinutes || 'Not set'} min
                    </p>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Modal: Add/Edit Section */}
      <Modal
        isOpen={isSectionModalOpen}
        onClose={() => setIsSectionModalOpen(false)}
        title={editingSection ? 'Edit Section Rules' : 'Add Paper Section'}
        description="Configure section label, instructions, and optional-choice rules."
      >
        <form onSubmit={handleSaveSection} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <TextInput
              label="Label"
              value={sectionLabel}
              onChange={(e) => setSectionLabel(e.target.value)}
              placeholder="e.g. A"
              required
            />
            <div className="col-span-2">
              <TextInput
                label="Section Title"
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
                placeholder="e.g. Multiple Choice Questions"
                required
              />
            </div>
          </div>

          <TextArea
            label="Section Instructions (Optional)"
            value={sectionDescription}
            onChange={(e) => setSectionDescription(e.target.value)}
            placeholder="e.g. Answer any THREE questions. All questions carry equal marks."
            rows={2}
          />

          <TextInput
            label="Required Answers (Optional Choice)"
            type="number"
            min="1"
            value={requiredAnswers}
            onChange={(e) => setRequiredAnswers(e.target.value)}
            placeholder="Leave blank if all questions mandatory"
            helperText="e.g. Set to 3 if students must answer any 3 questions out of the section."
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsSectionModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {editingSection ? 'Save Section Changes' : 'Create Section'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Question Bank Picker */}
      <Modal
        isOpen={isQuestionPickerOpen}
        onClose={() => setIsQuestionPickerOpen(false)}
        title="Select Questions from Question Bank"
        description={`Browsing authorized questions for ${paper.config.subject?.name || 'this subject'}`}
        maxWidth="xl"
      >
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <TextInput
                label="Search"
                placeholder="Search question text or keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Select
              label="Topic"
              value={selectedTopicId}
              onChange={(e) => setSelectedTopicId(e.target.value)}
            >
              <option value="">All Topics</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>

            <Select
              label="Difficulty"
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
            >
              <option value="">All Difficulties</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </Select>
          </div>

          {/* Question Results List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-line rounded-lg border border-line">
            {questionsLoading ? (
              <div className="py-12 text-center text-sm text-ink-muted">
                Loading eligible questions...
              </div>
            ) : filteredQuestions.length === 0 ? (
              <div className="py-12 text-center text-sm text-ink-muted">
                No questions found matching your filter criteria.
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const rev = q.currentRevision;
                if (!rev) return null;
                return (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-3 transition-colors hover:bg-canvas-deep/30"
                  >
                    <div className="space-y-1 pr-4">
                      <p className="text-sm font-medium text-ink line-clamp-2">
                        {rev.questionText}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                        <Badge tone="neutral">{rev.questionType}</Badge>
                        {rev.difficulty && (
                          <Badge
                            tone={
                              rev.difficulty === 'EASY'
                                ? 'success'
                                : rev.difficulty === 'HARD'
                                ? 'danger'
                                : 'warning'
                            }
                          >
                            {rev.difficulty}
                          </Badge>
                        )}
                        <span>Default: {Number(rev.marks)} marks</span>
                        {rev.topics?.map((tm) => (
                          <span key={tm.id} className="text-ink-soft">
                            #{tm.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleAddQuestionToSection(q)}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setIsQuestionPickerOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
