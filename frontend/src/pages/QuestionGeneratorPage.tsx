import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Edit3,
  ExternalLink,
  FileCheck2,
  History,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  Tag,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader } from '../components/ui/Card';
import { ErrorMessage } from '../components/ui/Feedback';
import { Select, TextArea, TextInput } from '../components/ui/FormControls';
import { Modal } from '../components/ui/Modal';
import { Table, Td, Th } from '../components/ui/Table';
import {
  createGenerationJob,
  fetchGenerationJobs,
  fetchGeneratedQuestions,
  fetchTopics,
  fetchSubjects,
  fetchSourceDocuments,
  reviewGeneratedQuestion,
} from '../lib/api';
import type {
  Difficulty,
  GeneratedQuestion,
  GenerationJob,
  QuestionType,
  Subject,
  Topic,
} from '../types/academic';
import type { SourceDocument } from '../types/sourceDocument';


const QUESTION_TYPES: { value: QuestionType; label: string; description: string }[] = [
  { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice', description: '4 choices (A, B, C, D) with single correct answer' },
  { value: 'SHORT_ANSWER', label: 'Short Answer', description: 'Direct conceptual or definitional response (2-4 sentences)' },
  { value: 'LONG_ANSWER', label: 'Long Answer', description: 'In-depth analytical or comprehensive examination essay' },
  { value: 'NUMERICAL', label: 'Numerical / Problem', description: 'Quantitative problem with calculations and unit steps' },
];

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: 'EASY', label: 'Easy (Foundational / Recall)' },
  { value: 'MEDIUM', label: 'Medium (Application / Analysis)' },
  { value: 'HARD', label: 'Hard (Complex / Evaluation)' },
];

