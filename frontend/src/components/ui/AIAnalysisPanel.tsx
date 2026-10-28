/**
 * AIAnalysisPanel — Step 6: Question Intelligence
 *
 * Displays AI-generated classification, difficulty estimation, and duplicate
 * detection for a question revision. Provides faculty review controls:
 * Accept, Override (with custom selections), or Dismiss.
 *
 * Design constraints:
 * - All AI results are labelled as "AI Suggestion" — never authoritative.
 * - Faculty review is required before any suggestion affects academic records.
 * - Duplicate alerts are shown prominently with similarity scores.
 * - The panel is read-only once reviewed (ACCEPTED/OVERRIDDEN/DISMISSED).
 */

import { useState } from 'react';
import {
  Brain,
  Zap,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  GitBranch,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Info,
  ThumbsUp,
  ThumbsDown,
  Edit3,
  Loader2,
} from 'lucide-react';
import { Button } from './Button';
import type {
  QuestionAnalysis,
  BloomsLevel,
  Difficulty,
  ReviewAnalysisInput,
} from '../../types/academic';

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const BLOOMS_LABELS: Record<BloomsLevel, string> = {
  REMEMBER: 'Remember',
  UNDERSTAND: 'Understand',
  APPLY: 'Apply',
  ANALYZE: 'Analyze',
  EVALUATE: 'Evaluate',
  CREATE: 'Create',
  UNDETERMINED: 'Undetermined',
};

const DIFFICULTY_HEX: Record<string, string> = {
  EASY: '#2b7149',
  MEDIUM: '#8a5d0a',
  HARD: '#a8362b',
  UNDETERMINED: '#8a867f',
};

