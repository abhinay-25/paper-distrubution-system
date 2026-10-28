import { getActiveInstitutionId } from '../context/InstitutionContext';
import type {
  Subject,
  Topic,
  Question,
  QuestionRevision,
  PaginatedResponse,
  CreateSubjectInput,
  UpdateSubjectInput,
  CreateTopicInput,
  UpdateTopicInput,
  CreateQuestionInput,
  UpdateQuestionInput,
  ListQuestionsQuery,
} from '../types/academic';
import type {
  PaperSubmission,
  PaperPdfArtifact,
  ReviewDecisionInput,
} from '../types/paper';
import type {
  AuthSessionResponse,
  InstitutionMemberDirectoryItem,
  ProvisionMemberInput,
  UpdateMembershipInput,
} from '../types/auth';
import type {
  SourceDocument,
  DocumentChunk,
  ListSourceDocumentsParams,
} from '../types/sourceDocument';

export class ApiError extends Error {
  public status: number;
  public details?: Record<string, unknown>;
  public requestId?: string;

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

const API_ORIGIN = (
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
).replace(/\/+$/, '');
const BASE_URL = `${API_ORIGIN}/api/v1`;

let inMemorySessionToken: string | null = null;

export function setInMemorySessionToken(token: string | null): void {
  inMemorySessionToken = token;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const institutionId = getActiveInstitutionId();
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (institutionId) {
    headers.set('x-institution-id', institutionId);
  }

  if (inMemorySessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemorySessionToken}`);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let errorMsg = `Request failed with status ${response.status}`;
    let details: Record<string, unknown> | undefined;
    let requestId: string | undefined;

    try {
      const data = await response.json();
      if (data.error) errorMsg = data.error;
      if (data.details) details = data.details;
      if (data.requestId) requestId = data.requestId;
    } catch {
      // Non-JSON response
      const text = await response.text();
      if (text) errorMsg = text;
    }

    throw new ApiError(response.status, errorMsg, details, requestId);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Subjects API
// ---------------------------------------------------------------------------

export async function fetchSubjects(params?: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<Subject>> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', params.page.toString());
  if (params?.pageSize) query.set('pageSize', params.pageSize.toString());

  const qs = query.toString();
  return request<PaginatedResponse<Subject>>(`/subjects${qs ? `?${qs}` : ''}`);
}

export async function fetchSubject(subjectId: string): Promise<Subject> {
  return request<Subject>(`/subjects/${subjectId}`);
}

export async function createSubject(input: CreateSubjectInput): Promise<Subject> {
  return request<Subject>('/subjects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateSubject(subjectId: string, input: UpdateSubjectInput): Promise<Subject> {
  return request<Subject>(`/subjects/${subjectId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Topics API
// ---------------------------------------------------------------------------

export async function fetchTopics(subjectId: string): Promise<{ data: Topic[] }> {
  return request<{ data: Topic[] }>(`/subjects/${subjectId}/topics`);
}

export async function fetchTopic(subjectId: string, topicId: string): Promise<Topic> {
  return request<Topic>(`/subjects/${subjectId}/topics/${topicId}`);
}

export async function createTopic(subjectId: string, input: CreateTopicInput): Promise<Topic> {
  return request<Topic>(`/subjects/${subjectId}/topics`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateTopic(
  subjectId: string,
  topicId: string,
  input: UpdateTopicInput,
): Promise<Topic> {
  return request<Topic>(`/subjects/${subjectId}/topics/${topicId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Questions API
// ---------------------------------------------------------------------------

export async function fetchQuestions(params?: ListQuestionsQuery): Promise<PaginatedResponse<Question>> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.subjectId) query.set('subjectId', params.subjectId);
  if (params?.topicId) query.set('topicId', params.topicId);
  if (params?.questionType) query.set('questionType', params.questionType);
  if (params?.difficulty) query.set('difficulty', params.difficulty);
  if (params?.lifecycle) query.set('lifecycle', params.lifecycle);
  if (params?.page) query.set('page', params.page.toString());
  if (params?.pageSize) query.set('pageSize', params.pageSize.toString());

  const qs = query.toString();
  return request<PaginatedResponse<Question>>(`/questions${qs ? `?${qs}` : ''}`);
}

export async function fetchQuestion(questionId: string): Promise<Question> {
  return request<Question>(`/questions/${questionId}`);
}

export async function createQuestion(input: CreateQuestionInput): Promise<Question> {
  return request<Question>('/questions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateQuestion(
  questionId: string,
  input: UpdateQuestionInput,
): Promise<Question> {
  return request<Question>(`/questions/${questionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function fetchQuestionRevisions(
  questionId: string,
): Promise<{ data: QuestionRevision[] }> {
  return request<{ data: QuestionRevision[] }>(`/questions/${questionId}/revisions`);
}

export async function fetchQuestionRevision(
  questionId: string,
  revisionId: string,
): Promise<QuestionRevision> {
  return request<QuestionRevision>(`/questions/${questionId}/revisions/${revisionId}`);
}

// ---------------------------------------------------------------------------
// Question Analysis API — Step 6
// ---------------------------------------------------------------------------

import type {
  QuestionAnalysis,
  TriggerAnalysisInput,
  ReviewAnalysisInput,
} from '../types/academic';

/** Trigger AI analysis for a specific revision. Returns 202 with the stored record. */
export async function triggerAnalysis(
  questionId: string,
  input: TriggerAnalysisInput,
): Promise<QuestionAnalysis> {
  return request<QuestionAnalysis>(`/questions/${questionId}/analyses`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** List all analyses for a question (newest first). */
export async function fetchAnalyses(
  questionId: string,
): Promise<{ data: QuestionAnalysis[] }> {
  return request<{ data: QuestionAnalysis[] }>(`/questions/${questionId}/analyses`);
}

/** Get a single analysis by ID. */
export async function fetchAnalysis(
  questionId: string,
  analysisId: string,
): Promise<QuestionAnalysis> {
  return request<QuestionAnalysis>(`/questions/${questionId}/analyses/${analysisId}`);
}

/** Faculty review: accept, override, or dismiss an AI analysis. */
export async function reviewAnalysis(
  questionId: string,
  analysisId: string,
  input: ReviewAnalysisInput,
): Promise<QuestionAnalysis> {
  return request<QuestionAnalysis>(`/questions/${questionId}/analyses/${analysisId}/review`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

// ---------------------------------------------------------------------------
// Question Generation API — Step 7
// ---------------------------------------------------------------------------

import type {
  GenerationJob,
  GeneratedQuestion,
  CreateGenerationJobInput,
  ReviewGeneratedQuestionInput,
} from '../types/academic';

/** Trigger an AI question generation job. Returns 201 with the created job. */
export async function createGenerationJob(
  input: CreateGenerationJobInput,
): Promise<GenerationJob> {
  return request<GenerationJob>('/generation-jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** List generation jobs for the institution. */
export async function fetchGenerationJobs(params?: {
  subjectId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<GenerationJob>> {
  const query = new URLSearchParams();
  if (params?.subjectId) query.set('subjectId', params.subjectId);
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', params.page.toString());
  if (params?.pageSize) query.set('pageSize', params.pageSize.toString());

  const qs = query.toString();
  return request<PaginatedResponse<GenerationJob>>(`/generation-jobs${qs ? `?${qs}` : ''}`);
}

/** Get a single generation job by ID. */
export async function fetchGenerationJob(jobId: string): Promise<GenerationJob> {
  return request<GenerationJob>(`/generation-jobs/${jobId}`);
}

/** List all generated questions for a job. */
export async function fetchGeneratedQuestions(
  jobId: string,
): Promise<{ data: GeneratedQuestion[] }> {
  return request<{ data: GeneratedQuestion[] }>(`/generation-jobs/${jobId}/questions`);
}

/** Faculty review: approve, edit, or reject a generated question candidate. */
export async function reviewGeneratedQuestion(
  jobId: string,
  questionId: string,
  input: ReviewGeneratedQuestionInput,
): Promise<GeneratedQuestion & { promotedQuestion?: { id: string } }> {
  return request<GeneratedQuestion & { promotedQuestion?: { id: string } }>(
    `/generation-jobs/${jobId}/questions/${questionId}/review`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

// ---------------------------------------------------------------------------
// Exam Configuration & Paper Builder API — Step 8
// ---------------------------------------------------------------------------

import type {
  ExamConfiguration,
  CreateExamConfigInput,
  UpdateExamConfigInput,
  ExamPaper,
  CreateExamPaperInput,
  UpdateExamPaperInput,
  PaperSection,
  CreateSectionInput,
  UpdateSectionInput,
  QuestionSlot,
  AddQuestionSlotInput,
  UpdateQuestionSlotInput,
  PaperValidationResult,
  PaperVersion,
  SaveVersionResponse,
  CompareVersionsResponse,
} from '../types/paper';

/** List exam configurations for the institution. */
export async function fetchExamConfigs(params?: {
  subjectId?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<ExamConfiguration>> {
  const query = new URLSearchParams();
  if (params?.subjectId) query.set('subjectId', params.subjectId);
  if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
  if (params?.page) query.set('page', params.page.toString());
  if (params?.pageSize) query.set('pageSize', params.pageSize.toString());

  const qs = query.toString();
  return request<PaginatedResponse<ExamConfiguration>>(`/exam-configs${qs ? `?${qs}` : ''}`);
}

/** Get a single exam configuration by ID. */
export async function fetchExamConfig(configId: string): Promise<ExamConfiguration> {
  return request<ExamConfiguration>(`/exam-configs/${configId}`);
}

/** Create a new exam configuration. */
export async function createExamConfig(input: CreateExamConfigInput): Promise<ExamConfiguration> {
  return request<ExamConfiguration>('/exam-configs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Update an existing exam configuration. */
export async function updateExamConfig(
  configId: string,
  input: UpdateExamConfigInput,
): Promise<ExamConfiguration> {
  return request<ExamConfiguration>(`/exam-configs/${configId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** List exam papers for the institution. */
export async function fetchExamPapers(params?: {
  configId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<ExamPaper>> {
  const query = new URLSearchParams();
  if (params?.configId) query.set('configId', params.configId);
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', params.page.toString());
  if (params?.pageSize) query.set('pageSize', params.pageSize.toString());

  const qs = query.toString();
  return request<PaginatedResponse<ExamPaper>>(`/exam-papers${qs ? `?${qs}` : ''}`);
}

/** Get an exam paper with its sections, slots, and immutable question revisions. */
export async function fetchExamPaper(paperId: string): Promise<ExamPaper> {
  return request<ExamPaper>(`/exam-papers/${paperId}`);
}

/** Create a new draft exam paper. */
export async function createExamPaper(input: CreateExamPaperInput): Promise<ExamPaper> {
  return request<ExamPaper>('/exam-papers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Update an exam paper draft header/notes. */
export async function updateExamPaper(
  paperId: string,
  input: UpdateExamPaperInput,
): Promise<ExamPaper> {
  return request<ExamPaper>(`/exam-papers/${paperId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Submit an exam paper for approval. Fails if validation errors exist. */
export async function submitExamPaper(
  paperId: string,
  notes?: string,
): Promise<ExamPaper> {
  return request<ExamPaper>(`/exam-papers/${paperId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

/** Run complete validation on a paper draft. */
export async function validateExamPaper(paperId: string): Promise<PaperValidationResult> {
  return request<PaperValidationResult>(`/exam-papers/${paperId}/validate`);
}

/** Add a section to an exam paper. */
export async function addPaperSection(
  paperId: string,
  input: CreateSectionInput,
): Promise<PaperSection> {
  return request<PaperSection>(`/exam-papers/${paperId}/sections`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Update a section in an exam paper. */
export async function updatePaperSection(
  paperId: string,
  sectionId: string,
  input: UpdateSectionInput,
): Promise<PaperSection> {
  return request<PaperSection>(`/exam-papers/${paperId}/sections/${sectionId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Delete a section from an exam paper. */
export async function deletePaperSection(
  paperId: string,
  sectionId: string,
): Promise<void> {
  await request<void>(`/exam-papers/${paperId}/sections/${sectionId}`, {
    method: 'DELETE',
  });
}

/** Add a question slot to a section using an immutable revisionId. */
export async function addQuestionSlot(
  paperId: string,
  sectionId: string,
  input: AddQuestionSlotInput,
): Promise<QuestionSlot> {
  return request<QuestionSlot>(`/exam-papers/${paperId}/sections/${sectionId}/slots`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Update a question slot (e.g. sequenceOrder, allocatedMarks, notes). */
export async function updateQuestionSlot(
  paperId: string,
  sectionId: string,
  slotId: string,
  input: UpdateQuestionSlotInput,
): Promise<QuestionSlot> {
  return request<QuestionSlot>(`/exam-papers/${paperId}/sections/${sectionId}/slots/${slotId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Remove a question slot from a section. */
export async function deleteQuestionSlot(
  paperId: string,
  sectionId: string,
  slotId: string,
): Promise<void> {
  await request<void>(`/exam-papers/${paperId}/sections/${sectionId}/slots/${slotId}`, {
    method: 'DELETE',
  });
}

// ---------------------------------------------------------------------------
// Step 9: Paper Preview & Versioning API
// ---------------------------------------------------------------------------

/** Get paper preview in faculty or candidate mode. */
export async function getPaperPreview(
  paperId: string,
  mode: 'faculty' | 'candidate' = 'faculty',
): Promise<ExamPaper> {
  return request<ExamPaper>(`/exam-papers/${paperId}/preview?mode=${mode}`);
}

/** Save an immutable snapshot version with optimistic concurrency check. */
export async function saveVersion(
  paperId: string,
  changeNote: string | undefined,
  concurrencyVersion: number,
): Promise<SaveVersionResponse> {
  return request<SaveVersionResponse>(`/exam-papers/${paperId}/versions`, {
    method: 'POST',
    body: JSON.stringify({ changeNote, concurrencyVersion }),
  });
}

/** List all historical versions for a paper (summary only). */
export async function listVersions(paperId: string): Promise<PaperVersion[]> {
  return request<PaperVersion[]>(`/exam-papers/${paperId}/versions`);
}

/** Get a full version snapshot by version number. */
export async function getVersion(
  paperId: string,
  versionNumber: number,
): Promise<PaperVersion> {
  return request<PaperVersion>(`/exam-papers/${paperId}/versions/${versionNumber}`);
}

/** Compare two versions of a paper side-by-side. */
export async function compareVersions(
  paperId: string,
  versionA: number,
  versionB: number,
): Promise<CompareVersionsResponse> {
  return request<CompareVersionsResponse>(
    `/exam-papers/${paperId}/versions/compare?versionA=${versionA}&versionB=${versionB}`,
  );
}

// ---------------------------------------------------------------------------
// Step 10: Independent Approval & PDF Generation API
// ---------------------------------------------------------------------------

/** Submit an eligible exam paper for independent review. */
export async function submitPaperForApproval(
  paperId: string,
  notes?: string,
): Promise<PaperSubmission> {
  return request<PaperSubmission>(`/exam-papers/${paperId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

/** Retrieve all submission and approval decision history for a paper. */
export async function getPaperSubmissions(paperId: string): Promise<PaperSubmission[]> {
  return request<PaperSubmission[]>(`/exam-papers/${paperId}/submissions`);
}

/** List submissions in the approval queue. */
export async function listSubmissions(params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<PaginatedResponse<PaperSubmission>> {
  const query = new URLSearchParams();
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', params.page.toString());
  if (params?.pageSize) query.set('pageSize', params.pageSize.toString());

  const qs = query.toString();
  return request<PaginatedResponse<PaperSubmission>>(`/paper-submissions${qs ? `?${qs}` : ''}`);
}

/** Get full details of a specific submission including immutable snapshot and validation. */
export async function getSubmission(submissionId: string): Promise<PaperSubmission> {
  return request<PaperSubmission>(`/paper-submissions/${submissionId}`);
}

/** Record an independent approval or rejection decision. */
export async function reviewSubmission(
  submissionId: string,
  input: ReviewDecisionInput,
): Promise<PaperSubmission> {
  return request<PaperSubmission>(`/paper-submissions/${submissionId}/decision`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Generate a college-template PDF for an approved paper. */
export async function generatePaperPdf(
  paperId: string,
  forceRegenerate = false,
): Promise<PaperPdfArtifact> {
  return request<PaperPdfArtifact>(`/exam-papers/${paperId}/pdf/generate`, {
    method: 'POST',
    body: JSON.stringify({ forceRegenerate }),
  });
}

/** Get generated PDF artifact metadata and integrity verification status. */
export async function getPaperPdfDetails(paperId: string): Promise<PaperPdfArtifact> {
  return request<PaperPdfArtifact>(`/exam-papers/${paperId}/pdf`);
}

/** Direct download URL for generated PDF artifact. */
export function getPdfDownloadUrl(paperId: string): string {
  return `${BASE_URL}/exam-papers/${paperId}/pdf/download`;
}

/** Inline preview URL for generated PDF artifact. */
export function getPdfPreviewUrl(paperId: string): string {
  return `${BASE_URL}/exam-papers/${paperId}/pdf/preview`;
}

/**
 * Fetch the generated PDF binary blob with institution and user context headers.
 * Used for both authenticated file download and embedded browser PDF preview.
 */
export async function fetchPaperPdfBlob(
  paperId: string,
): Promise<{ blob: Blob; fileName: string }> {
  const institutionId = getActiveInstitutionId();
  const headers = new Headers();
  if (institutionId) {
    headers.set('x-institution-id', institutionId);
  }
  if (inMemorySessionToken) {
    headers.set('Authorization', `Bearer ${inMemorySessionToken}`);
  }

  const response = await fetch(`${BASE_URL}/exam-papers/${paperId}/pdf/download`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let errorMsg = `Failed to download PDF (status ${response.status})`;
    try {
      const data = await response.json();
      if (data.error) errorMsg = data.error;
    } catch {
      // ignore non-json
    }
    throw new ApiError(response.status, errorMsg);
  }

  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match?.[1] || `paper_${paperId}.pdf`;
  const blob = await response.blob();

  return { blob, fileName };
}

/**
 * Trigger a browser download of the official PDF artifact with tenant context headers.
 */
export async function downloadPaperPdf(paperId: string): Promise<void> {
  const { blob, fileName } = await fetchPaperPdfBlob(paperId);
  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  }
}

// ---------------------------------------------------------------------------
// Step 4: Institution Dashboard Summary API
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  institution: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  subjects: {
    total: number;
    active: number;
    archived: number;
  };
  questions: {
    total: number;
    active: number;
    draft: number;
    retired: number;
  };
  generationJobs: {
    total: number;
    completed: number;
    running: number;
    pending: number;
    failed: number;
    pendingCandidateReviews: number;
  };
  examinations: {
    total: number;
    active: number;
    inactive: number;
  };
  papers: {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
  };
  submissions: {
    total: number;
    pending: number;
    approved: number;
    changesRequested: number;
    rejected: number;
  };
  sourceDocuments?: {
    total: number;
    indexed: number;
    processing: number;
    failed: number;
    totalChunks: number;
  };
}

/** Fetch institution-scoped summary counts across all academic modules. */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/dashboard');
}

// ---------------------------------------------------------------------------
// Step 6: Authentication, RBAC & Institution Memberships API
// ---------------------------------------------------------------------------

/** Authenticate with email and password. Sets HttpOnly cookie on response. */
export async function loginUser(input: {
  email: string;
  password: string;
  institutionId?: string;
}): Promise<AuthSessionResponse> {
  const res = await request<AuthSessionResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (res.sessionToken) {
    setInMemorySessionToken(res.sessionToken);
  }
  return res;
}

/** Log out and revoke server-side session token. */
export async function logoutUser(): Promise<void> {
  try {
    await request<{ status: string }>('/auth/logout', {
      method: 'POST',
    });
  } finally {
    setInMemorySessionToken(null);
  }
}

/** Restore or inspect the current authenticated session. */
export async function fetchCurrentSession(
  institutionId?: string,
): Promise<AuthSessionResponse> {
  const headers: Record<string, string> = {};
  if (institutionId) {
    headers['x-institution-id'] = institutionId;
  }
  return request<AuthSessionResponse>('/auth/me', {
    method: 'GET',
    headers,
  });
}

/** Switch active institution context for a multi-institution user. */
export async function switchActiveInstitution(
  institutionId: string,
): Promise<AuthSessionResponse> {
  const res = await request<AuthSessionResponse>('/auth/switch-institution', {
    method: 'POST',
    body: JSON.stringify({ institutionId }),
  });
  if (res.sessionToken) {
    setInMemorySessionToken(res.sessionToken);
  }
  return res;
}

/** List all members for the active institution (requires memberships:manage). */
export async function fetchInstitutionMemberships(): Promise<
  InstitutionMemberDirectoryItem[]
> {
  const res = await request<{ data: InstitutionMemberDirectoryItem[] }>(
    '/institutions/memberships',
  );
  return res.data;
}

/** Provision a new or existing user into the active institution (requires memberships:manage). */
export async function provisionInstitutionMember(
  input: ProvisionMemberInput,
): Promise<InstitutionMemberDirectoryItem> {
  return request<InstitutionMemberDirectoryItem>('/institutions/memberships', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** Update role or active status of an institution membership (requires memberships:manage). */
export async function updateInstitutionMembership(
  membershipId: string,
  input: UpdateMembershipInput,
): Promise<InstitutionMemberDirectoryItem> {
  return request<InstitutionMemberDirectoryItem>(
    `/institutions/memberships/${membershipId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

// ---------------------------------------------------------------------------
// Step 7 — Source Documents & RAG Grounding API
// ---------------------------------------------------------------------------

/** Upload a syllabus / reference document (PDF, TXT, DOCX). */
export async function uploadSourceDocument(formData: FormData): Promise<SourceDocument> {
  return request<SourceDocument>('/source-documents', {
    method: 'POST',
    body: formData,
  });
}

/** List source documents for the active institution with optional filters. */
export async function fetchSourceDocuments(
  params?: ListSourceDocumentsParams,
): Promise<SourceDocument[]> {
  const query = new URLSearchParams();
  if (params?.subjectId) query.set('subjectId', params.subjectId);
  if (params?.status) query.set('status', params.status);
  const qs = query.toString();
  return request<SourceDocument[]>(`/source-documents${qs ? `?${qs}` : ''}`);
}

/** Get single source document details. */
export async function fetchSourceDocument(id: string): Promise<SourceDocument> {
  return request<SourceDocument>(`/source-documents/${id}`);
}

/** Request re-indexing / reprocessing for a source document. */
export async function reprocessSourceDocument(id: string): Promise<SourceDocument> {
  return request<SourceDocument>(`/source-documents/${id}/reprocess`, {
    method: 'POST',
  });
}

/** Delete a source document and its indexed vector chunks. */
export async function deleteSourceDocument(
  id: string,
): Promise<{ success: boolean; id: string }> {
  return request<{ success: boolean; id: string }>(`/source-documents/${id}`, {
    method: 'DELETE',
  });
}

/** Inspect extracted text chunks for a document. */
export async function fetchDocumentChunks(id: string): Promise<DocumentChunk[]> {
  return request<DocumentChunk[]>(`/source-documents/${id}/chunks`);
}






