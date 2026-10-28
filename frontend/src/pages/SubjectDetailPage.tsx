import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Layers, BookOpen, Edit2 } from 'lucide-react';
import { PageHeader, Card, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { TextInput, TextArea, Select } from '../components/ui/FormControls';
import { Modal } from '../components/ui/Modal';
import { EmptyState, ErrorMessage, Skeleton } from '../components/ui/Feedback';
import { fetchSubject, fetchTopics, createTopic, updateTopic } from '../lib/api';
import type { Subject, Topic, TopicStatus } from '../types/academic';
import { useInstitution } from '../context/InstitutionContext';

export function SubjectDetailPage() {
  const { subjectId } = useParams<{ subjectId: string }>();
  const { institutionId } = useInstitution();

  const [subject, setSubject] = useState<Subject | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [isAddTopicOpen, setIsAddTopicOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);

  // Topic form states
  const [topicName, setTopicName] = useState('');
  const [topicCode, setTopicCode] = useState('');
  const [topicSequence, setTopicSequence] = useState<number>(1);
  const [topicDescription, setTopicDescription] = useState('');
  const [topicStatus, setTopicStatus] = useState<TopicStatus>('ACTIVE');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!subjectId) return;
    try {
      setLoading(true);
      setError(null);
      const [subjData, topicsData] = await Promise.all([
        fetchSubject(subjectId),
        fetchTopics(subjectId),
      ]);
      setSubject(subjData);
      setTopics(topicsData.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load subject details');
    } finally {
      setLoading(false);
    }
  }, [subjectId, institutionId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenAddTopic = () => {
    setTopicName('');
    setTopicCode(`Unit ${topics.length + 1}`);
    setTopicSequence(topics.length + 1);
    setTopicDescription('');
    setTopicStatus('ACTIVE');
    setFormError(null);
    setIsAddTopicOpen(true);
  };

  const handleOpenEditTopic = (topic: Topic) => {
    setEditingTopic(topic);
    setTopicName(topic.name);
    setTopicCode(topic.code || '');
    setTopicSequence(topic.sequenceOrder);
    setTopicDescription(topic.description || '');
    setTopicStatus(topic.status);
    setFormError(null);
  };

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId) return;
    setFormError(null);

    if (!topicName.trim()) {
      setFormError('Topic name is required.');
      return;
    }

    try {
      setSubmitting(true);
      await createTopic(subjectId, {
        name: topicName.trim(),
        code: topicCode.trim() || undefined,
        sequenceOrder: Number(topicSequence) || 0,
        description: topicDescription.trim() || undefined,
      });
      setIsAddTopicOpen(false);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create topic');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !editingTopic) return;
    setFormError(null);

    if (!topicName.trim()) {
      setFormError('Topic name is required.');
      return;
    }

    try {
      setSubmitting(true);
      await updateTopic(subjectId, editingTopic.id, {
        name: topicName.trim(),
        code: topicCode.trim() || null,
        sequenceOrder: Number(topicSequence) || 0,
        description: topicDescription.trim() || null,
        status: topicStatus,
      });
      setEditingTopic(null);
      await loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to update topic');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-48 rounded-control" />
        <Skeleton className="h-32 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/subjects" className="inline-flex items-center gap-1.5 text-support text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" />
          <span>Back to Subjects</span>
        </Link>
        <ErrorMessage>{error || 'Subject not found.'}</ErrorMessage>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={
          <Link
            to="/subjects"
            className="inline-flex items-center gap-1.5 text-meta font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="size-4" />
            <span>Back to Subjects</span>
          </Link>
        }
        eyebrow="Curriculum & Syllabus"
        title={`${subject.code} — ${subject.name}`}
        description={subject.description || 'No subject description provided.'}
        actions={
          <>
            <Link to={`/questions?subjectId=${subject.id}`}>
              <Button variant="outline" size="md">
                <BookOpen className="size-4" />
                <span>View Questions</span>
              </Button>
            </Link>
            <Button onClick={handleOpenAddTopic} size="md">
              <Plus className="size-4" />
              <span>Add Topic</span>
            </Button>
          </>
        }
      />

      {/* Subject Overview Card */}
      <Card>
        <CardBody className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-meta font-bold tracking-wider px-3 py-1 rounded-md bg-canvas-deep text-ink-soft">
                {subject.code}
              </span>
              <Badge tone={subject.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {subject.status === 'ACTIVE' ? 'Active' : 'Archived'}
              </Badge>
              <span className="text-support text-ink-muted">
                Created {new Date(subject.createdAt).toLocaleDateString()}
              </span>
            </div>

            <div className="flex items-center gap-6 text-support text-ink-soft">
              <div>
                <span className="font-semibold text-ink">{topics.length}</span>{' '}
                <span className="text-ink-muted">Syllabus Topics</span>
              </div>
              <div>
                <span className="font-semibold text-ink">{subject._count?.questions ?? 0}</span>{' '}
                <span className="text-ink-muted">Questions</span>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Topics / Syllabus Units Table */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-section font-semibold text-ink flex items-center gap-2">
          <Layers className="size-5 text-accent" />
          <span>Syllabus Topics & Units</span>
        </h2>
        <span className="text-meta text-ink-muted">Ordered curriculum units for question mapping</span>
      </div>

      {topics.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No syllabus topics added yet"
          description="Break this subject down into modules, chapters, or syllabus units to tag questions and ensure balanced examination paper coverage."
          action={
            <Button onClick={handleOpenAddTopic} variant="secondary">
              <Plus className="size-4" />
              <span>Add First Topic</span>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {topics.map((topic) => (
            <Card key={topic.id} className="transition-all hover:border-line-strong">
              <CardBody className="p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-canvas-deep font-mono text-meta font-semibold text-ink-soft">
                    {topic.sequenceOrder}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {topic.code && (
                        <span className="font-mono text-meta font-medium text-ink-muted">
                          [{topic.code}]
                        </span>
                      )}
                      <h3 className="text-body font-semibold text-ink truncate">{topic.name}</h3>
                      <Badge tone={topic.status === 'ACTIVE' ? 'success' : 'neutral'} className="text-xs">
                        {topic.status === 'ACTIVE' ? 'Active' : 'Archived'}
                      </Badge>
                    </div>
                    {topic.description && (
                      <p className="mt-0.5 text-support text-ink-muted line-clamp-1">
                        {topic.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEditTopic(topic)}
                    title="Edit topic"
                  >
                    <Edit2 className="size-3.5" />
                    <span>Edit</span>
                  </Button>
                  <Link to={`/questions?subjectId=${subject.id}&topicId=${topic.id}`}>
                    <Button variant="secondary" size="sm">
                      <span>Questions</span>
                    </Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Add Topic */}
      <Modal
        isOpen={isAddTopicOpen}
        onClose={() => setIsAddTopicOpen(false)}
        title="Add Syllabus Topic"
        description={`Add a new module or curriculum unit under ${subject.code}.`}
      >
        <form onSubmit={handleCreateTopic} className="flex flex-col gap-4">
          {formError && <ErrorMessage>{formError}</ErrorMessage>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextInput
              label="Topic Code / Identifier (Optional)"
              placeholder="e.g. Unit 1, Module A, Ch 3"
              value={topicCode}
              onChange={(e) => setTopicCode(e.target.value)}
              helperText="Short syllabus reference."
            />
            <TextInput
              label="Sequence Order"
              type="number"
              min="0"
              value={topicSequence}
              onChange={(e) => setTopicSequence(parseInt(e.target.value, 10) || 0)}
              helperText="Order in curriculum (1, 2, 3...)"
              required
            />
          </div>

          <TextInput
            label="Topic Name"
            placeholder="e.g. Asymptotic Analysis and Complexity"
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            required
            autoFocus
          />

          <TextArea
            label="Description (Optional)"
            placeholder="Key syllabus learning outcomes, topics covered..."
            value={topicDescription}
            onChange={(e) => setTopicDescription(e.target.value)}
            rows={3}
          />

          <div className="mt-2 flex justify-end gap-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddTopicOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Adding...' : 'Add Topic'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Edit Topic */}
      <Modal
        isOpen={Boolean(editingTopic)}
        onClose={() => setEditingTopic(null)}
        title={`Edit Topic — ${editingTopic?.name}`}
        description="Update the syllabus topic details, sequence, or status."
      >
        <form onSubmit={handleUpdateTopic} className="flex flex-col gap-4">
          {formError && <ErrorMessage>{formError}</ErrorMessage>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextInput
              label="Topic Code"
              placeholder="e.g. Unit 1"
              value={topicCode}
              onChange={(e) => setTopicCode(e.target.value)}
            />
            <TextInput
              label="Sequence Order"
              type="number"
              min="0"
              value={topicSequence}
              onChange={(e) => setTopicSequence(parseInt(e.target.value, 10) || 0)}
              required
            />
          </div>

          <TextInput
            label="Topic Name"
            value={topicName}
            onChange={(e) => setTopicName(e.target.value)}
            required
          />

          <TextArea
            label="Description"
            value={topicDescription}
            onChange={(e) => setTopicDescription(e.target.value)}
            rows={3}
          />

          <Select
            label="Status"
            value={topicStatus}
            onChange={(e) => setTopicStatus(e.target.value as TopicStatus)}
          >
            <option value="ACTIVE">Active (Available for questions)</option>
            <option value="ARCHIVED">Archived (Read-only)</option>
          </Select>

          <div className="mt-2 flex justify-end gap-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingTopic(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
