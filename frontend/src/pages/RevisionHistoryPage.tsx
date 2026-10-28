import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, Tag, FileText } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ErrorMessage, Skeleton } from '../components/ui/Feedback';
import { fetchQuestion, fetchQuestionRevisions } from '../lib/api';
import type { Question, QuestionRevision, Difficulty } from '../types/academic';

const DIFFICULTY_TONES: Record<Difficulty, 'success' | 'warning' | 'danger'> = {
  EASY: 'success',
  MEDIUM: 'warning',
  HARD: 'danger',
};

export function RevisionHistoryPage() {
  const { questionId } = useParams<{ questionId: string }>();

  const [question, setQuestion] = useState<Question | null>(null);
  const [revisions, setRevisions] = useState<QuestionRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected revision for preview
  const [selectedRevision, setSelectedRevision] = useState<QuestionRevision | null>(null);

  const loadData = useCallback(async () => {
    if (!questionId) return;
    try {
      setLoading(true);
      setError(null);
      const [q, revRes] = await Promise.all([
        fetchQuestion(questionId),
        fetchQuestionRevisions(questionId),
      ]);
      setQuestion(q);
      const sorted = [...revRes.data].sort((a, b) => b.revisionNumber - a.revisionNumber);
      setRevisions(sorted);
      setSelectedRevision(sorted[0] ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load revision history');
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72 rounded-control" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-card" />
          <Skeleton className="h-96 rounded-card lg:col-span-2" />
        </div>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="space-y-4">
        <Link
          to="/questions"
          className="inline-flex items-center gap-1.5 text-support text-ink-muted hover:text-ink transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Question Bank
        </Link>
        <ErrorMessage>{error ?? 'Question not found'}</ErrorMessage>
      </div>
    );
  }

  return (
    <div>
      {/* Back nav */}
      <nav className="mb-4 flex items-center gap-3">
        <Link
          to="/questions"
          className="inline-flex items-center gap-1.5 text-support text-ink-muted hover:text-ink transition-colors"
        >
          <ChevronLeft className="size-4" />
          Question Bank
        </Link>
        <ChevronRight className="size-3.5 text-ink-faint" />
        <Link
          to={`/questions/${question.id}/edit`}
          className="text-support text-ink-muted hover:text-ink transition-colors"
        >
          Question
        </Link>
        <ChevronRight className="size-3.5 text-ink-faint" />
        <span className="text-support text-ink font-medium">Revision History</span>
      </nav>

      <PageHeader
        title="Revision History"
        description={`${revisions.length} revision${revisions.length !== 1 ? 's' : ''} · Current revision: ${question.currentRevisionNumber}`}
        actions={
          <Link to={`/questions/${question.id}/edit`}>
            <Button variant="secondary">Edit Question</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Revision list */}
        <div className="space-y-2">
          <h2 className="text-label font-semibold uppercase tracking-wider text-ink-muted">
            Revisions
          </h2>
          {revisions.length === 0 ? (
            <p className="text-support text-ink-muted">No revisions yet.</p>
          ) : (
            <div className="space-y-1.5">
              {revisions.map((rev) => {
                const isCurrent = rev.revisionNumber === question.currentRevisionNumber;
                const isSelected = selectedRevision?.id === rev.id;
                return (
                  <button
                    key={rev.id}
                    type="button"
                    onClick={() => setSelectedRevision(rev)}
                    className={`w-full rounded-card border px-4 py-3 text-left transition-all ${
                      isSelected
                        ? 'border-accent bg-accent-soft'
                        : 'border-line bg-surface-raised hover:border-line-strong'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-support font-semibold ${isSelected ? 'text-accent-ink' : 'text-ink'}`}
                      >
                        Revision {rev.revisionNumber}
                      </span>
                      {isCurrent && (
                        <Badge tone="accent">Current</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-meta text-ink-muted">
                      {new Date(rev.createdAt).toLocaleString()}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <span className="rounded-full bg-canvas-deep px-2 py-0.5 text-meta text-ink-soft">
                        {rev.questionType.replace('_', ' ')}
                      </span>
                      <span className="rounded-full bg-canvas-deep px-2 py-0.5 text-meta text-ink-soft">
                        {rev.marks} marks
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Preview panel */}
        {selectedRevision ? (
          <div className="space-y-4 lg:col-span-2">
            {/* Meta strip */}
            <Card>
              <CardBody className="flex flex-wrap items-center gap-3 p-4">
                <span className="text-support font-semibold text-ink">
                  Revision {selectedRevision.revisionNumber}
                </span>
                <Badge
                  tone={
                    selectedRevision.difficulty
                      ? DIFFICULTY_TONES[selectedRevision.difficulty]
                      : 'neutral'
                  }
                >
                  {selectedRevision.difficulty ?? 'No difficulty'}
                </Badge>
                <span className="flex items-center gap-1 text-meta text-ink-muted">
                  <Clock className="size-3.5" />
                  {new Date(selectedRevision.createdAt).toLocaleString()}
                </span>
                <span className="flex items-center gap-1 text-meta text-ink-muted">
                  <FileText className="size-3.5" />
                  {selectedRevision.marks} marks
                </span>
                <span className="text-meta text-ink-muted uppercase">{selectedRevision.language}</span>
              </CardBody>
            </Card>

            {/* Question text */}
            <Card>
              <CardBody className="p-5 sm:p-6">
                <h3 className="mb-3 text-label font-semibold uppercase tracking-wider text-ink-muted">
                  Question Text
                </h3>
                <p className="whitespace-pre-wrap text-body text-ink leading-relaxed">
                  {selectedRevision.questionText}
                </p>
              </CardBody>
            </Card>

            {/* Explanation */}
            {selectedRevision.explanation && (
              <Card>
                <CardBody className="p-5 sm:p-6">
                  <h3 className="mb-3 text-label font-semibold uppercase tracking-wider text-ink-muted">
                    Explanation / Model Answer
                  </h3>
                  <p className="whitespace-pre-wrap text-body text-ink-soft leading-relaxed">
                    {selectedRevision.explanation}
                  </p>
                </CardBody>
              </Card>
            )}

            {/* Topics */}
            {selectedRevision.topics.length > 0 && (
              <Card>
                <CardBody className="p-5 sm:p-6">
                  <h3 className="mb-3 flex items-center gap-1.5 text-label font-semibold uppercase tracking-wider text-ink-muted">
                    <Tag className="size-3.5" />
                    Topic Tags
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedRevision.topics.map((t) => (
                      <span
                        key={t.id}
                        className="rounded-full bg-accent-soft px-3 py-1 text-support text-accent-ink"
                      >
                        {t.code ? `${t.code} — ` : ''}{t.name}
                      </span>
                    ))}
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-card border border-dashed border-line-strong p-12 text-ink-muted lg:col-span-2">
            Select a revision to preview its content.
          </div>
        )}
      </div>
    </div>
  );
}
