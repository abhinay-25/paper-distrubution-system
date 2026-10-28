import { useEffect, useState, useCallback, useRef } from 'react';
import {
  FileText,
  Upload,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Layers,
  Search,
} from 'lucide-react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, PageHeader } from '../components/ui/Card';
import { ErrorMessage } from '../components/ui/Feedback';
import { Select, TextInput } from '../components/ui/FormControls';
import { Modal } from '../components/ui/Modal';
import {
  fetchSourceDocuments,
  uploadSourceDocument,
  reprocessSourceDocument,
  deleteSourceDocument,
  fetchDocumentChunks,
  fetchSubjects,
} from '../lib/api';
import type { SourceDocument, DocumentChunk, DocumentStatus } from '../types/sourceDocument';
import type { Subject } from '../types/academic';

export function SourceDocumentsPage() {
  const [documents, setDocuments] = useState<SourceDocument[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadSubjectId, setUploadSubjectId] = useState<string>('');
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter state
  const [filterSubjectId, setFilterSubjectId] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Chunks Modal state
  const [activeDocForChunks, setActiveDocForChunks] = useState<SourceDocument | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState<boolean>(false);

  // Polling ref for documents in PROCESSING / UPLOADED status
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDocuments = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchSourceDocuments({
        subjectId: filterSubjectId || undefined,
        status: (filterStatus as DocumentStatus) || undefined,
      });
      setDocuments(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load source documents');
    } finally {
      setLoading(false);
    }
  }, [filterSubjectId, filterStatus]);

  useEffect(() => {
    async function initSubjects() {
      try {
        const subRes = await fetchSubjects({ pageSize: 100 });
        setSubjects(subRes.data);
      } catch (err) {
        console.error('Failed to load subjects:', err);
      }
    }
    void initSubjects();
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadDocuments();
  }, [loadDocuments]);

  // Auto-refresh when any document is in PROCESSING or UPLOADED
  useEffect(() => {
    const hasPending = documents.some(
      (d) => d.status === 'PROCESSING' || d.status === 'UPLOADED',
    );

    if (hasPending) {
      pollTimerRef.current = setTimeout(() => {
        void loadDocuments();
      }, 3000);
    }

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [documents, loadDocuments]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!uploadTitle) {
        setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
      }
      setUploadError(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a file to upload');
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      const formData = new FormData();
      formData.append('file', selectedFile);
      if (uploadTitle.trim()) {
        formData.append('title', uploadTitle.trim());
      }
      if (uploadSubjectId) {
        formData.append('subjectId', uploadSubjectId);
      }

      await uploadSourceDocument(formData);

      // Reset form
      setSelectedFile(null);
      setUploadTitle('');
      setUploadSubjectId('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      await loadDocuments();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleReprocess = async (docId: string) => {
    try {
      await reprocessSourceDocument(docId);
      await loadDocuments();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reprocess document');
    }
  };

  const handleDelete = async (doc: SourceDocument) => {
    if (!confirm(`Are you sure you want to delete "${doc.title}" and its indexed chunks?`)) {
      return;
    }
    try {
      await deleteSourceDocument(doc.id);
      await loadDocuments();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  const handleViewChunks = async (doc: SourceDocument) => {
    setActiveDocForChunks(doc);
    setLoadingChunks(true);
    try {
      const chunksData = await fetchDocumentChunks(doc.id);
      setChunks(chunksData);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to load document chunks');
    } finally {
      setLoadingChunks(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const filteredDocs = documents.filter((doc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.originalFilename.toLowerCase().includes(q) ||
      doc.subject?.name.toLowerCase().includes(q) ||
      doc.subject?.code.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge Base"
        title="Source Documents & Syllabus RAG"
        description="Upload course syllabi, textbooks, and lecture notes. Extracted text is indexed into high-dimensional vector embeddings for grounded AI question generation and syllabus coverage."
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadDocuments()}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {error && <ErrorMessage message={error} />}

      {/* Upload Box */}
      <Card>
        <CardHeader className="border-b border-line pb-4">
          <h2 className="text-section font-semibold text-ink">Upload Reference Document</h2>
          <p className="mt-1 text-meta text-ink-muted">
            Supports PDF (.pdf), Microsoft Word (.docx), and Plain Text (.txt) up to 50MB. Text will be chunked into segments and embedded using SentenceTransformers.
          </p>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Document File *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                  className="block w-full text-sm text-slate-500 dark:text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-slate-800 dark:file:text-blue-400"
                />
                {selectedFile && (
                  <p className="mt-1 text-xs text-slate-500">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>

              <div>
                <TextInput
                  label="Document Title (Optional)"
                  placeholder="e.g. Unit 4 - Sliding Window & TCP Congestion"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </div>

              <div>
                <Select
                  label="Target Subject (Optional)"
                  value={uploadSubjectId}
                  onChange={(e) => setUploadSubjectId(e.target.value)}
                >
                  <option value="">-- General / No Subject Scope --</option>
                  {subjects.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.code} — {sub.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {uploadError && <ErrorMessage message={uploadError} />}

            <div className="flex justify-end pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={!selectedFile || uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading & Queueing Indexer...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Extract Chunks
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filterSubjectId}
            onChange={(e) => setFilterSubjectId(e.target.value)}
            className="px-3 py-1.5 text-sm bg-surface rounded-control border border-line text-ink"
          >
            <option value="">All Subjects</option>
            {subjects.map((sub) => (
              <option key={sub.id} value={sub.id}>
                {sub.code} — {sub.name}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 text-sm bg-surface rounded-control border border-line text-ink"
          >
            <option value="">All Statuses</option>
            <option value="INDEXED">Indexed</option>
            <option value="PROCESSING">Processing</option>
            <option value="UPLOADED">Uploaded</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          Showing {filteredDocs.length} of {documents.length} source documents
        </div>
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="p-12 text-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
          Loading source documents...
        </div>
      ) : filteredDocs.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-slate-500">
            <FileText className="w-12 h-12 mx-auto mb-3 text-slate-300 dark:text-slate-700" />
            <p className="text-base font-medium text-slate-700 dark:text-slate-300">
              No source documents found
            </p>
            <p className="text-sm mt-1 text-slate-400">
              Upload a syllabus or reference material above to enable grounded AI question generation.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => {
            const isIndexed = doc.status === 'INDEXED';
            const isProcessing = doc.status === 'PROCESSING' || doc.status === 'UPLOADED';
            const isFailed = doc.status === 'FAILED';

            return (
              <Card key={doc.id} className="flex flex-col justify-between">
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-900 dark:text-white truncate" title={doc.title}>
                        {doc.title}
                      </h4>
                      <p className="text-xs text-slate-500 truncate" title={doc.originalFilename}>
                        {doc.originalFilename} • {formatFileSize(doc.fileSizeBytes)}
                      </p>
                    </div>

                    <div>
                      {isIndexed && (
                        <Badge tone="success" className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          INDEXED
                        </Badge>
                      )}
                      {isProcessing && (
                        <Badge tone="accent" className="flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {doc.status}
                        </Badge>
                      )}
                      {isFailed && (
                        <Badge tone="danger" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          FAILED
                        </Badge>
                      )}
                    </div>
                  </div>

                  {doc.subject && (
                    <div className="inline-block">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                        {doc.subject.code} — {doc.subject.name}
                      </span>
                    </div>
                  )}

                  {doc.errorMessage && (
                    <div className="p-2 text-xs bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded border border-red-200 dark:border-red-900">
                      Error: {doc.errorMessage}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="font-medium text-slate-900 dark:text-slate-200">
                        {doc.chunkCount}
                      </span>{' '}
                      chunks
                      {doc.pageCount ? ` • ${doc.pageCount} pgs` : ''}
                    </div>
                    <div className="text-right">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  {doc.uploadedBy && (
                    <p className="text-xs text-slate-400">
                      By: {doc.uploadedBy.displayName}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {isIndexed && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleViewChunks(doc)}
                        title="Inspect Chunks"
                      >
                        <Layers className="w-4 h-4 mr-1 text-slate-600" />
                        Chunks
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleReprocess(doc.id)}
                      title="Re-index document"
                    >
                      <RefreshCw className="w-4 h-4 text-slate-600" />
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDelete(doc)}
                      title="Delete document"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      {/* Inspect Chunks Modal */}
      {activeDocForChunks && (
        <Modal
          isOpen={true}
          onClose={() => setActiveDocForChunks(null)}
          title={`Chunks: ${activeDocForChunks.title}`}
          maxWidth="xl"
        >
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-800">
              <div>
                Total Chunks: <span className="font-semibold text-slate-900 dark:text-white">{chunks.length}</span>
              </div>
              <div>
                Original: <span className="font-mono text-xs">{activeDocForChunks.originalFilename}</span>
              </div>
            </div>

            {loadingChunks ? (
              <div className="py-12 text-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                Retrieving chunks...
              </div>
            ) : chunks.length === 0 ? (
              <p className="text-center text-slate-500 py-6">No chunks found for this document.</p>
            ) : (
              <div className="space-y-3">
                {chunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        Chunk #{chunk.chunkIndex + 1}
                      </span>
                      <span>
                        {chunk.pageNumber ? `Page ${chunk.pageNumber} • ` : ''}
                        {chunk.tokenCount ? `~${chunk.tokenCount} tokens` : ''}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
                      {chunk.chunkText}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
