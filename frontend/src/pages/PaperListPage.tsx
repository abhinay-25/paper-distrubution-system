import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Layers,
  Plus,
  Clock,
  Award,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardBody, PageHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { TextInput, Select } from '../components/ui/FormControls';
import { ErrorMessage } from '../components/ui/Feedback';
import { fetchExamPapers, fetchExamConfigs, createExamPaper } from '../lib/api';
import type { ExamPaper, ExamConfiguration, PaperStatus } from '../types/paper';

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

export function PaperListPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const configIdFilter = searchParams.get('configId') || '';

  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [configs, setConfigs] = useState<ExamConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Draft Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadPapers() {
    setLoading(true);
    setError(null);
    try {
      const [papersRes, configsRes] = await Promise.all([
        fetchExamPapers({
          configId: configIdFilter || undefined,
          pageSize: 50,
        }),
        fetchExamConfigs({ pageSize: 100 }),
      ]);
      setPapers(papersRes.data);
      setConfigs(configsRes.data);
      if (configsRes.data.length > 0 && !selectedConfigId) {
        setSelectedConfigId(configsRes.data[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load papers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPapers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configIdFilter]);

  async function handleCreatePaper(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedConfigId || !newTitle.trim()) return;

    setCreating(true);
    try {
      const paper = await createExamPaper({
        configId: selectedConfigId,
        title: newTitle.trim(),
        sections: [
          {
            sectionLabel: 'A',
            title: 'Section A — Mandatory Questions',
            sequenceOrder: 1,
          },
          {
            sectionLabel: 'B',
            title: 'Section B — Analytical Questions',
            sequenceOrder: 2,
          },
        ],
      });
      setIsModalOpen(false);
      navigate(`/papers/${paper.id}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create question paper draft');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Blueprint Assembly"
        title="Question Paper Preparation"
        description="Assemble, review, and validate question paper drafts before official approval and distribution."
        actions={
          <>
            <Link to="/examinations">
              <Button variant="outline">
                <FileText className="size-4" />
                Examinations
              </Button>
            </Link>
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus className="size-4" />
              New Paper Draft
            </Button>
          </>
        }
      />

      {error && <ErrorMessage message={error} />}

      {/* Main Papers List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <h2 className="text-section font-semibold text-ink">Paper Drafts & Blueprints</h2>
            <p className="text-support text-ink-muted">
              Drafts maintain persistent section structures and immutable question revisions.
            </p>
          </div>
          {configIdFilter && (
            <div className="flex items-center gap-2">
              <span className="text-meta text-ink-muted">Filtered by exam configuration</span>
              <Link to="/papers">
                <Button size="sm" variant="outline">
                  Clear Filter
                </Button>
              </Link>
            </div>
          )}
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="py-12 text-center text-body text-ink-muted">
              Loading question paper drafts...
            </div>
          ) : papers.length === 0 ? (
            <div className="py-12 text-center">
              <Layers className="mx-auto h-12 w-12 text-ink-faint" />
              <h3 className="mt-3 text-title font-medium text-ink">No question paper drafts</h3>
              <p className="mt-1 text-body text-ink-muted">
                Start by creating a paper draft tied to an approved examination configuration.
              </p>
              <Button className="mt-4" onClick={() => setIsModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Create Paper Draft
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {papers.map((paper) => (
                <div
                  key={paper.id}
                  className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink text-body">{paper.title}</span>
                      <Badge tone={getStatusTone(paper.status)}>{paper.status}</Badge>
                      <span className="text-meta text-ink-muted">v{paper.version}</span>
                    </div>

                    {paper.config && (
                      <p className="text-sm text-ink-soft">
                        Exam: <strong>{paper.config.name}</strong>
                        {paper.config.subject && (
                          <span className="text-ink-muted ml-2">
                            ({paper.config.subject.code} — {paper.config.subject.name})
                          </span>
                        )}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-meta text-ink-muted pt-1">
                      <span className="flex items-center gap-1">
                        <Award className="h-3.5 w-3.5" />
                        Target: <strong className="text-ink">{Number(paper.config?.totalMarks || 0)} marks</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" />
                        Sections: <strong className="text-ink">{paper._count?.sections || paper.sections?.length || 0}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        Updated: {new Date(paper.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link to={`/papers/${paper.id}`}>
                      <Button size="sm" variant={paper.status === 'DRAFT' ? 'primary' : 'outline'}>
                        {paper.status === 'DRAFT' ? 'Open Builder' : 'View Paper'}
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Modal: New Paper Draft */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Question Paper Draft"
        description="Select an examination configuration to initialize the paper blueprint."
      >
        <form onSubmit={handleCreatePaper} className="space-y-4">
          <Select
            label="Examination Configuration"
            value={selectedConfigId}
            onChange={(e) => {
              setSelectedConfigId(e.target.value);
              const found = configs.find((c) => c.id === e.target.value);
              if (found) setNewTitle(`${found.name} — Draft A`);
            }}
            helperText="The examination setup defining target marks, duration, and subject."
            required
          >
            {configs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.subject?.code} — {Number(c.totalMarks)} marks)
              </option>
            ))}
          </Select>

          <TextInput
            label="Draft Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="e.g. End Semester Exam Paper — Set 1"
            helperText="Identifies this paper draft."
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Initialize & Open Builder'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