// ---------------------------------------------------------------------------
// ConfidenceBar
// ---------------------------------------------------------------------------

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? '#2b7149' : pct >= 50 ? '#8a5d0a' : '#a8362b';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
      <div style={{
        flex: 1, height: '6px',
        background: 'var(--color-canvas-deep)',
        borderRadius: '3px', overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: color, borderRadius: '3px',
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ color: 'var(--color-ink-muted)', minWidth: '2.5rem', textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SimilarityBadge
// ---------------------------------------------------------------------------

function SimilarityBadge({ score, isNear }: { score: number; isNear: boolean }) {
  const pct = Math.round(score * 100);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
      padding: '0.1rem 0.5rem',
      background: isNear ? 'var(--color-danger-soft)' : 'var(--color-warning-soft)',
      border: `1px solid ${isNear ? '#f5a5a0' : '#e4c87e'}`,
      borderRadius: '99px', fontSize: '0.72rem', fontWeight: 600,
      color: isNear ? 'var(--color-danger)' : 'var(--color-warning)',
    }}>
      {isNear && <AlertTriangle size={10} />}
      {pct}% similar
    </span>
  );
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { bg: string; color: string; label: string }> = {
    PENDING: { bg: 'var(--color-warning-soft)', color: 'var(--color-warning)', label: 'Pending Review' },
    ACCEPTED: { bg: 'var(--color-success-soft)', color: 'var(--color-success)', label: 'Accepted' },
    OVERRIDDEN: { bg: 'var(--color-accent-soft)', color: 'var(--color-accent-ink)', label: 'Overridden' },
    DISMISSED: { bg: 'var(--color-canvas-deep)', color: 'var(--color-ink-muted)', label: 'Dismissed' },
  };
  const c = cfg[status] ?? cfg.PENDING;
  return (
    <span style={{
      padding: '0.18rem 0.55rem',
      background: c.bg, borderRadius: '99px',
      fontSize: '0.72rem', fontWeight: 600, color: c.color,
    }}>
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// AIAnalysisPanel
// ---------------------------------------------------------------------------

interface AIAnalysisPanelProps {
  analysis: QuestionAnalysis;
  onReview: (input: ReviewAnalysisInput) => Promise<void>;
  onRerun: () => Promise<void>;
}

export function AIAnalysisPanel({ analysis, onReview, onRerun }: AIAnalysisPanelProps) {
  const [reviewMode, setReviewMode] = useState<'idle' | 'override'>('idle');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [rerunLoading, setRerunLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [showDuplicates, setShowDuplicates] = useState(true);

  // Override form
  const [overrideBloomsLevel, setOverrideBloomsLevel] = useState<BloomsLevel | ''>('');
  const [overrideDifficulty, setOverrideDifficulty] = useState<Difficulty | ''>('');
  const [overrideNotes, setOverrideNotes] = useState('');

  const isReviewed = analysis.reviewStatus !== 'PENDING';
  const nearDuplicates = analysis.duplicateCandidates.filter((d) => d.isNearDuplicate);
  const potentialDuplicates = analysis.duplicateCandidates.filter(
    (d) => !d.isNearDuplicate && d.isPotentialDuplicate,
  );

  async function handleAccept() {
    setReviewLoading(true); setReviewError(null);
    try { await onReview({ reviewAction: 'ACCEPTED' }); }
    catch (e: unknown) { setReviewError(e instanceof Error ? e.message : 'Failed to accept'); }
    finally { setReviewLoading(false); }
  }

  async function handleDismiss() {
    setReviewLoading(true); setReviewError(null);
    try { await onReview({ reviewAction: 'DISMISSED' }); }
    catch (e: unknown) { setReviewError(e instanceof Error ? e.message : 'Failed to dismiss'); }
    finally { setReviewLoading(false); }
  }

  async function handleOverrideSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!overrideBloomsLevel && !overrideDifficulty) {
      setReviewError("Provide at least one override (Bloom's level or difficulty).");
      return;
    }
    setReviewLoading(true); setReviewError(null);
    try {
      await onReview({
        reviewAction: 'OVERRIDDEN',
        ...(overrideBloomsLevel && { facultyBloomsLevel: overrideBloomsLevel }),
        ...(overrideDifficulty && { facultyDifficulty: overrideDifficulty }),
        ...(overrideNotes.trim() && { facultyNotes: overrideNotes.trim() }),
      });
      setReviewMode('idle');
    } catch (e: unknown) { setReviewError(e instanceof Error ? e.message : 'Failed to save override'); }
    finally { setReviewLoading(false); }
  }

  async function handleRerun() {
    setRerunLoading(true);
    try { await onRerun(); } finally { setRerunLoading(false); }
  }

  const selectStyle: React.CSSProperties = {
    width: '100%', padding: '0.45rem 0.6rem',
    border: '1px solid var(--color-line-strong)', borderRadius: '0.5rem',
    fontSize: '0.82rem', background: 'var(--color-surface)',
    color: 'var(--color-ink)', fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Brain size={18} color="var(--color-accent)" />
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--color-ink)' }}>AI Analysis</span>
          <span style={{
            background: 'var(--color-accent-soft)', color: 'var(--color-accent-ink)',
            fontSize: '0.65rem', fontWeight: 700, padding: '0.1rem 0.45rem',
            borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            Suggestion
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <StatusBadge status={analysis.reviewStatus} />
          {isReviewed && (
            <button
              id="ai-analysis-rerun-btn"
              onClick={handleRerun}
              disabled={rerunLoading}
              title="Run new analysis"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.3rem 0.6rem',
                background: 'transparent', border: '1px solid var(--color-line-strong)',
                borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.75rem',
                color: 'var(--color-ink-muted)',
              }}
            >
              {rerunLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
              Re-run
            </button>
          )}
        </div>
      </div>

      {/* Advisory notice */}
      <div style={{
        display: 'flex', gap: '0.5rem', padding: '0.6rem 0.8rem',
        background: 'var(--color-accent-soft)',
        border: '1px solid var(--color-line-strong)',
        borderRadius: '0.625rem', fontSize: '0.78rem', color: 'var(--color-accent-ink)',
      }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>
          AI results are <strong>advisory only</strong>. Faculty review is required before
          suggestions influence any academic record.
          Thresholds: near-duplicate ≥ {Math.round(analysis.nearDuplicateThreshold * 100)}%,
          potential-duplicate ≥ {Math.round(analysis.potentialDuplicateThreshold * 100)}% <em>(provisional)</em>.
        </span>
      </div>

      {/* Near-duplicate alert */}
      {analysis.hasNearDuplicates && (
        <div style={{
          display: 'flex', gap: '0.6rem', padding: '0.75rem 1rem',
          background: 'var(--color-danger-soft)', border: '1px solid #f5a5a0',
          borderRadius: '0.625rem', fontSize: '0.82rem', color: 'var(--color-danger)',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong>Near-duplicate detected!</strong>{' '}
            Very high semantic similarity (≥ {Math.round(analysis.nearDuplicateThreshold * 100)}%)
            with {nearDuplicates.length} existing question{nearDuplicates.length > 1 ? 's' : ''}.
            Faculty review is strongly recommended.
          </div>
        </div>
      )}

      {/* Potential-duplicate alert */}
      {analysis.hasPotentialDuplicates && !analysis.hasNearDuplicates && (
        <div style={{
          display: 'flex', gap: '0.6rem', padding: '0.75rem 1rem',
          background: 'var(--color-warning-soft)', border: '1px solid #e4c87e',
          borderRadius: '0.625rem', fontSize: '0.82rem', color: 'var(--color-warning)',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <strong>Potential duplicates found.</strong>{' '}
            Moderate similarity with {potentialDuplicates.length} existing question{potentialDuplicates.length > 1 ? 's' : ''}.
            Consider reviewing before finalising.
          </div>
        </div>
      )}

      {/* Classification + Difficulty grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>

        {/* Bloom's */}
        <div style={{
          padding: '1rem', background: 'var(--color-canvas-deep)',
          border: '1px solid var(--color-line)', borderRadius: '0.75rem',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '0.6rem', fontSize: '0.72rem', fontWeight: 700,
            color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <GitBranch size={12} /> Bloom's Level
          </div>
          <div style={{
            display: 'inline-flex', padding: '0.3rem 0.8rem',
            background: 'var(--color-accent-soft)',
            borderRadius: '99px', fontWeight: 700, fontSize: '0.88rem',
            marginBottom: '0.6rem', color: 'var(--color-accent-ink)',
          }}>
            {BLOOMS_LABELS[analysis.aiBloomsLevel]}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)', marginBottom: '0.25rem' }}>Confidence</div>
          <ConfidenceBar value={analysis.aiBloomsConfidence} />
          <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)', marginTop: '0.5rem' }}>
            Type: <strong style={{ color: 'var(--color-ink-soft)' }}>{analysis.aiQuestionTypeHint}</strong>
          </div>
          {analysis.facultyBloomsLevel && (
            <div style={{
              marginTop: '0.5rem', padding: '0.35rem 0.55rem',
              background: 'var(--color-success-soft)', borderRadius: '6px',
              fontSize: '0.72rem', color: 'var(--color-success)',
            }}>
              ✓ Override: <strong>{BLOOMS_LABELS[analysis.facultyBloomsLevel]}</strong>
            </div>
          )}
        </div>

        {/* Difficulty */}
        <div style={{
          padding: '1rem', background: 'var(--color-canvas-deep)',
          border: '1px solid var(--color-line)', borderRadius: '0.75rem',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            marginBottom: '0.6rem', fontSize: '0.72rem', fontWeight: 700,
            color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            <Zap size={12} /> Difficulty
          </div>
          <div style={{
            display: 'inline-flex', padding: '0.3rem 0.8rem',
            background: `${DIFFICULTY_HEX[analysis.aiSuggestedDifficulty]}18`,
            border: `1px solid ${DIFFICULTY_HEX[analysis.aiSuggestedDifficulty]}55`,
            borderRadius: '99px', fontWeight: 700, fontSize: '0.88rem',
            marginBottom: '0.6rem', color: DIFFICULTY_HEX[analysis.aiSuggestedDifficulty],
          }}>
            {analysis.aiSuggestedDifficulty}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-ink-muted)', marginBottom: '0.25rem' }}>Confidence</div>
          <ConfidenceBar value={analysis.aiDifficultyConfidence} />
          <div style={{
            fontSize: '0.72rem', color: 'var(--color-ink-muted)', marginTop: '0.5rem',
            fontStyle: 'italic', lineHeight: 1.4,
          }}>
            "{analysis.aiDifficultyRationale}"
          </div>
          {analysis.facultyDifficulty && (
            <div style={{
              marginTop: '0.5rem', padding: '0.35rem 0.55rem',
              background: 'var(--color-success-soft)', borderRadius: '6px',
              fontSize: '0.72rem', color: 'var(--color-success)',
            }}>
              ✓ Override: <strong>{analysis.facultyDifficulty}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Subject Tags */}
      {analysis.aiSubjectTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '0.25rem' }}>
            Tags:
          </span>
          {analysis.aiSubjectTags.map((tag) => (
            <span key={tag} style={{
              padding: '0.15rem 0.55rem',
              background: 'var(--color-accent-soft)', color: 'var(--color-accent-ink)',
              borderRadius: '99px', fontSize: '0.75rem', fontWeight: 500,
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Duplicate candidates */}
      {analysis.duplicateCandidates.length > 0 && (
        <div style={{ border: '1px solid var(--color-line)', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <button
            id="ai-analysis-duplicates-toggle"
            onClick={() => setShowDuplicates((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '0.65rem 1rem',
              background: 'var(--color-canvas-deep)', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-ink)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={13} color={analysis.hasNearDuplicates ? 'var(--color-danger)' : 'var(--color-warning)'} />
              Similar Questions ({analysis.duplicateCandidates.length})
            </span>
            {showDuplicates ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showDuplicates && (
            <div style={{ padding: '0.5rem 1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {analysis.duplicateCandidates.map((d) => (
                <div key={d.candidateId} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.4rem 0.65rem',
                  background: d.isNearDuplicate ? 'var(--color-danger-soft)' : 'var(--color-canvas)',
                  borderRadius: '0.5rem', fontSize: '0.76rem', gap: '0.75rem',
                }}>
                  <span style={{ fontFamily: 'monospace', color: 'var(--color-ink-muted)', fontSize: '0.7rem' }}>
                    rev:{d.candidateId.slice(-8)}
                  </span>
                  <SimilarityBadge score={d.similarityScore} isNear={d.isNearDuplicate} />
                </div>
              ))}
              <p style={{ fontSize: '0.7rem', color: 'var(--color-ink-faint)', margin: '0.2rem 0 0' }}>
                IDs shown are question revision IDs. Cross-reference in Revision History.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Faculty Review Controls */}
      {!isReviewed && (
        <div style={{
          padding: '1rem', background: 'var(--color-canvas-deep)',
          border: '1px solid var(--color-line)', borderRadius: '0.75rem',
          display: 'flex', flexDirection: 'column', gap: '0.75rem',
        }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-ink)' }}>
            Faculty Review Required
          </div>

          {reviewError && (
            <div style={{
              padding: '0.5rem 0.75rem', background: 'var(--color-danger-soft)',
              border: '1px solid #f5a5a0', borderRadius: '0.5rem',
              fontSize: '0.78rem', color: 'var(--color-danger)',
            }}>
              {reviewError}
            </div>
          )}

          {reviewMode === 'idle' && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <Button
                id="ai-analysis-accept-btn"
                variant="primary"
                size="sm"
                onClick={handleAccept}
                disabled={reviewLoading}
              >
                {reviewLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ThumbsUp size={14} />}
                Accept
              </Button>
              <Button
                id="ai-analysis-override-btn"
                variant="outline"
                size="sm"
                onClick={() => setReviewMode('override')}
                disabled={reviewLoading}
              >
                <Edit3 size={14} />
                Override
              </Button>
              <Button
                id="ai-analysis-dismiss-btn"
                variant="secondary"
                size="sm"
                onClick={handleDismiss}
                disabled={reviewLoading}
              >
                {reviewLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ThumbsDown size={14} />}
                Dismiss
              </Button>
            </div>
          )}

          {reviewMode === 'override' && (
            <form onSubmit={handleOverrideSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem', color: 'var(--color-ink-soft)' }}>
                    Bloom's Level
                  </label>
                  <select
                    id="override-blooms-select"
                    value={overrideBloomsLevel}
                    onChange={(e) => setOverrideBloomsLevel(e.target.value as BloomsLevel | '')}
                    style={selectStyle}
                  >
                    <option value="">— keep AI suggestion —</option>
                    {(['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE'] as BloomsLevel[]).map((l) => (
                      <option key={l} value={l}>{BLOOMS_LABELS[l]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem', color: 'var(--color-ink-soft)' }}>
                    Difficulty
                  </label>
                  <select
                    id="override-difficulty-select"
                    value={overrideDifficulty}
                    onChange={(e) => setOverrideDifficulty(e.target.value as Difficulty | '')}
                    style={selectStyle}
                  >
                    <option value="">— keep AI suggestion —</option>
                    <option value="EASY">Easy</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HARD">Hard</option>
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem', color: 'var(--color-ink-soft)' }}>
                  Faculty Notes <span style={{ fontWeight: 400, color: 'var(--color-ink-muted)' }}>(optional)</span>
                </label>
                <textarea
                  id="override-notes-textarea"
                  value={overrideNotes}
                  onChange={(e) => setOverrideNotes(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="Reason for override…"
                  style={{ ...selectStyle, resize: 'vertical', lineHeight: '1.4' }}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button id="override-submit-btn" type="submit" variant="primary" size="sm" disabled={reviewLoading}>
                  {reviewLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={14} />}
                  Save Override
                </Button>
                <Button
                  id="override-cancel-btn"
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => { setReviewMode('idle'); setReviewError(null); }}
                  disabled={reviewLoading}
                >
                  <XCircle size={14} />
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Reviewed state summary */}
      {isReviewed && (
        <div style={{
          padding: '0.65rem 0.9rem',
          background: analysis.reviewStatus === 'ACCEPTED' ? 'var(--color-success-soft)' :
            analysis.reviewStatus === 'OVERRIDDEN' ? 'var(--color-accent-soft)' : 'var(--color-canvas-deep)',
          borderRadius: '0.625rem', fontSize: '0.8rem',
          color: analysis.reviewStatus === 'ACCEPTED' ? 'var(--color-success)' :
            analysis.reviewStatus === 'OVERRIDDEN' ? 'var(--color-accent-ink)' : 'var(--color-ink-muted)',
          display: 'flex', alignItems: 'flex-start', gap: '0.5rem',
        }}>
          {analysis.reviewStatus === 'ACCEPTED' && <CheckCircle2 size={14} style={{ flexShrink: 0, marginTop: '1px' }} />}
          {analysis.reviewStatus === 'OVERRIDDEN' && <Edit3 size={14} style={{ flexShrink: 0, marginTop: '1px' }} />}
          {analysis.reviewStatus === 'DISMISSED' && <XCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />}
          <span>
            Faculty {analysis.reviewStatus.toLowerCase()} this analysis.
            {analysis.facultyNotes && (
              <span style={{ display: 'block', fontStyle: 'italic', marginTop: '0.15rem' }}>
                Notes: {analysis.facultyNotes}
              </span>
            )}
          </span>
        </div>
      )}

      {/* Provenance footer */}
      <div style={{ fontSize: '0.68rem', color: 'var(--color-ink-faint)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <span>{analysis.aiProvider} / {analysis.aiModel}</span>
        <span>{analysis.durationMs}ms</span>
        <span>{new Date(analysis.createdAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TriggerAnalysisPanel — shown when no analysis exists yet
// ---------------------------------------------------------------------------

interface TriggerAnalysisPanelProps {
  revisionId: string | undefined;
  onTrigger: (skipDuplicates: boolean) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function TriggerAnalysisPanel({ revisionId, onTrigger, loading, error }: TriggerAnalysisPanelProps) {
  const [skipDuplicates, setSkipDuplicates] = useState(false);

  return (
    <div style={{
      padding: '1.5rem',
      background: 'var(--color-canvas-deep)',
      border: '1px dashed var(--color-line-strong)',
      borderRadius: '0.75rem',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '0.75rem', textAlign: 'center',
    }}>
      <Brain size={36} color="var(--color-accent)" strokeWidth={1.5} />
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.3rem', color: 'var(--color-ink)' }}>
          AI Question Analysis
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-ink-muted)', maxWidth: '340px', lineHeight: 1.5 }}>
          Run AI analysis to get Bloom's taxonomy classification, difficulty estimation,
          and semantic duplicate detection for this revision.
        </div>
      </div>

      {error && (
        <div style={{
          padding: '0.5rem 0.75rem', background: 'var(--color-danger-soft)',
          border: '1px solid #f5a5a0', borderRadius: '0.5rem',
          fontSize: '0.78rem', color: 'var(--color-danger)', maxWidth: '340px',
        }}>
          {error}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer', color: 'var(--color-ink-soft)' }}>
        <input
          id="skip-duplicates-checkbox"
          type="checkbox"
          checked={skipDuplicates}
          onChange={(e) => setSkipDuplicates(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        Skip duplicate detection (faster)
      </label>

      <Button
        id="trigger-analysis-btn"
        variant="primary"
        size="sm"
        onClick={() => onTrigger(skipDuplicates)}
        disabled={loading || !revisionId}
      >
        {loading
          ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
          : <Brain size={15} />}
        {loading ? 'Analysing…' : 'Run AI Analysis'}
      </Button>

      <p style={{ fontSize: '0.7rem', color: 'var(--color-ink-faint)', margin: 0 }}>
        Results are advisory only and require faculty review.
      </p>
    </div>
  );
}
