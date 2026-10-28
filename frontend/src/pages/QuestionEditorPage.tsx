import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Eye,
  Edit3,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Plus,
  Trash2,
  History,
  Layers,
} from 'lucide-react';
import { PageHeader, Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { TextInput, TextArea, Select } from '../components/ui/FormControls';
import { ErrorMessage, Skeleton } from '../components/ui/Feedback';
import {
  fetchQuestion,
  createQuestion,
  updateQuestion,
  fetchSubjects,
  fetchTopics,
  triggerAnalysis,
  fetchAnalyses,
  reviewAnalysis,
  ApiError,
} from '../lib/api';
import type {
  Question,
  Subject,
  Topic,
  QuestionType,
  Difficulty,
  QuestionLifecycle,
  QuestionAnalysis,
  ReviewAnalysisInput,
} from '../types/academic';
import { AIAnalysisPanel, TriggerAnalysisPanel } from '../components/ui/AIAnalysisPanel';
import { useInstitution } from '../context/InstitutionContext';

interface McqOption {
  id: string;
  label: string; // e.g. "A", "B", "C", "D"
  text: string;
  isCorrect: boolean;
}

export function QuestionEditorPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const isEditMode = Boolean(questionId);
  const navigate = useNavigate();
  const { institutionId } = useInstitution();

  // Loading & base state
  const [loading, setLoading] = useState(isEditMode);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [concurrencyConflict, setConcurrencyConflict] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Repository reference lists
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [availableTopics, setAvailableTopics] = useState<Topic[]>([]);

  // Original question data in edit mode
  const [, setOriginalQuestion] = useState<Question | null>(null);
  const [expectedRevisionNumber, setExpectedRevisionNumber] = useState<number>(1);

  // Form states
  const [subjectId, setSubjectId] = useState('');
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [questionType, setQuestionType] = useState<QuestionType>('MULTIPLE_CHOICE');
  const [marks, setMarks] = useState<string>('5.0');
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('MEDIUM');
  const [lifecycle, setLifecycle] = useState<QuestionLifecycle>('DRAFT');
  const [language, setLanguage] = useState('en');
  const [questionText, setQuestionText] = useState('');
  const [explanation, setExplanation] = useState('');

  // Tab preview states
  const [textTab, setTextTab] = useState<'write' | 'preview'>('write');
  const [explanationTab, setExplanationTab] = useState<'write' | 'preview'>('write');

  // AI Analysis state (Step 6)
  const [latestAnalysis, setLatestAnalysis] = useState<QuestionAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // Track current revision id so we can pass it to trigger
  const [currentRevisionId, setCurrentRevisionId] = useState<string | undefined>(undefined);

  // MCQ Options Helper State
  const [mcqOptions, setMcqOptions] = useState<McqOption[]>([
    { id: '1', label: 'A', text: '', isCorrect: false },
    { id: '2', label: 'B', text: '', isCorrect: false },
    { id: '3', label: 'C', text: '', isCorrect: false },
    { id: '4', label: 'D', text: '', isCorrect: false },
  ]);

  // Load available subjects
  useEffect(() => {
    async function loadSubjectsList() {
      try {
        const res = await fetchSubjects({ pageSize: 100 });
        setSubjects(res.data);
      } catch (err: unknown) {
        console.error('Failed to load subjects:', err);
      }
    }
    loadSubjectsList();
  }, [institutionId]);

  // Load topics whenever subject changes
  const loadTopicsForSubject = useCallback(async (sId: string) => {
    if (!sId) {
      setAvailableTopics([]);
      return;
    }
    try {
      const res = await fetchTopics(sId);
      setAvailableTopics(res.data.filter((t) => t.status === 'ACTIVE'));
    } catch (err: unknown) {
      console.error('Failed to load topics for subject:', err);
    }
  }, []);

  useEffect(() => {
    if (subjectId) {
      loadTopicsForSubject(subjectId);
    } else {
      setAvailableTopics([]);
    }
  }, [subjectId, loadTopicsForSubject]);

  // Load question if edit mode
  const loadQuestionData = useCallback(async () => {
    if (!questionId) return;

    try {
      setLoading(true);
      setLoadError(null);
      setConcurrencyConflict(false);

      const q = await fetchQuestion(questionId);
      setOriginalQuestion(q);
      setSubjectId(q.subjectId);
      setLifecycle(q.lifecycle);
      setExpectedRevisionNumber(q.currentRevisionNumber);

      const rev = q.currentRevision;
      if (rev) {
        setQuestionText(rev.questionText);
        setQuestionType(rev.questionType);
        setMarks(String(rev.marks));
        setLanguage(rev.language || 'en');
        setDifficulty(rev.difficulty || '');
        setExplanation(rev.explanation || '');
        setSelectedTopicIds(rev.topics.map((t) => t.id));
        setCurrentRevisionId(rev.id);
      }

      // Load latest analysis for this question
      try {
        const analysesRes = await fetchAnalyses(questionId);
        setLatestAnalysis(analysesRes.data[0] ?? null);
      } catch {
        // Analysis fetch failure is non-fatal
      }
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load question');
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    if (isEditMode) {
      loadQuestionData();
    }
  }, [isEditMode, loadQuestionData]);

  // Topic checkbox toggle
  const toggleTopic = (tId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(tId) ? prev.filter((id) => id !== tId) : [...prev, tId],
    );
  };

  // AI Analysis handlers (Step 6)
  const handleTriggerAnalysis = async (skipDuplicates: boolean) => {
    if (!questionId || !currentRevisionId) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const result = await triggerAnalysis(questionId, {
        revisionId: currentRevisionId,
        skipDuplicateDetection: skipDuplicates,
      });
      setLatestAnalysis(result);
    } catch (e: unknown) {
      setAnalysisError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleReviewAnalysis = async (input: ReviewAnalysisInput) => {
    if (!questionId || !latestAnalysis) return;
    const updated = await reviewAnalysis(questionId, latestAnalysis.id, input);
    setLatestAnalysis(updated);
  };

  const handleRerunAnalysis = async () => {
    await handleTriggerAnalysis(false);
  };

  // MCQ Options Helpers
  const handleOptionChange = (id: string, text: string) => {
    setMcqOptions((prev) => prev.map((opt) => (opt.id === id ? { ...opt, text } : opt)));
  };

  const handleSetCorrectOption = (id: string) => {
    setMcqOptions((prev) =>
      prev.map((opt) => ({
        ...opt,
        isCorrect: opt.id === id,
      })),
    );
  };

  const handleAddOption = () => {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const nextLabel = letters[mcqOptions.length] || `Option ${mcqOptions.length + 1}`;
    setMcqOptions((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        label: nextLabel,
        text: '',
        isCorrect: false,
      },
    ]);
  };

  const handleRemoveOption = (id: string) => {
    if (mcqOptions.length <= 2) return;
    setMcqOptions((prev) => prev.filter((opt) => opt.id !== id));
  };

  const handleInsertMcqIntoQuestion = () => {
    let formatted = questionText.trim();
    if (formatted) formatted += '\n\n';

    mcqOptions.forEach((opt) => {
      if (opt.text.trim()) {
        formatted += `(${opt.label}) ${opt.text.trim()}\n`;
      }
    });

    const correct = mcqOptions.find((opt) => opt.isCorrect);
    if (correct && correct.text.trim()) {
      formatted += `\nCorrect Answer: (${correct.label}) ${correct.text.trim()}`;
    }

    setQuestionText(formatted);
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);
    setConcurrencyConflict(false);

    // Validation
    if (!subjectId) {
      setSubmitError('Please select a subject.');
      return;
    }
    if (!questionText.trim()) {
      setSubmitError('Question text cannot be empty.');
      return;
    }
    const marksNum = parseFloat(marks);
    if (isNaN(marksNum) || marksNum <= 0 || marksNum > 999.99) {
      setSubmitError('Marks must be a positive number up to 999.99.');
      return;
    }

    try {
      setSubmitting(true);

      if (isEditMode && questionId) {
        // Optimistic concurrency update
        await updateQuestion(questionId, {
          questionText: questionText.trim(),
          questionType,
          marks: marksNum,
          language: language.trim() || 'en',
          difficulty: difficulty || null,
          explanation: explanation.trim() || null,
          topicIds: selectedTopicIds,
          lifecycle,
          expectedRevisionNumber,
        });

        setSuccessMessage('Question and new revision successfully saved.');
        // Increment expected revision number
        setExpectedRevisionNumber((prev) => prev + 1);
        setTimeout(() => {
          navigate('/questions');
        }, 800);
      } else {
        // Create new question
        await createQuestion({
          subjectId,
          questionText: questionText.trim(),
          questionType,
          marks: marksNum,
          language: language.trim() || 'en',
          difficulty: difficulty || null,
          explanation: explanation.trim() || undefined,
          topicIds: selectedTopicIds,
          lifecycle,
        });

        setSuccessMessage('Question successfully created.');
        setTimeout(() => {
          navigate('/questions');
        }, 800);
      }
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConcurrencyConflict(true);
        setSubmitError(
          'Optimistic Concurrency Conflict (HTTP 409): Another user or session has updated this question since you loaded it. Your revision number is outdated.',
        );
      } else {
        setSubmitError(
          err instanceof Error ? err.message : 'An unexpected error occurred while saving.',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardBody className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <Link
          to="/questions"
          className="inline-flex items-center gap-1.5 text-meta text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Back to Question Bank
        </Link>
        <ErrorMessage message={loadError} retry={() => loadQuestionData()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Navigation & Header */}
      <PageHeader
        breadcrumb={
          <Link
            to="/questions"
            className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Question Bank</span>
          </Link>
        }
        eyebrow={isEditMode ? `Editing Question v${expectedRevisionNumber}` : 'Authoring'}
        title={isEditMode ? 'Edit Question' : 'Create New Question'}
        description={
          isEditMode
            ? 'Modifications create an immutable revision. Existing revisions are preserved.'
            : 'Define question text, metadata, marks, and topic mappings.'
        }
        actions={
          isEditMode && questionId ? (
            <Link to={`/questions/${questionId}/revisions`}>
              <Button variant="outline" size="sm">
                <History className="size-4" />
                Revision History
              </Button>
            </Link>
          ) : undefined
        }
      />

      {/* Concurrency Conflict Alert Banner */}
      {concurrencyConflict && (
        <div
          role="alert"
          className="rounded-card border border-warning/40 bg-warning-soft/40 p-4 text-ink space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-warning shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-semibold text-body text-ink">Revision Conflict Detected</h4>
              <p className="text-support text-ink-soft">
                Another edit was submitted to this question while you were working. To prevent
                silently overwriting changes, your submission was declined.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1 pl-8">
            <Button
              variant="primary"
              size="sm"
              onClick={() => loadQuestionData()}
            >
              <RotateCcw className="size-3.5" />
              Reload Latest Revision
            </Button>
            <span className="text-meta text-ink-muted">
              (Reloading will fetch the latest text and update expected revision number)
            </span>
          </div>
        </div>
      )}

      {/* Error or Success notification */}
      {submitError && !concurrencyConflict && (
        <ErrorMessage message={submitError} />
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-card border border-success/30 bg-success-soft p-3 text-success text-support font-medium">
          <CheckCircle2 className="size-5 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Core Content (2 spans) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Question Text Box with Markdown Preview Toggle */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2 font-medium text-ink">
                  <Edit3 className="size-4 text-accent" />
                  <span>Question Prompt</span>
                </div>
                <div className="flex items-center gap-1 rounded bg-canvas-deep p-0.5 text-meta">
                  <button
                    type="button"
                    onClick={() => setTextTab('write')}
                    className={`px-2.5 py-1 rounded transition-colors font-medium ${
                      textTab === 'write'
                        ? 'bg-surface-raised text-ink shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setTextTab('preview')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded transition-colors font-medium ${
                      textTab === 'preview'
                        ? 'bg-surface-raised text-ink shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Eye className="size-3.5" />
                    Preview
                  </button>
                </div>
              </CardHeader>

              <CardBody className="space-y-3 pt-4">
                {textTab === 'write' ? (
                  <TextArea
                    label="Question Text"
                    helperText="Supports formatted text, mathematical formulas, and code snippets."
                    rows={8}
                    required
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    placeholder="Enter the complete question prompt here..."
                  />
                ) : (
                  <div className="space-y-2">
                    <span className="text-label font-medium text-ink-soft">Formatted Preview</span>
                    <div className="min-h-48 rounded-control border border-line bg-canvas-deep/40 p-4 text-body text-ink whitespace-pre-wrap font-sans">
                      {questionText.trim() ? (
                        questionText
                      ) : (
                        <span className="italic text-ink-muted">Nothing to preview yet.</span>
                      )}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* MCQ Options Builder (Visible when questionType is MULTIPLE_CHOICE) */}
            {questionType === 'MULTIPLE_CHOICE' && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between border-b border-line pb-3">
                  <div className="flex items-center gap-2 font-medium text-ink">
                    <Layers className="size-4 text-accent" />
                    <span>Multiple Choice Options Builder</span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddOption}
                  >
                    <Plus className="size-3.5" />
                    Add Option
                  </Button>
                </CardHeader>

                <CardBody className="space-y-3 pt-4">
                  <p className="text-meta text-ink-muted">
                    Build choices for this question. Select the radio button to designate the correct answer,
                    then click "Insert into Prompt" to merge into the question text.
                  </p>

                  <div className="space-y-2.5">
                    {mcqOptions.map((opt) => (
                      <div
                        key={opt.id}
                        className="flex items-center gap-3 rounded-control border border-line bg-surface-raised p-2"
                      >
                        <input
                          type="radio"
                          name="correctOption"
                          id={`radio-${opt.id}`}
                          checked={opt.isCorrect}
                          onChange={() => handleSetCorrectOption(opt.id)}
                          className="size-4 text-accent accent-accent focus:ring-accent"
                          title="Mark as correct answer"
                        />
                        <span className="w-6 font-semibold text-center text-ink-soft">
                          {opt.label}.
                        </span>
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => handleOptionChange(opt.id, e.target.value)}
                          placeholder={`Option ${opt.label} text`}
                          className="flex-1 rounded border border-line-strong bg-transparent px-3 py-1.5 text-body text-ink focus:outline-accent"
                        />
                        {opt.isCorrect && (
                          <Badge tone="success" className="shrink-0 text-[11px]">
                            Correct
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(opt.id)}
                          disabled={mcqOptions.length <= 2}
                          className="text-ink-muted hover:text-danger p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Remove option"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleInsertMcqIntoQuestion}
                    >
                      Insert into Question Prompt
                    </Button>
                  </div>
                </CardBody>
              </Card>
            )}

            {/* Explanation / Marking Scheme */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b border-line pb-3">
                <div className="flex items-center gap-2 font-medium text-ink">
                  <CheckCircle2 className="size-4 text-accent" />
                  <span>Explanation & Marking Scheme</span>
                </div>
                <div className="flex items-center gap-1 rounded bg-canvas-deep p-0.5 text-meta">
                  <button
                    type="button"
                    onClick={() => setExplanationTab('write')}
                    className={`px-2.5 py-1 rounded transition-colors font-medium ${
                      explanationTab === 'write'
                        ? 'bg-surface-raised text-ink shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    onClick={() => setExplanationTab('preview')}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded transition-colors font-medium ${
                      explanationTab === 'preview'
                        ? 'bg-surface-raised text-ink shadow-xs'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    <Eye className="size-3.5" />
                    Preview
                  </button>
                </div>
              </CardHeader>

              <CardBody className="space-y-3 pt-4">
                {explanationTab === 'write' ? (
                  <TextArea
                    label="Explanation / Rubric"
                    helperText="Model answer, step-by-step resolution, or grading criteria for evaluators."
                    rows={4}
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder="Enter marking scheme or explanation here..."
                  />
                ) : (
                  <div className="space-y-2">
                    <span className="text-label font-medium text-ink-soft">Preview</span>
                    <div className="min-h-24 rounded-control border border-line bg-canvas-deep/40 p-4 text-body text-ink whitespace-pre-wrap font-sans">
                      {explanation.trim() ? (
                        explanation
                      ) : (
                        <span className="italic text-ink-muted">No explanation provided.</span>
                      )}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Right Column: Metadata & Controls (1 span) */}
          <div className="space-y-6">
            <Card>
              <CardHeader className="border-b border-line pb-3">
                <h3 className="font-medium text-ink">Academic Classification</h3>
              </CardHeader>
              <CardBody className="space-y-4 pt-4">
                <Select
                  label="Subject"
                  required
                  value={subjectId}
                  disabled={isEditMode}
                  helperText={
                    isEditMode
                      ? 'Subject cannot be changed after question creation.'
                      : 'Assign question to an academic course.'
                  }
                  onChange={(e) => {
                    setSubjectId(e.target.value);
                    setSelectedTopicIds([]);
                  }}
                >
                  <option value="">Select a Subject...</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
                </Select>

                <div className="space-y-1.5">
                  <label className="text-label font-medium text-ink-soft">
                    Mapped Topics ({selectedTopicIds.length} selected)
                  </label>
                  {!subjectId ? (
                    <p className="text-meta text-ink-muted italic">
                      Select a subject first to view available syllabus topics.
                    </p>
                  ) : availableTopics.length === 0 ? (
                    <p className="text-meta text-ink-muted italic">
                      No active topics found for this subject. You can add topics in Subjects & Structure.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-control border border-line p-2 bg-canvas-deep/30">
                      {availableTopics.map((topic) => (
                        <label
                          key={topic.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded text-support hover:bg-canvas-deep cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTopicIds.includes(topic.id)}
                            onChange={() => toggleTopic(topic.id)}
                            className="size-4 rounded text-accent accent-accent focus:ring-accent"
                          />
                          <span className="text-ink truncate">{topic.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader className="border-b border-line pb-3">
                <h3 className="font-medium text-ink">Question Parameters</h3>
              </CardHeader>
              <CardBody className="space-y-4 pt-4">
                <Select
                  label="Question Type"
                  value={questionType}
                  onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                >
                  <option value="MULTIPLE_CHOICE">Multiple Choice (MCQ)</option>
                  <option value="SHORT_ANSWER">Short Answer</option>
                  <option value="LONG_ANSWER">Long Answer / Essay</option>
                  <option value="CODE">Programming / Code</option>
                  <option value="NUMERICAL">Numerical / Computation</option>
                </Select>

                <TextInput
                  label="Marks"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="999.99"
                  required
                  value={marks}
                  onChange={(e) => setMarks(e.target.value)}
                  helperText="Maximum score allocated (e.g. 1.0, 5.0, 10.0)"
                />

                <Select
                  label="Difficulty Level"
                  value={difficulty}
                  onChange={(e) => setDifficulty((e.target.value as Difficulty) || '')}
                >
                  <option value="">Unspecified</option>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </Select>

                <Select
                  label="Lifecycle Status"
                  value={lifecycle}
                  onChange={(e) => setLifecycle(e.target.value as QuestionLifecycle)}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="IN_REVIEW">In Review</option>
                  <option value="APPROVED">Approved</option>
                  <option value="ARCHIVED">Archived</option>
                </Select>

                <TextInput
                  label="Language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en"
                  helperText="ISO language code (default: en)"
                />
              </CardBody>
            </Card>

            {/* AI Analysis Panel — Step 6 (edit mode only) */}
            {isEditMode && (
              <Card>
                <CardBody>
                  {latestAnalysis ? (
                    <AIAnalysisPanel
                      analysis={latestAnalysis}
                      onReview={handleReviewAnalysis}
                      onRerun={handleRerunAnalysis}
                    />
                  ) : (
                    <TriggerAnalysisPanel
                      revisionId={currentRevisionId}
                      onTrigger={handleTriggerAnalysis}
                      loading={analysisLoading}
                      error={analysisError}
                    />
                  )}
                </CardBody>
              </Card>
            )}

            {/* Submission Actions */}
            <Card>
              <CardBody className="space-y-3">
                <Button
                  type="submit"
                  variant="primary"
                  className="w-full"
                  disabled={submitting || concurrencyConflict}
                >
                  <Save className="size-4" />
                  {submitting
                    ? 'Saving...'
                    : isEditMode
                    ? `Save as Revision v${expectedRevisionNumber + 1}`
                    : 'Create Question'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/questions')}
                >
                  Cancel
                </Button>
              </CardBody>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}
