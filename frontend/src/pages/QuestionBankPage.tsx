import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  BookOpen,
  Edit2,
  History,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Filter,
  Sparkles,
} from 'lucide-react';
import { PageHeader, Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { TextInput, Select } from '../components/ui/FormControls';
import { Table, Th, Td } from '../components/ui/Table';
import { EmptyState, ErrorMessage, Skeleton } from '../components/ui/Feedback';
import { fetchQuestions, fetchSubjects, fetchTopics } from '../lib/api';
import type {
  Question,
  Subject,
  Topic,
  QuestionType,
  Difficulty,
  QuestionLifecycle,
} from '../types/academic';
import { useInstitution } from '../context/InstitutionContext';

export function QuestionBankPage() {
  const { institutionId } = useInstitution();

  // Data states
  const [questions, setQuestions] = useState<Question[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(15);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [selectedType, setSelectedType] = useState<QuestionType | ''>('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | ''>('');
  const [selectedLifecycle, setSelectedLifecycle] = useState<QuestionLifecycle | ''>('');

  // Load subjects once for dropdown
  useEffect(() => {
    async function loadSubjectsList() {
      try {
        const res = await fetchSubjects({ pageSize: 100 });
        setSubjects(res.data);
      } catch (err: unknown) {
        console.error('Failed to load subjects for filter:', err);
      }
    }
    loadSubjectsList();
  }, [institutionId]);

  // Load topics when subject is selected
  useEffect(() => {
    async function loadSubjectTopics() {
      if (!selectedSubjectId) {
        setTopics([]);
        setSelectedTopicId('');
        return;
      }
      try {
        const res = await fetchTopics(selectedSubjectId);
        setTopics(res.data.filter((t) => t.status === 'ACTIVE'));
      } catch (err: unknown) {
        console.error('Failed to load topics for subject:', err);
      }
    }
    loadSubjectTopics();
  }, [selectedSubjectId]);

  // Fetch questions
  const loadQuestions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetchQuestions({
        search: search.trim() || undefined,
        subjectId: selectedSubjectId || undefined,
        topicId: selectedTopicId || undefined,
        questionType: (selectedType as QuestionType) || undefined,
        difficulty: (selectedDifficulty as Difficulty) || undefined,
        lifecycle: (selectedLifecycle as QuestionLifecycle) || undefined,
        page: currentPage,
        pageSize,
      });

      setQuestions(res.data);
      setTotalCount(res.total);
      setTotalPages(res.totalPages || 1);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load questions');
    } finally {
      setLoading(false);
    }
  }, [
    search,
    selectedSubjectId,
    selectedTopicId,
    selectedType,
    selectedDifficulty,
    selectedLifecycle,
    currentPage,
    pageSize,
    institutionId,
  ]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const handleResetFilters = () => {
    setSearch('');
    setSelectedSubjectId('');
    setSelectedTopicId('');
    setSelectedType('');
    setSelectedDifficulty('');
    setSelectedLifecycle('');
    setCurrentPage(1);
  };

  const getDifficultyBadgeTone = (diff: Difficulty | null | undefined) => {
    switch (diff) {
      case 'EASY':
        return 'success';
      case 'MEDIUM':
        return 'warning';
      case 'HARD':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const getLifecycleBadgeTone = (lifecycle: QuestionLifecycle) => {
    switch (lifecycle) {
      case 'APPROVED':
        return 'success';
      case 'IN_REVIEW':
        return 'warning';
      case 'ARCHIVED':
        return 'danger';
      case 'DRAFT':
      default:
        return 'neutral';
    }
  };

  const formatQuestionType = (type: QuestionType) => {
    switch (type) {
      case 'MULTIPLE_CHOICE':
        return 'MCQ';
      case 'SHORT_ANSWER':
        return 'Short';
      case 'LONG_ANSWER':
        return 'Long';
      case 'CODE':
        return 'Code';
      case 'NUMERICAL':
        return 'Num';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        eyebrow="Academic Repository"
        title="Question Bank"
        description="Browse, author, and manage institutional questions with revision tracking and optimistic concurrency."
        actions={
          <>
            <Link to="/questions/generate">
              <Button variant="outline">
                <Sparkles className="size-4 text-accent" />
                Generate with AI
              </Button>
            </Link>
            <Link to="/questions/new">
              <Button variant="primary">
                <Plus className="size-4" />
                New Question
              </Button>
            </Link>
          </>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2 border-b border-line pb-3 text-label font-medium text-ink-soft">
            <Filter className="size-4 text-accent" />
            <span>Filter Repository</span>
            {(search ||
              selectedSubjectId ||
              selectedTopicId ||
              selectedType ||
              selectedDifficulty ||
              selectedLifecycle) && (
              <span className="ml-auto text-meta text-ink-muted">Filters active</span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
            <div className="md:col-span-5">
              <TextInput
                label="Search"
                placeholder="Search question text or keywords..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            <div className="md:col-span-4">
              <Select
                label="Subject"
                value={selectedSubjectId}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value);
                  setSelectedTopicId('');
                  setCurrentPage(1);
                }}
              >
                <option value="">All Subjects</option>
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.code} — {sub.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="md:col-span-3">
              <Select
                label="Topic"
                value={selectedTopicId}
                disabled={!selectedSubjectId || topics.length === 0}
                onChange={(e) => {
                  setSelectedTopicId(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">
                  {!selectedSubjectId
                    ? 'Select Subject first'
                    : topics.length === 0
                    ? 'No topics available'
                    : 'All Topics'}
                </option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Type"
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value as QuestionType | '');
                setCurrentPage(1);
              }}
            >
              <option value="">All Types</option>
              <option value="MULTIPLE_CHOICE">Multiple Choice</option>
              <option value="SHORT_ANSWER">Short Answer</option>
              <option value="LONG_ANSWER">Long Answer</option>
              <option value="CODE">Code</option>
              <option value="NUMERICAL">Numerical</option>
            </Select>

            <Select
              label="Difficulty"
              value={selectedDifficulty}
              onChange={(e) => {
                setSelectedDifficulty(e.target.value as Difficulty | '');
                setCurrentPage(1);
              }}
            >
              <option value="">All Difficulties</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </Select>

            <Select
              label="Status"
              value={selectedLifecycle}
              onChange={(e) => {
                setSelectedLifecycle(e.target.value as QuestionLifecycle | '');
                setCurrentPage(1);
              }}
            >
              <option value="">All Lifecycles</option>
              <option value="DRAFT">Draft</option>
              <option value="IN_REVIEW">In Review</option>
              <option value="APPROVED">Approved</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-meta text-ink-muted">
              Showing {questions.length} of {totalCount} questions
            </span>
            <Button variant="outline" size="sm" onClick={handleResetFilters}>
              <RotateCcw className="size-3.5" />
              Reset Filters
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Main Content / Table */}
      {error && <ErrorMessage message={error} retry={() => loadQuestions()} />}

      {loading ? (
        <Card>
          <CardBody className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </CardBody>
        </Card>
      ) : questions.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={BookOpen}
              title="No questions found"
              description={
                search || selectedSubjectId || selectedType || selectedDifficulty || selectedLifecycle
                  ? 'No questions match the current filter criteria. Try adjusting or resetting your filters.'
                  : 'Get started by authoring your first question in the institutional repository.'
              }
              action={
                search || selectedSubjectId || selectedType || selectedDifficulty || selectedLifecycle ? (
                  <Button variant="outline" onClick={handleResetFilters}>
                    Clear Filters
                  </Button>
                ) : (
                  <Link to="/questions/new">
                    <Button variant="primary">
                      <Plus className="size-4" />
                      Create First Question
                    </Button>
                  </Link>
                )
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          <Table>
            <thead>
              <tr>
                <Th className="min-w-64">Question</Th>
                <Th>Subject & Topics</Th>
                <Th>Type</Th>
                <Th className="text-right">Marks</Th>
                <Th>Difficulty</Th>
                <Th>Status</Th>
                <Th>Revision</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => {
                const rev = q.currentRevision;
                return (
                  <tr key={q.id} className="hover:bg-canvas-deep/50 transition-colors">
                    <Td className="font-normal">
                      <div className="space-y-1">
                        <p className="line-clamp-2 text-body font-medium text-ink">
                          {rev?.questionText || '(No content)'}
                        </p>
                        <span className="font-mono text-[11px] text-ink-muted">
                          ID: {q.id.slice(0, 8)}...
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-1 items-start">
                        {q.subject && (
                          <Badge tone="accent">
                            {q.subject.code}
                          </Badge>
                        )}
                        {rev?.topics && rev.topics.length > 0 && (
                          <div className="flex flex-wrap gap-1 max-w-48">
                            {rev.topics.map((t) => (
                              <span
                                key={t.id}
                                className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded bg-canvas-deep text-ink-muted"
                                title={t.name}
                              >
                                {t.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <span className="font-medium text-ink-soft">
                        {rev ? formatQuestionType(rev.questionType) : '—'}
                      </span>
                    </Td>
                    <Td className="text-right font-mono font-medium">
                      {rev ? Number(rev.marks).toFixed(1) : '—'}
                    </Td>
                    <Td>
                      {rev?.difficulty ? (
                        <Badge tone={getDifficultyBadgeTone(rev.difficulty)}>
                          {rev.difficulty}
                        </Badge>
                      ) : (
                        <span className="text-ink-muted text-meta">—</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={getLifecycleBadgeTone(q.lifecycle)}>
                        {q.lifecycle.replace('_', ' ')}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone="neutral" className="font-mono">
                        v{q.currentRevisionNumber}
                      </Badge>
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 justify-end">
                        <Link
                          to={`/questions/${q.id}/edit`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-label text-ink hover:text-accent font-medium rounded hover:bg-canvas-deep transition-colors"
                          title="Edit question"
                        >
                          <Edit2 className="size-3.5" />
                          <span>Edit</span>
                        </Link>
                        <Link
                          to={`/questions/${q.id}/revisions`}
                          className="inline-flex items-center gap-1 px-2 py-1 text-label text-ink-muted hover:text-ink font-medium rounded hover:bg-canvas-deep transition-colors"
                          title="View revision history"
                        >
                          <History className="size-3.5" />
                          <span>History</span>
                        </Link>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-line pt-4 px-1">
              <div className="text-meta text-ink-muted">
                Page <span className="font-medium text-ink">{currentPage}</span> of{' '}
                <span className="font-medium text-ink">{totalPages}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
