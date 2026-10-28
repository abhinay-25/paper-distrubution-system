import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  History,
  GitCompare,
  Edit2,
  Calendar,
  User,
  Tag,
  ArrowRight,
} from 'lucide-react';
import { PageHeader, Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ErrorMessage, Skeleton } from '../components/ui/Feedback';
import { fetchQuestion, fetchQuestionRevisions } from '../lib/api';
import type { Question, QuestionRevision, Difficulty, QuestionType } from '../types/academic';

export function QuestionRevisionsPage() {
  const { questionId } = useParams<{ questionId: string }>();

  const [question, setQuestion] = useState<Question | null>(null);
  const [revisions, setRevisions] = useState<QuestionRevision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Comparison selector states
  const [revisionAId, setRevisionAId] = useState<string>('');
  const [revisionBId, setRevisionBId] = useState<string>('');

  const loadData = useCallback(async () => {
    if (!questionId) return;

    try {
      setLoading(true);
      setError(null);

      const [qData, revsData] = await Promise.all([
        fetchQuestion(questionId),
        fetchQuestionRevisions(questionId),
      ]);

      setQuestion(qData);
      // Sort newest first
      const sorted = [...revsData.data].sort((a, b) => b.revisionNumber - a.revisionNumber);
      setRevisions(sorted);

      if (sorted.length >= 2) {
        setRevisionAId(sorted[1].id); // previous revision
        setRevisionBId(sorted[0].id); // newest revision
      } else if (sorted.length === 1) {
        setRevisionAId(sorted[0].id);
        setRevisionBId(sorted[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load question revisions');
    } finally {
      setLoading(false);
    }
  }, [questionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const revA = revisions.find((r) => r.id === revisionAId);
  const revB = revisions.find((r) => r.id === revisionBId);

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

  const formatQuestionType = (type: QuestionType) => {
    switch (type) {
      case 'MULTIPLE_CHOICE':
        return 'Multiple Choice';
      case 'SHORT_ANSWER':
        return 'Short Answer';
      case 'LONG_ANSWER':
        return 'Long Answer';
      case 'CODE':
        return 'Code';
      case 'NUMERICAL':
        return 'Numerical';
      default:
        return type;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardBody className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="space-y-6">
        <Link
          to="/questions"
          className="inline-flex items-center gap-1.5 text-meta text-ink-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Back to Question Bank
        </Link>
        <ErrorMessage message={error || 'Question not found'} retry={() => loadData()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
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
        eyebrow={`Question ID: ${question.id.slice(0, 8)}... • Current v${question.currentRevisionNumber}`}
        title="Revision History & Diff"
        description="Revisions are strictly append-only and immutable. Compare past versions and inspect modification history."
        actions={
          <Link to={`/questions/${question.id}/edit`}>
            <Button variant="primary">
              <Edit2 className="size-4" />
              Edit Current Version
            </Button>
          </Link>
        }
      />

      {/* Revisions Comparison / Diff Tool */}
      {revisions.length >= 2 && (
        <Card>
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
            <div className="flex items-center gap-2 font-medium text-ink">
              <GitCompare className="size-5 text-accent" />
              <span>Side-by-Side Revision Comparison</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="text-meta font-medium text-ink-soft">Compare</span>
                <select
                  value={revisionAId}
                  onChange={(e) => setRevisionAId(e.target.value)}
                  className="rounded-control border border-line-strong bg-surface-raised px-2.5 py-1 text-support text-ink"
                >
                  {revisions.map((r) => (
                    <option key={r.id} value={r.id}>
                      v{r.revisionNumber} ({new Date(r.createdAt).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <ArrowRight className="size-4 text-ink-muted shrink-0" />

              <div className="flex items-center gap-2">
                <span className="text-meta font-medium text-ink-soft">With</span>
                <select
                  value={revisionBId}
                  onChange={(e) => setRevisionBId(e.target.value)}
                  className="rounded-control border border-line-strong bg-surface-raised px-2.5 py-1 text-support text-ink"
                >
                  {revisions.map((r) => (
                    <option key={r.id} value={r.id}>
                      v{r.revisionNumber} ({new Date(r.createdAt).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardHeader>

          <CardBody className="pt-4">
            {revA && revB ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Revision A Card */}
                <div className="rounded-card border border-line bg-canvas-deep/30 p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral" className="font-mono text-support font-semibold">
                        v{revA.revisionNumber}
                      </Badge>
                      <span className="text-meta text-ink-muted">
                        {new Date(revA.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {revA.revisionNumber === question.currentRevisionNumber && (
                      <Badge tone="accent">Current Active</Badge>
                    )}
                  </div>

                  {/* Metadata Row */}
                  <div className="grid grid-cols-2 gap-2 text-meta">
                    <div>
                      <span className="text-ink-muted">Marks: </span>
                      <span className="font-mono font-medium text-ink">
                        {Number(revA.marks).toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Difficulty: </span>
                      <Badge tone={getDifficultyBadgeTone(revA.difficulty)}>
                        {revA.difficulty || 'Unspecified'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-ink-muted">Type: </span>
                      <span className="font-medium text-ink">
                        {formatQuestionType(revA.questionType)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Author: </span>
                      <span className="font-mono text-[11px] text-ink">
                        {revA.authorId ? `${revA.authorId.slice(0, 8)}...` : 'System'}
                      </span>
                    </div>
                  </div>

                  {/* Topics */}
                  <div className="space-y-1">
                    <span className="text-meta font-medium text-ink-muted">Topics:</span>
                    <div className="flex flex-wrap gap-1">
                      {revA.topics.length === 0 ? (
                        <span className="text-meta text-ink-muted italic">None</span>
                      ) : (
                        revA.topics.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded bg-surface-raised border border-line text-ink-soft"
                          >
                            {t.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Question Prompt */}
                  <div className="space-y-1.5">
                    <span className="text-label font-medium text-ink-soft">Question Text</span>
                    <div className="min-h-32 rounded-control border border-line bg-surface-raised p-3 text-body text-ink whitespace-pre-wrap font-sans">
                      {revA.questionText}
                    </div>
                  </div>

                  {/* Explanation */}
                  {revA.explanation && (
                    <div className="space-y-1.5">
                      <span className="text-label font-medium text-ink-soft">Explanation / Rubric</span>
                      <div className="rounded-control border border-line bg-surface-raised p-3 text-body text-ink whitespace-pre-wrap font-sans">
                        {revA.explanation}
                      </div>
                    </div>
                  )}
                </div>

                {/* Revision B Card */}
                <div className="rounded-card border border-line bg-canvas-deep/30 p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-line pb-2">
                    <div className="flex items-center gap-2">
                      <Badge tone="neutral" className="font-mono text-support font-semibold">
                        v{revB.revisionNumber}
                      </Badge>
                      <span className="text-meta text-ink-muted">
                        {new Date(revB.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {revB.revisionNumber === question.currentRevisionNumber && (
                      <Badge tone="accent">Current Active</Badge>
                    )}
                  </div>

                  {/* Metadata Row */}
                  <div className="grid grid-cols-2 gap-2 text-meta">
                    <div>
                      <span className="text-ink-muted">Marks: </span>
                      <span
                        className={`font-mono font-medium ${
                          revB.marks !== revA.marks ? 'text-accent font-bold' : 'text-ink'
                        }`}
                      >
                        {Number(revB.marks).toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Difficulty: </span>
                      <Badge tone={getDifficultyBadgeTone(revB.difficulty)}>
                        {revB.difficulty || 'Unspecified'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-ink-muted">Type: </span>
                      <span
                        className={`font-medium ${
                          revB.questionType !== revA.questionType ? 'text-accent font-bold' : 'text-ink'
                        }`}
                      >
                        {formatQuestionType(revB.questionType)}
                      </span>
                    </div>
                    <div>
                      <span className="text-ink-muted">Author: </span>
                      <span className="font-mono text-[11px] text-ink">
                        {revB.authorId ? `${revB.authorId.slice(0, 8)}...` : 'System'}
                      </span>
                    </div>
                  </div>

                  {/* Topics */}
                  <div className="space-y-1">
                    <span className="text-meta font-medium text-ink-muted">Topics:</span>
                    <div className="flex flex-wrap gap-1">
                      {revB.topics.length === 0 ? (
                        <span className="text-meta text-ink-muted italic">None</span>
                      ) : (
                        revB.topics.map((t) => (
                          <span
                            key={t.id}
                            className="inline-flex items-center text-[11px] px-1.5 py-0.5 rounded bg-surface-raised border border-line text-ink-soft"
                          >
                            {t.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Question Prompt */}
                  <div className="space-y-1.5">
                    <span className="text-label font-medium text-ink-soft">Question Text</span>
                    <div
                      className={`min-h-32 rounded-control border bg-surface-raised p-3 text-body text-ink whitespace-pre-wrap font-sans ${
                        revB.questionText !== revA.questionText
                          ? 'border-accent/40 bg-accent-soft/10'
                          : 'border-line'
                      }`}
                    >
                      {revB.questionText}
                    </div>
                  </div>

                  {/* Explanation */}
                  {revB.explanation && (
                    <div className="space-y-1.5">
                      <span className="text-label font-medium text-ink-soft">Explanation / Rubric</span>
                      <div
                        className={`rounded-control border bg-surface-raised p-3 text-body text-ink whitespace-pre-wrap font-sans ${
                          revB.explanation !== revA.explanation
                            ? 'border-accent/40 bg-accent-soft/10'
                            : 'border-line'
                        }`}
                      >
                        {revB.explanation}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      )}

      {/* Full Revision History Timeline */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-section font-semibold text-ink">
          <History className="size-5 text-accent" />
          <span>Complete Revision Timeline ({revisions.length} total)</span>
        </div>

        <div className="space-y-4">
          {revisions.map((rev) => (
            <Card key={rev.id} className="overflow-hidden">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-line pb-3 bg-canvas-deep/20">
                <div className="flex items-center gap-3">
                  <Badge tone="neutral" className="font-mono text-support font-semibold">
                    v{rev.revisionNumber}
                  </Badge>
                  {rev.revisionNumber === question.currentRevisionNumber && (
                    <Badge tone="accent">Current Active</Badge>
                  )}
                  <span className="flex items-center gap-1.5 text-meta text-ink-muted">
                    <Calendar className="size-3.5" />
                    {new Date(rev.createdAt).toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-2 mt-2 sm:mt-0">
                  <span className="flex items-center gap-1 text-meta text-ink-muted">
                    <User className="size-3.5" />
                    {rev.authorId ? `Author: ${rev.authorId.slice(0, 8)}...` : 'Author: System'}
                  </span>
                </div>
              </CardHeader>

              <CardBody className="space-y-4 pt-4">
                {/* Meta badges */}
                <div className="flex flex-wrap items-center gap-3 border-b border-line pb-3">
                  <div className="text-support">
                    <span className="text-ink-muted text-meta">Type: </span>
                    <span className="font-medium text-ink">
                      {formatQuestionType(rev.questionType)}
                    </span>
                  </div>
                  <div className="text-support">
                    <span className="text-ink-muted text-meta">Marks: </span>
                    <span className="font-mono font-medium text-ink">
                      {Number(rev.marks).toFixed(1)}
                    </span>
                  </div>
                  <div className="text-support">
                    <span className="text-ink-muted text-meta">Difficulty: </span>
                    <Badge tone={getDifficultyBadgeTone(rev.difficulty)}>
                      {rev.difficulty || 'Unspecified'}
                    </Badge>
                  </div>
                  {rev.topics.length > 0 && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Tag className="size-3.5 text-ink-muted" />
                      <div className="flex flex-wrap gap-1">
                        {rev.topics.map((t) => (
                          <span
                            key={t.id}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-canvas-deep text-ink-soft"
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Question Prompt */}
                <div className="space-y-1">
                  <h4 className="text-meta font-medium text-ink-muted uppercase tracking-wider">
                    Question Prompt
                  </h4>
                  <div className="p-3 rounded-control bg-canvas-deep/40 text-body text-ink whitespace-pre-wrap font-sans">
                    {rev.questionText}
                  </div>
                </div>

                {/* Explanation */}
                {rev.explanation && (
                  <div className="space-y-1">
                    <h4 className="text-meta font-medium text-ink-muted uppercase tracking-wider">
                      Explanation / Rubric
                    </h4>
                    <div className="p-3 rounded-control bg-canvas-deep/40 text-body text-ink whitespace-pre-wrap font-sans">
                      {rev.explanation}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
