import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, BookOpen, Layers, Edit2, ExternalLink } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { TextInput, TextArea, Select } from '../components/ui/FormControls';
import { Modal } from '../components/ui/Modal';
import { EmptyState, ErrorMessage, Skeleton } from '../components/ui/Feedback';
import { fetchSubjects, createSubject, updateSubject } from '../lib/api';
import type { Subject, SubjectStatus } from '../types/academic';
import { useInstitution } from '../context/InstitutionContext';

export function SubjectsPage() {
  const { institutionId } = useInstitution();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Modal states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);

  // Form states
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState<SubjectStatus>('ACTIVE');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadSubjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchSubjects({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        page: 1,
        pageSize: 50,
      });
      setSubjects(res.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load subjects');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, institutionId]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  const handleOpenCreate = () => {
    setFormCode('');
    setFormName('');
    setFormDescription('');
    setFormStatus('ACTIVE');
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (subject: Subject) => {
    setEditingSubject(subject);
    setFormName(subject.name);
    setFormDescription(subject.description || '');
    setFormStatus(subject.status);
    setFormError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formCode.trim()) {
      setFormError('Subject code is required.');
      return;
    }
    if (!formName.trim()) {
      setFormError('Subject name is required.');
      return;
    }

    try {
      setFormSubmitting(true);
      await createSubject({
        code: formCode.trim().toUpperCase(),
        name: formName.trim(),
        description: formDescription.trim() || undefined,
      });
      setIsCreateOpen(false);
      await loadSubjects();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create subject');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject) return;
    setFormError(null);

    if (!formName.trim()) {
      setFormError('Subject name is required.');
      return;
    }

    try {
      setFormSubmitting(true);
      await updateSubject(editingSubject.id, {
        name: formName.trim(),
        description: formDescription.trim() || null,
        status: formStatus,
      });
      setEditingSubject(null);
      await loadSubjects();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to update subject');
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academic Structure"
        title="Subjects & Syllabus"
        description="Institutional academic subjects, curriculum codes, and syllabus topics."
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="size-4" />
            <span>Add Subject</span>
          </Button>
        }
      />

      {/* Filter Toolbar */}
      <Card>
        <CardBody className="p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <TextInput
                label="Search Subjects"
                placeholder="Search subjects by code or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div>
              <Select
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Error state */}
      {error && <ErrorMessage message={error} retry={() => loadSubjects()} />}

      {/* Loading state */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full rounded-card" />
          ))}
        </div>
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No subjects found"
          description={
            search || statusFilter
              ? 'Try modifying your search or filters to find what you are looking for.'
              : 'Get started by creating your institution’s first academic subject.'
          }
          action={
            <Button onClick={handleOpenCreate} variant="secondary">
              <Plus className="size-4" />
              <span>Create Subject</span>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {subjects.map((subject) => (
            <Card key={subject.id} className="transition-all hover:border-line-strong">
              <CardBody className="flex flex-col justify-between h-full p-5 sm:p-6">
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="font-mono text-meta font-bold tracking-wider px-2.5 py-1 rounded-md bg-canvas-deep text-ink-soft">
                      {subject.code}
                    </span>
                    <Badge tone={subject.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {subject.status === 'ACTIVE' ? 'Active' : 'Archived'}
                    </Badge>
                  </div>
                  <h3 className="text-section font-semibold text-ink line-clamp-1">{subject.name}</h3>
                  <p className="mt-1 text-support text-ink-muted line-clamp-2 min-h-7">
                    {subject.description || 'No description provided.'}
                  </p>
                </div>

                <div className="mt-5 pt-4 border-t border-line flex items-center justify-between">
                  <div className="flex items-center gap-3 text-meta text-ink-muted">
                    <span className="flex items-center gap-1">
                      <Layers className="size-3.5" />
                      <span>{subject._count?.topics ?? 0} topics</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <BookOpen className="size-3.5" />
                      <span>{subject._count?.questions ?? 0} questions</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenEdit(subject)}
                      title="Edit subject metadata"
                    >
                      <Edit2 className="size-3.5" />
                      <span>Edit</span>
                    </Button>
                    <Link to={`/subjects/${subject.id}`}>
                      <Button variant="secondary" size="sm">
                        <span>Topics</span>
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Create Subject */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Academic Subject"
        description="Enter the syllabus subject code and official name for your institution."
      >
        <form onSubmit={handleCreateSubmit} className="flex flex-col gap-4">
          {formError && <ErrorMessage>{formError}</ErrorMessage>}

          <TextInput
            label="Subject Code"
            placeholder="e.g. CS101, MATH201, PHY302"
            value={formCode}
            onChange={(e) => setFormCode(e.target.value.toUpperCase())}
            helperText="Uppercase alphanumeric course code (2-20 characters)."
            required
            autoFocus
          />

          <TextInput
            label="Subject Name"
            placeholder="e.g. Introduction to Computer Science"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            helperText="Official course or curriculum title."
            required
          />

          <TextArea
            label="Description (Optional)"
            placeholder="Brief scope, syllabus summary, or department notes..."
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            rows={3}
          />

          <div className="mt-2 flex justify-end gap-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
              disabled={formSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={formSubmitting}>
              {formSubmitting ? 'Creating...' : 'Create Subject'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Subject */}
      <Modal
        isOpen={Boolean(editingSubject)}
        onClose={() => setEditingSubject(null)}
        title={`Edit Subject — ${editingSubject?.code}`}
        description="Update the name, description, or active status of this subject."
      >
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
          {formError && <ErrorMessage>{formError}</ErrorMessage>}

          <div>
            <label className="text-label font-medium text-ink-soft">Subject Code</label>
            <div className="mt-1.5 font-mono text-body font-semibold px-3 py-2 rounded-control bg-canvas-deep text-ink-muted">
              {editingSubject?.code}
            </div>
            <p className="mt-1 text-meta text-ink-faint">
              Course codes cannot be changed after creation to maintain exam historical consistency.
            </p>
          </div>

          <TextInput
            label="Subject Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />

          <TextArea
            label="Description"
            value={formDescription}
            onChange={(e) => setFormDescription(e.target.value)}
            rows={3}
          />

          <Select
            label="Status"
            value={formStatus}
            onChange={(e) => setFormStatus(e.target.value as SubjectStatus)}
          >
            <option value="ACTIVE">Active (Available for authoring)</option>
            <option value="ARCHIVED">Archived (Read-only)</option>
          </Select>

          <div className="mt-2 flex justify-end gap-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingSubject(null)}
              disabled={formSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={formSubmitting}>
              {formSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
