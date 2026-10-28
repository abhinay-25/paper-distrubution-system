import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  GitCompare,
  Clock,
  Calendar,
  Layers,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardBody, PageHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ErrorMessage } from '../components/ui/Feedback';
import { listVersions, getVersion, compareVersions } from '../lib/api';
import type { PaperVersion, ExamPaper, CompareVersionsResponse } from '../types/paper';

export function PaperVersionHistoryPage() {
  const { paperId } = useParams<{ paperId: string }>();

  const [versions, setVersions] = useState<PaperVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expanded version cache
  const [expandedVersionNum, setExpandedVersionNum] = useState<number | null>(null);
  const [versionDetails, setVersionDetails] = useState<Record<number, ExamPaper>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Selection for comparison (max 2)
  const [selectedVersions, setSelectedVersions] = useState<number[]>([]);
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [comparisonData, setComparisonData] = useState<CompareVersionsResponse | null>(null);
  const [comparing, setComparing] = useState(false);

  async function loadVersions() {
    if (!paperId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listVersions(paperId);
      setVersions(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load paper version history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (paperId) {
      loadVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  async function toggleExpandVersion(versionNumber: number) {
    if (expandedVersionNum === versionNumber) {
      setExpandedVersionNum(null);
      return;
    }

    setExpandedVersionNum(versionNumber);

    // If detail not cached, load it
    if (!versionDetails[versionNumber] && paperId) {
      setLoadingDetail(true);
      try {
        const fullVersion = await getVersion(paperId, versionNumber);
        if (fullVersion.snapshotJson) {
          setVersionDetails((prev) => ({
            ...prev,
            [versionNumber]: fullVersion.snapshotJson as ExamPaper,
          }));
        }
      } catch (err: unknown) {
        console.error('Failed to load version snapshot', err);
      } finally {
        setLoadingDetail(false);
      }
    }
  }

  function handleToggleSelect(versionNum: number) {
    setSelectedVersions((prev) => {
      if (prev.includes(versionNum)) {
        return prev.filter((v) => v !== versionNum);
      }
      if (prev.length >= 2) {
        // Replace oldest or keep max 2
        return [prev[1]!, versionNum];
      }
      return [...prev, versionNum];
    });
  }

  async function handleCompare() {
    if (selectedVersions.length !== 2 || !paperId) return;
    const [vA, vB] = [...selectedVersions].sort((a, b) => a - b);
    setComparing(true);
    try {
      const data = await compareVersions(paperId, vA!, vB!);
      setComparisonData(data);
      setComparisonModalOpen(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to compare versions');
    } finally {
      setComparing(false);
    }
  }

  if (loading) {
    return (
      <div className="py-20 text-center text-body text-ink-muted">
        Loading version history...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link
            to={`/papers/${paperId}/preview`}
            className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Preview</span>
          </Link>
        }
        eyebrow="Audit & Snapshot Trail"
        title="Question Paper Version History"
        description="Immutable snapshots and audit records captured across draft revisions."
        actions={
          <Button
            size="sm"
            variant="primary"
            onClick={handleCompare}
            disabled={selectedVersions.length !== 2 || comparing}
            title={
              selectedVersions.length !== 2
                ? 'Select exactly 2 versions below to compare'
                : 'Compare the two selected version snapshots'
            }
          >
            <GitCompare className="size-4" />
            {comparing
              ? 'Loading Diff...'
              : `Compare Selected (${selectedVersions.length}/2)`}
          </Button>
        }
      />

      {error && <ErrorMessage message={error} />}

      {/* Version List */}
      {versions.length === 0 ? (
        <Card>
          <CardBody className="py-16 text-center space-y-3">
            <Layers className="mx-auto h-12 w-12 text-ink-faint" />
            <h3 className="text-title font-medium text-ink">No saved snapshot versions yet</h3>
            <p className="text-sm text-ink-muted max-w-md mx-auto">
              Save a version snapshot from the Preview page or Paper Builder to create an immutable milestone in this paper&apos;s history.
            </p>
            <Link to={`/papers/${paperId}/preview`}>
              <Button variant="outline" className="mt-2">
                Go to Preview Page
              </Button>
            </Link>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 text-xs text-ink-muted">
            <span>Select any two versions to inspect side-by-side changes</span>
            <span>{versions.length} total snapshot(s)</span>
          </div>

          {versions.map((ver) => {
            const isSelected = selectedVersions.includes(ver.versionNumber);
            const isExpanded = expandedVersionNum === ver.versionNumber;
            const snapshot = versionDetails[ver.versionNumber];

            return (
              <Card
                key={ver.id}
                className={`border transition-all ${
                  isSelected ? 'border-accent ring-1 ring-accent' : 'border-line'
                }`}
              >
                {/* Version List Item Header */}
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between bg-surface">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id={`ver-select-${ver.versionNumber}`}
                      checked={isSelected}
                      onChange={() => handleToggleSelect(ver.versionNumber)}
                      className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                    />

                    <button
                      type="button"
                      onClick={() => toggleExpandVersion(ver.versionNumber)}
                      className="flex items-center gap-2 text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-ink-muted" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-ink-muted" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-ink text-sm">
                            Version #{ver.versionNumber}
                          </span>
                          <Badge tone="neutral">Snapshot</Badge>
                        </div>
                        <p className="text-xs text-ink-muted mt-0.5">
                          {ver.changeNote || 'No change note provided'}
                        </p>
                      </div>
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-ink-muted self-end sm:self-center">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(ver.createdAt).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(ver.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleExpandVersion(ver.versionNumber)}
                    >
                      {isExpanded ? 'Collapse' : 'Inspect'}
                    </Button>
                  </div>
                </div>

                {/* Expanded Version Snapshot Preview */}
                {isExpanded && (
                  <div className="border-t border-line bg-canvas-deep/20 p-5 space-y-4">
                    {loadingDetail && !snapshot ? (
                      <div className="py-6 text-center text-xs text-ink-muted">
                        Loading snapshot payload...
                      </div>
                    ) : snapshot ? (
                      <div className="space-y-4 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                          <div>
                            <span className="font-semibold text-ink">{snapshot.title}</span>
                            <span className="text-xs text-ink-muted block">
                              Exam Config: {snapshot.config?.name} ({Number(snapshot.config?.totalMarks || 0)} Marks)
                            </span>
                          </div>
                          <Badge tone="accent">
                            {snapshot.sections?.reduce(
                              (sum, s) => sum + (s.slots?.length || 0),
                              0,
                            )}{' '}
                            Questions Across {snapshot.sections?.length || 0} Sections
                          </Badge>
                        </div>

                        {/* Sections & Questions in Snapshot */}
                        <div className="space-y-4">
                          {snapshot.sections?.map((sec) => (
                            <div
                              key={sec.id}
                              className="rounded-lg border border-line bg-surface p-3 space-y-3"
                            >
                              <div className="flex justify-between items-center text-xs font-semibold text-ink border-b border-line pb-2">
                                <span>
                                  Section {sec.sectionLabel}: {sec.title}
                                </span>
                                <span className="text-ink-muted">
                                  {sec.requiredAnswers
                                    ? `Answer ${sec.requiredAnswers} of ${sec.slots?.length || 0}`
                                    : 'All Mandatory'}
                                </span>
                              </div>

                              <div className="space-y-2">
                                {sec.slots?.map((slot, idx) => (
                                  <div
                                    key={slot.id}
                                    className="flex justify-between items-start text-xs text-ink gap-3 pl-2"
                                  >
                                    <div className="flex items-start gap-2">
                                      <span className="font-semibold text-ink-muted">
                                        Q{idx + 1}.
                                      </span>
                                      <span className="leading-relaxed">
                                        {slot.revision?.questionText}
                                      </span>
                                    </div>
                                    <span className="font-semibold text-ink-muted whitespace-nowrap">
                                      [{Number(slot.allocatedMarks)} Marks]
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 text-center text-xs text-danger">
                        Snapshot data could not be rendered.
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal: Side-by-Side Version Diff Comparison */}
      <Modal
        isOpen={comparisonModalOpen}
        onClose={() => setComparisonModalOpen(false)}
        title="Side-by-Side Version Comparison"
        description="Comparing question selection, marks, and section structure between selected snapshots."
        maxWidth="xl"
      >
        {comparisonData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Version A Column */}
              <div className="rounded-lg border border-line bg-canvas-deep/20 p-4 space-y-3">
                <div className="border-b border-line pb-2 flex justify-between items-center">
                  <span className="font-bold text-sm text-ink">
                    Version #{comparisonData.versionA.version} (Older)
                  </span>
                  <Badge tone="neutral">
                    {comparisonData.versionA.sections?.reduce(
                      (sum, s) => sum + (s.slots?.length || 0),
                      0,
                    )}{' '}
                    Questions
                  </Badge>
                </div>

                <div className="text-xs space-y-1 text-ink-muted">
                  <p>Title: <strong className="text-ink">{comparisonData.versionA.title}</strong></p>
                  <p>Sections: <strong>{comparisonData.versionA.sections?.length || 0}</strong></p>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {comparisonData.versionA.sections?.map((sec) => (
                    <div key={sec.id} className="rounded border border-line bg-surface p-2.5 text-xs space-y-2">
                      <p className="font-bold text-ink">Sec {sec.sectionLabel}: {sec.title}</p>
                      <div className="space-y-1.5 pl-1 divide-y divide-line/40">
                        {sec.slots?.map((slot, idx) => (
                          <div key={slot.id} className="pt-1 flex justify-between gap-2">
                            <span className="text-ink leading-snug line-clamp-2">
                              {idx + 1}. {slot.revision?.questionText}
                            </span>
                            <span className="text-ink-muted font-mono whitespace-nowrap">
                              {Number(slot.allocatedMarks)}M
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Version B Column */}
              <div className="rounded-lg border border-accent/40 bg-accent-soft/10 p-4 space-y-3">
                <div className="border-b border-line pb-2 flex justify-between items-center">
                  <span className="font-bold text-sm text-accent">
                    Version #{comparisonData.versionB.version} (Newer)
                  </span>
                  <Badge tone="accent">
                    {comparisonData.versionB.sections?.reduce(
                      (sum, s) => sum + (s.slots?.length || 0),
                      0,
                    )}{' '}
                    Questions
                  </Badge>
                </div>

                <div className="text-xs space-y-1 text-ink-muted">
                  <p>Title: <strong className="text-ink">{comparisonData.versionB.title}</strong></p>
                  <p>Sections: <strong>{comparisonData.versionB.sections?.length || 0}</strong></p>
                </div>

                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {comparisonData.versionB.sections?.map((sec) => (
                    <div key={sec.id} className="rounded border border-line bg-surface p-2.5 text-xs space-y-2">
                      <p className="font-bold text-ink">Sec {sec.sectionLabel}: {sec.title}</p>
                      <div className="space-y-1.5 pl-1 divide-y divide-line/40">
                        {sec.slots?.map((slot, idx) => (
                          <div key={slot.id} className="pt-1 flex justify-between gap-2">
                            <span className="text-ink leading-snug line-clamp-2">
                              {idx + 1}. {slot.revision?.questionText}
                            </span>
                            <span className="text-ink-muted font-mono whitespace-nowrap">
                              {Number(slot.allocatedMarks)}M
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => setComparisonModalOpen(false)}>
                Close Comparison
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