export function QuestionGeneratorPage() {
  // Navigation / views
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');

  // Subjects & Topics state
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<string>('');
  const [loadingSubjects, setLoadingSubjects] = useState<boolean>(true);

  // Form input state
  const [questionType, setQuestionType] = useState<QuestionType>('MULTIPLE_CHOICE');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('MEDIUM');
  const [count, setCount] = useState<number>(3);
  const [language, setLanguage] = useState<string>('en');
  const [contextHint, setContextHint] = useState<string>('');

  // RAG / Source Document Grounding state
  const [useRag, setUseRag] = useState<boolean>(false);
  const [availableDocuments, setAvailableDocuments] = useState<SourceDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [loadingDocs, setLoadingDocs] = useState<boolean>(false);

  // Generation status state
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const isGeneratingRef = useRef<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Active Job & Results state
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [loadingJobQuestions, setLoadingJobQuestions] = useState<boolean>(false);

  // History state
  const [historyJobs, setHistoryJobs] = useState<GenerationJob[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Review Modals state
  const [reviewModalQuestion, setReviewModalQuestion] = useState<GeneratedQuestion | null>(null);
  const [reviewMode, setReviewMode] = useState<'APPROVE' | 'EDIT' | 'REJECT' | null>(null);
  const [assignedMarks, setAssignedMarks] = useState<number>(5);
  const [assignedTopicIds, setAssignedTopicIds] = useState<string[]>([]);
  const [editedText, setEditedText] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Load available subjects on mount
  useEffect(() => {
    async function loadSubjects() {
      try {
        setLoadingSubjects(true);
        const res = await fetchSubjects({ status: 'ACTIVE', pageSize: 100 });
        setSubjects(res.data);
        if (res.data.length > 0 && !selectedSubjectId) {
          setSelectedSubjectId(res.data[0].id);
        }
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : 'Failed to load subjects');
      } finally {
        setLoadingSubjects(false);
      }
    }
    loadSubjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load topics whenever selectedSubjectId changes
  useEffect(() => {
    if (!selectedSubjectId) {
      setTopics([]);
      setSelectedTopicId('');
      return;
    }
    async function loadTopics() {
      try {
        const res = await fetchTopics(selectedSubjectId);
        setTopics(res.data || []);
      } catch {
        setTopics([]);
      }
    }
    loadTopics();
  }, [selectedSubjectId]);

  // Load source documents whenever selectedSubjectId changes
  useEffect(() => {
    async function loadDocuments() {
      try {
        setLoadingDocs(true);
        const docs = await fetchSourceDocuments();
        setAvailableDocuments(docs);
        // Pre-select indexed documents that match the current subject (or all if none match specifically)
        const matchingIds = docs
          .filter((d) => d.status === 'INDEXED' && (!selectedSubjectId || d.subjectId === selectedSubjectId))
          .map((d) => d.id);
        setSelectedDocIds(matchingIds);
      } catch {
        setAvailableDocuments([]);
        setSelectedDocIds([]);
      } finally {
        setLoadingDocs(false);
      }
    }
    void loadDocuments();
  }, [selectedSubjectId]);

  // Load history jobs when switching to history tab
  const loadHistory = useCallback(async () => {
    try {
      setLoadingHistory(true);
      const res = await fetchGenerationJobs({ pageSize: 30 });
      setHistoryJobs(res.data);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to load generation job history');
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  // Submit Generation Request
  const handleStartGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGeneratingRef.current) {
      return;
    }
    setFormError(null);

    if (!selectedSubjectId) {
      setFormError('Please select a subject');
      return;
    }

    if (count < 1 || count > 20) {
      setFormError('Question count must be between 1 and 20');
      return;
    }

    try {
      isGeneratingRef.current = true;
      setIsGenerating(true);
      const isRagActive = useRag && selectedDocIds.length > 0;
      const job = await createGenerationJob({
        subjectId: selectedSubjectId,
        topicId: selectedTopicId || undefined,
        questionType,
        difficulty: difficulty || undefined,
        count,
        language: language.trim() || 'en',
        contextHint: contextHint.trim() || undefined,
        useRag: isRagActive,
        sourceDocumentIds: isRagActive ? selectedDocIds : undefined,
      });

      setCurrentJob(job);
      // Fetch generated questions for this job
      const qRes = await fetchGeneratedQuestions(job.id);
      setGeneratedQuestions(qRes.data);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Question generation failed');
    } finally {
      isGeneratingRef.current = false;
      setIsGenerating(false);
    }
  };

  // Select an existing job from history
  const handleSelectJob = async (job: GenerationJob) => {
    try {
      setLoadingJobQuestions(true);
      setCurrentJob(job);
      setActiveTab('create');
      const qRes = await fetchGeneratedQuestions(job.id);
      setGeneratedQuestions(qRes.data);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to load questions for job');
    } finally {
      setLoadingJobQuestions(false);
    }
  };

  // Open Review Dialog
  const openReviewDialog = (q: GeneratedQuestion, mode: 'APPROVE' | 'EDIT' | 'REJECT') => {
    setReviewModalQuestion(q);
    setReviewMode(mode);
    setAssignedMarks(q.questionType === 'MULTIPLE_CHOICE' ? 2 : q.questionType === 'SHORT_ANSWER' ? 5 : 10);
    setAssignedTopicIds(selectedTopicId ? [selectedTopicId] : []);
    setEditedText(q.questionText);
    setReviewNotes('');
    setReviewError(null);
  };

  // Submit Review
  const handleConfirmReview = async () => {
    if (!currentJob || !reviewModalQuestion || !reviewMode) return;
    setReviewError(null);

    if (reviewMode === 'APPROVE' || reviewMode === 'EDIT') {
      if (!assignedMarks || assignedMarks <= 0) {
        setReviewError('Marks must be a positive number');
        return;
      }
    }

    if (reviewMode === 'EDIT' && !editedText.trim()) {
      setReviewError('Question text cannot be empty');
      return;
    }

    try {
      setSubmittingReview(true);
      const updated = await reviewGeneratedQuestion(currentJob.id, reviewModalQuestion.id, {
        reviewAction: reviewMode === 'APPROVE' ? 'APPROVED' : reviewMode === 'EDIT' ? 'EDITED' : 'REJECTED',
        marks: reviewMode !== 'REJECT' ? assignedMarks : undefined,
        topicIds: reviewMode !== 'REJECT' ? assignedTopicIds : undefined,
        editedQuestionText: reviewMode === 'EDIT' ? editedText.trim() : undefined,
        reviewNotes: reviewNotes.trim() || undefined,
      });

      // Update question list locally
      setGeneratedQuestions((prev) =>
        prev.map((q) => (q.id === updated.id ? { ...q, ...updated } : q)),
      );

      setReviewModalQuestion(null);
      setReviewMode(null);
    } catch (err: unknown) {
      setReviewError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setSubmittingReview(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI-Assisted Authoring"
        title="AI Question Generator"
        description="Generate syllabus-aligned examination question candidates using intelligent generative models. All AI outputs are strictly suggestions requiring faculty review and marks allocation."
        actions={
          <div className="flex items-center gap-1 rounded-control bg-canvas-deep p-1">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`rounded-control px-3 py-1.5 text-label font-medium transition-colors ${
                activeTab === 'create'
                  ? 'bg-surface-raised text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Generator Form
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 rounded-control px-3 py-1.5 text-label font-medium transition-colors ${
                activeTab === 'history'
                  ? 'bg-surface-raised text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              <History className="size-3.5" />
              Past Batches
            </button>
          </div>
        }
      />

      {formError && <ErrorMessage message={formError} />}

      {/* Main Content Area */}
      {activeTab === 'history' ? (
        /* History View */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-section font-semibold text-ink">Previous Question Generation Jobs</h2>
            <Button variant="outline" size="sm" onClick={loadHistory} disabled={loadingHistory}>
              <RefreshCw className={`size-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {loadingHistory ? (
            <Card>
              <CardBody className="py-12 text-center text-ink-muted">
                <Loader2 className="size-6 animate-spin mx-auto mb-2 text-accent" />
                Loading history jobs...
              </CardBody>
            </Card>
          ) : historyJobs.length === 0 ? (
            <Card>
              <CardBody className="p-8 text-center text-ink-muted">
                <Sparkles className="size-8 mx-auto mb-2 text-ink-faint" />
                No generation batches recorded yet. Run your first generation from the Generator tab.
              </CardBody>
            </Card>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Subject</Th>
                  <Th>Type</Th>
                  <Th>Difficulty</Th>
                  <Th>Count</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {historyJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-canvas-deep/40 transition-colors">
                    <Td className="font-medium text-ink">
                      {job.subject?.name || 'Subject'}
                      <span className="block text-meta text-ink-muted">{job.subject?.code}</span>
                    </Td>
                    <Td className="text-ink-muted">{job.questionType.replace('_', ' ')}</Td>
                    <Td>
                      <Badge tone={job.difficulty === 'HARD' ? 'danger' : job.difficulty === 'MEDIUM' ? 'warning' : 'neutral'}>
                        {job.difficulty || 'AUTO'}
                      </Badge>
                    </Td>
                    <Td className="text-ink-muted">
                      {job._count?.generatedQuestions ?? job.count} questions
                    </Td>
                    <Td>
                      <Badge tone={job.status === 'COMPLETED' ? 'success' : job.status === 'FAILED' ? 'danger' : 'accent'}>
                        {job.status}
                      </Badge>
                    </Td>
                    <Td className="text-meta text-ink-muted">
                      {new Date(job.createdAt).toLocaleDateString()} {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Td>
                    <Td className="text-right">
                      <Button variant="outline" size="sm" onClick={() => handleSelectJob(job)}>
                        View Batch
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      ) : (
        /* Create / Active Generation View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Configuration Form */}
          <Card className="lg:col-span-5">
            <CardHeader className="border-b border-line pb-4">
              <h2 className="text-section font-semibold text-ink flex items-center gap-2">
                <Sparkles className="size-4 text-accent" />
                Generation Parameters
              </h2>
              <p className="mt-1 text-meta text-ink-muted">
                Specify academic topic context and constraints.
              </p>
            </CardHeader>

            <CardBody>
              <form onSubmit={handleStartGeneration} className="space-y-4">
                <Select
                  label="Subject"
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  disabled={loadingSubjects || isGenerating}
                  required
                >
                  {subjects.length === 0 ? (
                    <option value="">No subjects available</option>
                  ) : (
                    subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} — {s.name}
                      </option>
                    ))
                  )}
                </Select>

                <Select
                  label="Syllabus Topic (Optional)"
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                  disabled={isGenerating}
                >
                  <option value="">All Topics in Subject</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Question Type"
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                  disabled={isGenerating}
                  helperText={QUESTION_TYPES.find((qt) => qt.value === questionType)?.description}
                >
                  {QUESTION_TYPES.map((qt) => (
                    <option key={qt.value} value={qt.value}>
                      {qt.label}
                    </option>
                  ))}
                </Select>

                <Select
                  label="Target Difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}
                  disabled={isGenerating}
                >
                  <option value="">Balanced / Model Decides</option>
                  {DIFFICULTIES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>

                {/* Question Count */}
                <div className="space-y-1.5">
                  <TextInput
                    label="Question Count (1 to 20)"
                    type="number"
                    min={1}
                    max={20}
                    value={count}
                    onChange={(e) => setCount(parseInt(e.target.value, 10) || 1)}
                    disabled={isGenerating}
                  />
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="text-meta text-ink-muted mr-1">Quick select:</span>
                    {[1, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCount(num)}
                        disabled={isGenerating}
                        className={`px-2.5 py-1 text-meta rounded-control border transition-colors ${
                          count === num
                            ? 'border-accent bg-accent-soft text-accent-ink font-semibold'
                            : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <Select
                  label="Language (BCP-47)"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={isGenerating}
                >
                  <option value="en">English (en)</option>
                  <option value="hi">Hindi (hi)</option>
                  <option value="es">Spanish (es)</option>
                  <option value="fr">French (fr)</option>
                  <option value="de">German (de)</option>
                </Select>

                <TextArea
                  label={`Faculty Focus Hint (Optional — ${contextHint.length}/500)`}
                  rows={3}
                  maxLength={500}
                  value={contextHint}
                  onChange={(e) => setContextHint(e.target.value)}
                  disabled={isGenerating}
                  placeholder="e.g. Focus on TCP sliding window protocol and contrast with Stop-and-Wait..."
                />

                {/* RAG Grounding Section */}
                <div className="rounded-control border border-line bg-canvas-deep/50 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={useRag}
                        onChange={(e) => setUseRag(e.target.checked)}
                        disabled={isGenerating}
                        className="rounded border-line text-accent focus:ring-accent size-4 cursor-pointer"
                      />
                      <span className="text-support font-semibold text-ink flex items-center gap-1.5">
                        <BookOpen className="size-4 text-accent" />
                        Syllabus Grounding (RAG)
                      </span>
                    </label>
                    <Badge tone={useRag ? 'accent' : 'neutral'}>
                      {useRag ? 'RAG Enabled' : 'Off'}
                    </Badge>
                  </div>
                  <p className="text-meta text-ink-muted leading-relaxed">
                    Retrieve semantic passages from uploaded course textbooks, syllabi, and notes to ground questions in actual materials.
                  </p>

                  {useRag && (
                    <div className="space-y-2 pt-2 border-t border-line">
                      <div className="flex items-center justify-between text-meta">
                        <span className="font-medium text-ink-soft">
                          Available Sources ({availableDocuments.filter((d) => d.status === 'INDEXED').length} indexed)
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const indexedIds = availableDocuments
                                .filter((d) => d.status === 'INDEXED')
                                .map((d) => d.id);
                              setSelectedDocIds(indexedIds);
                            }}
                            className="text-accent hover:underline text-xs"
                          >
                            Select All
                          </button>
                          <span className="text-ink-faint">|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedDocIds([])}
                            className="text-accent hover:underline text-xs"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {loadingDocs ? (
                        <div className="flex items-center gap-2 text-meta text-ink-muted py-2">
                          <Loader2 className="size-3.5 animate-spin text-accent" />
                          Loading sources...
                        </div>
                      ) : availableDocuments.length === 0 ? (
                        <div className="rounded-control bg-warning/10 border border-warning/20 p-2.5 text-meta text-warning flex items-start gap-2">
                          <AlertCircle className="size-4 shrink-0 mt-0.5" />
                          <div>
                            No source documents uploaded yet.{' '}
                            <Link to="/source-documents" className="font-semibold underline hover:text-warning/80">
                              Upload documents
                            </Link>{' '}
                            first or generation will proceed without document grounding.
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                          {availableDocuments.map((doc) => {
                            const isIndexed = doc.status === 'INDEXED';
                            const isSelected = selectedDocIds.includes(doc.id);
                            return (
                              <label
                                key={doc.id}
                                className={`flex items-start gap-2.5 p-2 rounded-control border text-meta transition-colors cursor-pointer ${
                                  !isIndexed
                                    ? 'bg-canvas-deep/30 border-line opacity-60 cursor-not-allowed'
                                    : isSelected
                                    ? 'bg-accent-soft/30 border-accent/40 text-ink'
                                    : 'bg-surface border-line text-ink-muted hover:border-line-strong'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={!isIndexed || isGenerating}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedDocIds((prev) => [...prev, doc.id]);
                                    } else {
                                      setSelectedDocIds((prev) => prev.filter((id) => id !== doc.id));
                                    }
                                  }}
                                  className="mt-0.5 rounded border-line text-accent focus:ring-accent size-3.5 cursor-pointer"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-ink truncate max-w-[180px]">{doc.title}</span>
                                    <Badge
                                      tone={
                                        doc.status === 'INDEXED'
                                          ? 'success'
                                          : doc.status === 'PROCESSING' || doc.status === 'UPLOADED'
                                          ? 'accent'
                                          : 'danger'
                                      }
                                    >
                                      {doc.status}
                                    </Badge>
                                  </div>
                                  <div className="text-ink-faint text-xs flex items-center gap-2 mt-0.5">
                                    <span>{doc.originalFilename}</span>
                                    {isIndexed && <span>• {doc.chunkCount} chunks</span>}
                                    {doc.subject && <span>• {doc.subject.code}</span>}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}

                      {useRag && selectedDocIds.length === 0 && availableDocuments.some((d) => d.status === 'INDEXED') && (
                        <p className="text-xs text-warning flex items-center gap-1">
                          <AlertCircle className="size-3 shrink-0" />
                          No indexed documents selected. Standard AI generation will be used.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  disabled={isGenerating || subjects.length === 0}
                  className="w-full justify-center"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Generating Questions...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" />
                      Generate Candidate Questions
                    </>
                  )}
                </Button>
              </form>
            </CardBody>
          </Card>

          {/* Right Column: Output / Review Panel */}
          <div className="lg:col-span-7 space-y-6">
            {isGenerating ? (
              /* Generating Active State */
              <div className="rounded-card border border-accent/20 bg-accent/5 p-12 text-center">
                <Loader2 className="size-10 animate-spin text-accent mx-auto mb-4" />
                <h3 className="text-lg font-medium text-ink">Synthesizing Question Candidates</h3>
                <p className="mt-1 text-support text-ink-muted max-w-md mx-auto">
                  The AI model is generating rigorous questions according to university syllabus rules and structured Bloom's taxonomy.
                </p>
                <div className="mt-6 flex justify-center gap-2">
                  <Badge tone="accent">Strict Schema Validation</Badge>
                  <Badge tone="neutral">Advisory Mode</Badge>
                </div>
              </div>
            ) : currentJob ? (
              /* Display Current Batch */
              <div className="space-y-6">
                {/* Batch Header Bar */}
                <div className="rounded-card border border-line bg-surface p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">Batch Results:</span>
                      <Badge tone={currentJob.status === 'COMPLETED' ? 'success' : currentJob.status === 'FAILED' ? 'danger' : 'accent'}>
                        {currentJob.status}
                      </Badge>
                      {currentJob.groundingMode === 'document' ? (
                        <Badge tone="accent">Syllabus-Grounded (RAG)</Badge>
                      ) : (
                        <Badge tone="neutral">Standard AI Generation</Badge>
                      )}
                      <span className="text-meta text-ink-muted">
                        ({generatedQuestions.length} candidates)
                      </span>
                    </div>
                    {currentJob.aiModel && (
                      <div className="mt-1 text-meta text-ink-muted">
                        Provider: <span className="font-medium text-ink-soft">{currentJob.aiProvider}</span> ({currentJob.aiModel})
                        {currentJob.durationMs && ` • ${currentJob.durationMs}ms`}
                      </div>
                    )}
                  </div>

                  <Link to="/questions" className="text-meta text-accent hover:underline flex items-center gap-1">
                    Open Question Bank
                    <ExternalLink className="size-3.5" />
                  </Link>
                </div>

                {/* Advisory Notice */}
                <div className="rounded-control bg-warning/10 border border-warning/20 p-3 text-label text-ink flex items-start gap-2.5">
                  <Info className="size-4 text-warning shrink-0 mt-0.5" />
                  <p className="leading-snug">
                    <strong className="font-semibold">Academic Advisory:</strong> AI questions are suggestions only.
                    Faculty review is mandatory before acceptance into the Question Bank. Accepted questions preserve historical revisions.
                  </p>
                </div>

                {/* Candidate Cards */}
                {loadingJobQuestions ? (
                  <div className="py-8 text-center text-ink-muted">
                    <Loader2 className="size-6 animate-spin mx-auto mb-2 text-accent" />
                    Loading questions...
                  </div>
                ) : generatedQuestions.length === 0 ? (
                  <div className="rounded-card border border-line bg-surface p-8 text-center text-ink-muted">
                    No questions returned for this batch.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {generatedQuestions.map((q, index) => (
                      <div
                        key={q.id}
                        className={`rounded-card border p-5 bg-surface transition-all ${
                          q.status === 'APPROVED' || q.status === 'EDITED'
                            ? 'border-success/30 ring-1 ring-success/20 bg-success/5'
                            : q.status === 'REJECTED'
                            ? 'border-line bg-canvas-deep/30 opacity-70'
                            : 'border-line hover:border-line-strong shadow-xs'
                        }`}
                      >
                        {/* Card Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-label text-ink">Candidate #{index + 1}</span>
                            <Badge tone="neutral">{q.questionType.replace('_', ' ')}</Badge>
                            {q.difficulty && (
                              <Badge tone={q.difficulty === 'HARD' ? 'danger' : q.difficulty === 'MEDIUM' ? 'warning' : 'neutral'}>
                                {q.difficulty}
                              </Badge>
                            )}
                            {q.bloomsLevel && (
                              <Badge tone="accent">Bloom: {q.bloomsLevel}</Badge>
                            )}
                          </div>

                          <div>
                            <Badge
                              tone={
                                q.status === 'APPROVED'
                                  ? 'success'
                                  : q.status === 'EDITED'
                                  ? 'accent'
                                  : q.status === 'REJECTED'
                                  ? 'neutral'
                                  : 'warning'
                              }
                            >
                              {q.status}
                            </Badge>
                          </div>
                        </div>

                        {/* Question Text */}
                        <div className="mb-4 text-support font-medium text-ink whitespace-pre-line leading-relaxed">
                          {q.questionText}
                        </div>

                        {/* Suggested Answer */}
                        {q.suggestedAnswer && (
                          <div className="mb-3 rounded-control bg-canvas-deep/70 p-3 text-label">
                            <div className="font-semibold text-meta uppercase tracking-wider text-ink-muted mb-1">
                              Suggested Answer / Key:
                            </div>
                            <div className="text-ink font-mono text-label whitespace-pre-line">
                              {q.suggestedAnswer}
                            </div>
                          </div>
                        )}

                        {/* Explanation */}
                        {q.explanation && (
                          <div className="mb-3 rounded-control bg-accent/5 border border-accent/10 p-3 text-label text-ink-soft">
                            <span className="font-semibold text-accent">Rationale / Solution: </span>
                            {q.explanation}
                          </div>
                        )}

                        {/* Source Document Provenance (RAG) */}
                        {q.metadata?.sources && q.metadata.sources.length > 0 && (
                          <div className="mb-3 rounded-control bg-accent/5 border border-accent/20 p-3 text-label">
                            <div className="flex items-center gap-1.5 font-semibold text-meta uppercase tracking-wider text-accent mb-2">
                              <BookOpen className="size-3.5" />
                              Grounding Sources ({q.metadata.sources.length} retrieved excerpts)
                            </div>
                            <div className="space-y-1.5">
                              {q.metadata.sources.map((src, sIdx) => (
                                <div
                                  key={src.chunkId || sIdx}
                                  className="flex flex-wrap items-center justify-between gap-2 text-meta bg-surface px-2.5 py-1.5 rounded-control border border-line"
                                >
                                  <div className="flex items-center gap-1.5 truncate max-w-sm">
                                    <FileCheck2 className="size-3.5 text-accent shrink-0" />
                                    <span className="font-medium text-ink truncate">
                                      {src.documentTitle}
                                    </span>
                                    {src.pageNumber && (
                                      <span className="text-ink-muted text-xs">
                                        (Page {src.pageNumber})
                                      </span>
                                    )}
                                  </div>
                                  <Badge tone="accent">
                                    {typeof src.similarityScore === 'number'
                                      ? `${(src.similarityScore * 100).toFixed(0)}% relevance`
                                      : 'Matched'}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Subject Tags */}
                        {q.subjectTags && q.subjectTags.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mb-4">
                            <Tag className="size-3 text-ink-muted" />
                            {q.subjectTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-canvas-deep px-2 py-0.5 text-meta text-ink-muted font-medium"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Review Status or Action Buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line">
                          {q.status === 'PENDING' ? (
                            <>
                              <div className="text-meta text-ink-muted">
                                Review to promote into Question Bank
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openReviewDialog(q, 'REJECT')}
                                  className="text-danger hover:bg-danger/10 border-danger/30"
                                >
                                  <ThumbsDown className="size-3.5" />
                                  Reject
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openReviewDialog(q, 'EDIT')}
                                >
                                  <Edit3 className="size-3.5" />
                                  Edit & Add
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => openReviewDialog(q, 'APPROVE')}
                                >
                                  <ThumbsUp className="size-3.5" />
                                  Approve & Add
                                </Button>
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center justify-between w-full text-meta">
                              <span className="text-ink-muted">
                                {q.reviewedAt && `Reviewed on ${new Date(q.reviewedAt).toLocaleDateString()}`}
                                {q.reviewNotes && ` — "${q.reviewNotes}"`}
                              </span>
                              {q.promotedQuestionId && (
                                <Link
                                  to={`/questions/${q.promotedQuestionId}/revisions`}
                                  className="text-accent font-medium hover:underline flex items-center gap-1"
                                >
                                  <CheckCircle2 className="size-3.5 text-success" />
                                  View in Question Bank
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Idle Empty State */
              <div className="rounded-card border border-line bg-surface p-12 text-center text-ink-muted shadow-xs">
                <div className="flex size-14 items-center justify-center rounded-full bg-accent/10 text-accent mx-auto mb-4">
                  <Sparkles className="size-7" />
                </div>
                <h3 className="text-lg font-semibold text-ink">Ready to Generate</h3>
                <p className="mt-2 text-support text-ink-muted max-w-md mx-auto">
                  Configure your subject and parameters on the left and click <strong>Generate Candidate Questions</strong>.
                  All outputs will be structured here for your review and approval.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Faculty Review Modal */}
      {reviewModalQuestion && reviewMode && (
        <Modal
          isOpen={true}
          onClose={() => {
            setReviewModalQuestion(null);
            setReviewMode(null);
          }}
          title={
            reviewMode === 'APPROVE'
              ? 'Approve and Add to Question Bank'
              : reviewMode === 'EDIT'
              ? 'Edit and Add to Question Bank'
              : 'Reject Question Candidate'
          }
          maxWidth={reviewMode === 'EDIT' ? 'lg' : 'md'}
        >
          <div className="space-y-4">
            {reviewError && <ErrorMessage message={reviewError} />}

            {reviewMode === 'REJECT' ? (
              <div>
                <p className="text-support text-ink-muted mb-3">
                  This suggestion will not be added to the Question Bank. It will be permanently marked as rejected for audit purposes.
                </p>
                <TextArea
                  label="Rejection Reason (Optional)"
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g. Question is off-syllabus for current semester..."
                />
              </div>
            ) : (
              <>
                {reviewMode === 'EDIT' && (
                  <TextArea
                    label="Edited Question Statement"
                    rows={6}
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="font-mono"
                    required
                  />
                )}

                <TextInput
                  label="Allocated Examination Marks"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="100"
                  value={assignedMarks}
                  onChange={(e) => setAssignedMarks(parseFloat(e.target.value) || 1)}
                  helperText="Required for Question Bank storage and exam blueprint assembly."
                  required
                />

                <TextInput
                  label="Review / Modification Notes (Optional)"
                  type="text"
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="e.g. Corrected phrasing of options"
                />
              </>
            )}

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
              <Button
                variant="outline"
                size="md"
                onClick={() => {
                  setReviewModalQuestion(null);
                  setReviewMode(null);
                }}
                disabled={submittingReview}
              >
                Cancel
              </Button>
              <Button
                variant={reviewMode === 'REJECT' ? 'destructive' : 'primary'}
                size="md"
                onClick={handleConfirmReview}
                disabled={submittingReview}
              >
                {submittingReview ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Processing...
                  </>
                ) : reviewMode === 'REJECT' ? (
                  'Confirm Rejection'
                ) : (
                  'Confirm & Add to Bank'
                )}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
