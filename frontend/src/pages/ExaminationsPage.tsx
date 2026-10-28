import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileText,
  Plus,
  Clock,
  Award,
  Layers,
  ArrowRight,
  BookOpen,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardBody, PageHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { TextInput, TextArea, Select } from '../components/ui/FormControls';
import { ErrorMessage } from '../components/ui/Feedback';
import { fetchExamConfigs, createExamConfig, createExamPaper, fetchSubjects } from '../lib/api';
import type { ExamConfiguration } from '../types/paper';
import type { Subject } from '../types/academic';

export function ExaminationsPage() {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<ExamConfiguration[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create config modal state
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configSubmitting, setConfigSubmitting] = useState(false);
  const [configForm, setConfigForm] = useState({
    subjectId: '',
    name: '',
    description: '',
    totalMarks: '100',
    passingMarks: '40',
    durationMinutes: '180',
    instructions:
      '1. Answer all mandatory questions.\n2. Cell phones and programmable calculators are strictly prohibited.\n3. Show all working steps clearly.',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Quick Paper Draft modal state
  const [isDraftModalOpen, setIsDraftModalOpen] = useState(false);
  const [selectedConfigForDraft, setSelectedConfigForDraft] = useState<ExamConfiguration | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftSubmitting, setDraftSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [configsRes, subjectsRes] = await Promise.all([
        fetchExamConfigs({ pageSize: 50 }),
        fetchSubjects({ pageSize: 100 }),
      ]);
      setConfigs(configsRes.data);
      setSubjects(subjectsRes.data);
      if (subjectsRes.data.length > 0 && !configForm.subjectId) {
        setConfigForm((prev) => ({ ...prev, subjectId: subjectsRes.data[0].id }));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load examinations');
    } finally {
      setLoading(false);
    }
  }

  function validateConfigForm(): boolean {
    const errors: Record<string, string> = {};
    if (!configForm.name.trim()) errors.name = 'Examination title is required';
    if (!configForm.subjectId) errors.subjectId = 'Subject is required';

    const tm = Number(configForm.totalMarks);
    if (isNaN(tm) || tm <= 0) errors.totalMarks = 'Total marks must be a positive number';

    if (configForm.passingMarks) {
      const pm = Number(configForm.passingMarks);
      if (isNaN(pm) || pm <= 0) errors.passingMarks = 'Passing marks must be a positive number';
      else if (pm > tm) errors.passingMarks = 'Passing marks cannot exceed total marks';
    }

    if (configForm.durationMinutes) {
      const dur = Number(configForm.durationMinutes);
      if (isNaN(dur) || dur <= 0) errors.durationMinutes = 'Duration must be positive';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreateConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!validateConfigForm()) return;

    setConfigSubmitting(true);
    try {
      await createExamConfig({
        subjectId: configForm.subjectId,
        name: configForm.name.trim(),
        description: configForm.description.trim() || undefined,
        totalMarks: Number(configForm.totalMarks),
        passingMarks: configForm.passingMarks ? Number(configForm.passingMarks) : undefined,
        durationMinutes: configForm.durationMinutes ? Number(configForm.durationMinutes) : undefined,
        instructions: configForm.instructions.trim() || undefined,
      });

      setIsConfigModalOpen(false);
      setConfigForm({
        subjectId: subjects[0]?.id || '',
        name: '',
        description: '',
        totalMarks: '100',
        passingMarks: '40',
        durationMinutes: '180',
        instructions:
          '1. Answer all mandatory questions.\n2. Cell phones and programmable calculators are strictly prohibited.\n3. Show all working steps clearly.',
      });
      loadData();
    } catch (err: unknown) {
      setFormErrors({
        form: err instanceof Error ? err.message : 'Failed to create examination configuration',
      });
    } finally {
      setConfigSubmitting(false);
    }
  }

  function openCreateDraftModal(config: ExamConfiguration) {
    setSelectedConfigForDraft(config);
    setDraftTitle(`${config.name} — Paper Draft`);
    setIsDraftModalOpen(true);
  }

  async function handleCreateDraft(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedConfigForDraft || !draftTitle.trim()) return;

    setDraftSubmitting(true);
    try {
      const paper = await createExamPaper({
        configId: selectedConfigForDraft.id,
        title: draftTitle.trim(),
        sections: [
          {
            sectionLabel: 'A',
            title: 'Section A — Short Answers',
            sequenceOrder: 1,
          },
          {
            sectionLabel: 'B',
            title: 'Section B — Long Questions',
            sequenceOrder: 2,
          },
        ],
      });

      setIsDraftModalOpen(false);
      navigate(`/papers/${paper.id}`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create paper draft');
    } finally {
      setDraftSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Examination Management"
        title="Examinations & Configurations"
        description="Configure examination rules, syllabus scope, target marks, and prepare question paper drafts."
        actions={
          <>
            <Link to="/papers">
              <Button variant="outline">
                <Layers className="size-4" />
                Paper Drafts
              </Button>
            </Link>
            <Button onClick={() => setIsConfigModalOpen(true)}>
              <Plus className="size-4" />
              New Examination
            </Button>
          </>
        }
      />

      {error && <ErrorMessage message={error} />}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-meta font-medium text-ink-muted">Active Configurations</p>
              <p className="text-title font-semibold text-ink">
                {configs.filter((c) => c.isActive).length}
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-canvas-deep text-ink-soft">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-meta font-medium text-ink-muted">Subjects Available</p>
              <p className="text-title font-semibold text-ink">{subjects.length}</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success-soft text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-meta font-medium text-ink-muted">Prepared Papers</p>
              <p className="text-title font-semibold text-ink">
                {configs.reduce((acc, c) => acc + (c._count?.papers || 0), 0)}
              </p>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Main Configurations List */}
      <Card>
        <CardHeader>
          <h2 className="text-section font-semibold text-ink">Configured Examinations</h2>
          <p className="text-support text-ink-muted">
            Examination specifications establish the authoritative criteria against which question papers are assembled and validated.
          </p>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="py-12 text-center text-body text-ink-muted">
              Loading examination configurations...
            </div>
          ) : configs.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="mx-auto h-12 w-12 text-ink-faint" />
              <h3 className="mt-3 text-title font-medium text-ink">No examination configurations</h3>
              <p className="mt-1 text-body text-ink-muted">
                Create your first examination configuration to set up blueprint rules and begin assembling papers.
              </p>
              <Button className="mt-4" onClick={() => setIsConfigModalOpen(true)}>
                <Plus className="h-4 w-4" />
                Configure Examination
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {configs.map((config) => (
                <div
                  key={config.id}
                  className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink text-body">{config.name}</span>
                      {config.subject && (
                        <Badge tone="accent">
                          {config.subject.code} — {config.subject.name}
                        </Badge>
                      )}
                      {config.isActive ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge tone="neutral">Archived</Badge>
                      )}
                    </div>
                    {config.description && (
                      <p className="text-body text-ink-muted text-sm line-clamp-1">
                        {config.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 text-meta text-ink-muted pt-1">
                      <span className="flex items-center gap-1">
                        <Award className="h-3.5 w-3.5" />
                        Max Marks: <strong className="text-ink">{Number(config.totalMarks)}</strong>
                      </span>
                      {config.passingMarks && (
                        <span>
                          Passing: <strong className="text-ink">{Number(config.passingMarks)}</strong>
                        </span>
                      )}
                      {config.durationMinutes && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Duration: <strong className="text-ink">{config.durationMinutes} min</strong>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" />
                        Papers: <strong className="text-ink">{config._count?.papers || 0}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => openCreateDraftModal(config)}
                    >
                      <Plus className="h-4 w-4" />
                      Build Paper
                    </Button>
                    <Link to={`/papers?configId=${config.id}`}>
                      <Button size="sm" variant="outline">
                        View Drafts
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

      {/* Modal: Create Examination Configuration */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title="Configure Examination"
        description="Establish the academic subject, total marks, duration, and instructions for question papers."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateConfig} className="space-y-4">
          {formErrors.form && <ErrorMessage message={formErrors.form} />}

          <Select
            label="Academic Subject"
            value={configForm.subjectId}
            onChange={(e) => setConfigForm({ ...configForm, subjectId: e.target.value })}
            error={formErrors.subjectId}
            helperText="The syllabus domain and question bank this exam configuration applies to."
          >
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.code} — {sub.name}
              </option>
            ))}
          </Select>

          <TextInput
            label="Examination Title"
            placeholder="e.g. End-Semester Examination November 2026"
            value={configForm.name}
            onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
            error={formErrors.name}
            helperText="Full descriptive title appearing on question papers."
          />

          <TextArea
            label="Description / Context"
            placeholder="Optional context or notes regarding this examination session."
            value={configForm.description}
            onChange={(e) => setConfigForm({ ...configForm, description: e.target.value })}
            rows={2}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextInput
              label="Total Marks"
              type="number"
              min="1"
              step="0.5"
              value={configForm.totalMarks}
              onChange={(e) => setConfigForm({ ...configForm, totalMarks: e.target.value })}
              error={formErrors.totalMarks}
              helperText="Target achievable marks."
            />

            <TextInput
              label="Passing Marks"
              type="number"
              min="1"
              step="0.5"
              value={configForm.passingMarks}
              onChange={(e) => setConfigForm({ ...configForm, passingMarks: e.target.value })}
              error={formErrors.passingMarks}
              helperText="Optional minimum pass score."
            />

            <TextInput
              label="Duration (Minutes)"
              type="number"
              min="15"
              step="5"
              value={configForm.durationMinutes}
              onChange={(e) => setConfigForm({ ...configForm, durationMinutes: e.target.value })}
              error={formErrors.durationMinutes}
              helperText="Allocated exam duration."
            />
          </div>

          <TextArea
            label="General Candidate Instructions"
            value={configForm.instructions}
            onChange={(e) => setConfigForm({ ...configForm, instructions: e.target.value })}
            rows={3}
            helperText="Printed instructions visible to candidates at the top of the paper."
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsConfigModalOpen(false)}
              disabled={configSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={configSubmitting}>
              {configSubmitting ? 'Creating...' : 'Create Configuration'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Create Paper Draft */}
      <Modal
        isOpen={isDraftModalOpen}
        onClose={() => setIsDraftModalOpen(false)}
        title="Start Question Paper Draft"
        description={
          selectedConfigForDraft
            ? `Assembling paper for ${selectedConfigForDraft.name} (${selectedConfigForDraft.subject?.name})`
            : 'Initialize a new paper draft'
        }
      >
        <form onSubmit={handleCreateDraft} className="space-y-4">
          <TextInput
            label="Paper Draft Title"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            helperText="Working title for this question paper draft."
            required
          />

          <div className="rounded-control bg-canvas-deep p-3 text-sm text-ink-muted space-y-1">
            <p className="font-medium text-ink">Blueprint Initialization:</p>
            <p>Will initialize with Section A (Short Answers) and Section B (Long Questions).</p>
            <p>
              Target achievable marks: <strong>{Number(selectedConfigForDraft?.totalMarks || 0)} marks</strong>.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDraftModalOpen(false)}
              disabled={draftSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={draftSubmitting}>
              {draftSubmitting ? 'Initializing...' : 'Open Paper Builder'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
