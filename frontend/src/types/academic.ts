/**
 * Academic data and question bank types for frontend.
 * Matches backend Prisma models and Zod schemas.
 */

export type SubjectStatus = 'ACTIVE' | 'ARCHIVED';
export type TopicStatus = 'ACTIVE' | 'ARCHIVED';
export type QuestionLifecycle = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ARCHIVED';
export type QuestionType =
  | 'MULTIPLE_CHOICE'
  | 'SHORT_ANSWER'
  | 'LONG_ANSWER'
  | 'CODE'
  | 'NUMERICAL';
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface Subject {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  description: string | null;
  status: SubjectStatus;
  createdAt: string;
  updatedAt: string;
  _count?: {
    topics: number;
    questions: number;
  };
}

export interface Topic {
  id: string;
  institutionId: string;
  subjectId: string;
  name: string;
  code: string | null;
  description: string | null;
  sequenceOrder: number;
  status: TopicStatus;
  createdAt: string;
  updatedAt: string;
  _count?: {
    questions: number;
  };
}

export interface QuestionRevisionTopic {
  id: string;
  name: string;
  code: string | null;
}

export interface QuestionRevision {
  id: string;
  questionId: string;
  revisionNumber: number;
  questionText: string;
  questionType: QuestionType;
  marks: string | number;
  language: string;
  difficulty: Difficulty | null;
  explanation: string | null;
  authorId: string | null;
  createdAt: string;
  topics: QuestionRevisionTopic[];
}

export interface Question {
  id: string;
  institutionId: string;
  subjectId: string;
  lifecycle: QuestionLifecycle;
  currentRevisionNumber: number;
  createdAt: string;
  updatedAt: string;
  subject?: {
    id: string;
    name: string;
    code: string;
  };
  currentRevision?: QuestionRevision;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateSubjectInput {
  name: string;
  code: string;
  description?: string;
}

export interface UpdateSubjectInput {
  name?: string;
  description?: string | null;
  status?: SubjectStatus;
}

export interface CreateTopicInput {
  name: string;
  code?: string;
  description?: string;
  sequenceOrder?: number;
}

export interface UpdateTopicInput {
  name?: string;
  code?: string | null;
  description?: string | null;
  sequenceOrder?: number;
  status?: TopicStatus;
}

export interface CreateQuestionInput {
  subjectId: string;
  questionText: string;
  questionType: QuestionType;
  marks: number;
  language?: string;
  difficulty?: Difficulty | null;
  explanation?: string;
  topicIds?: string[];
  lifecycle?: QuestionLifecycle;
}

export interface UpdateQuestionInput {
  questionText: string;
  questionType: QuestionType;
  marks: number;
  language: string;
  difficulty?: Difficulty | null;
  explanation?: string | null;
  topicIds: string[];
  lifecycle?: QuestionLifecycle;
  expectedRevisionNumber: number;
}

export interface ListQuestionsQuery {
  search?: string;
  subjectId?: string;
  topicId?: string;
  questionType?: QuestionType;
  difficulty?: Difficulty;
  lifecycle?: QuestionLifecycle;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Step 6 — Question Intelligence types
// ---------------------------------------------------------------------------

export type BloomsLevel =
  | 'REMEMBER' | 'UNDERSTAND' | 'APPLY' | 'ANALYZE' | 'EVALUATE' | 'CREATE' | 'UNDETERMINED';

export type AIDifficultySuggestion = 'EASY' | 'MEDIUM' | 'HARD' | 'UNDETERMINED';

export type AIAnalysisReviewStatus = 'PENDING' | 'ACCEPTED' | 'OVERRIDDEN' | 'DISMISSED';

export interface DuplicateCandidateSummary {
  candidateId: string;
  similarityScore: number;
  isNearDuplicate: boolean;
  isPotentialDuplicate: boolean;
}

export interface QuestionAnalysis {
  id: string;
  revisionId: string;
  questionId: string;
  // AI Classification
  aiBloomsLevel: BloomsLevel;
  aiBloomsConfidence: number;
  aiSubjectTags: string[];
  aiQuestionTypeHint: string;
  // AI Difficulty
  aiSuggestedDifficulty: AIDifficultySuggestion;
  aiDifficultyConfidence: number;
  aiDifficultyRationale: string;
  // Duplicate detection
  hasPotentialDuplicates: boolean;
  hasNearDuplicates: boolean;
  duplicateCandidates: DuplicateCandidateSummary[];
  nearDuplicateThreshold: number;
  potentialDuplicateThreshold: number;
  // Review
  reviewStatus: AIAnalysisReviewStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  facultyBloomsLevel: BloomsLevel | null;
  facultyDifficulty: Difficulty | null;
  facultyNotes: string | null;
  // Provenance
  aiProvider: string;
  aiModel: string;
  durationMs: number;
  createdAt: string;
}

export interface TriggerAnalysisInput {
  revisionId: string;
  skipDuplicateDetection?: boolean;
}

export interface ReviewAnalysisInput {
  reviewAction: 'ACCEPTED' | 'OVERRIDDEN' | 'DISMISSED';
  facultyBloomsLevel?: BloomsLevel;
  facultyDifficulty?: Difficulty;
  facultyNotes?: string;
}

// ---------------------------------------------------------------------------
// Question Generation types — Step 7
// ---------------------------------------------------------------------------

export type GenerationJobStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type GeneratedQuestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED';

export interface GenerationJob {
  id: string;
  institutionId: string;
  subjectId: string;
  topicId: string | null;
  requestedBy: string | null;
  questionType: QuestionType;
  difficulty: Difficulty | null;
  count: number;
  language: string;
  contextHint: string | null;
  sourceDocumentIds?: string[];
  groundingMode?: string | null;
  status: GenerationJobStatus;
  errorMessage: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
  subject?: {
    id: string;
    name: string;
    code: string;
  };
  topic?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
  _count?: {
    generatedQuestions: number;
  };
}

export interface GeneratedQuestion {
  id: string;
  jobId: string;
  questionText: string;
  questionType: QuestionType;
  suggestedAnswer: string | null;
  explanation: string | null;
  difficulty: Difficulty | null;
  bloomsLevel: string | null;
  subjectTags: string[];
  sourceChunkIds?: string[];
  metadata?: {
    sources?: Array<{
      chunkId: string;
      documentId: string;
      documentTitle: string;
      pageNumber: number | null;
      similarityScore: number;
    }>;
    groundingMode?: string;
  } | null;
  status: GeneratedQuestionStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  promotedQuestionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGenerationJobInput {
  subjectId: string;
  topicId?: string;
  questionType: QuestionType;
  difficulty?: Difficulty;
  count: number;
  language?: string;
  contextHint?: string;
  useRag?: boolean;
  sourceDocumentIds?: string[];
}

export interface ReviewGeneratedQuestionInput {
  reviewAction: 'APPROVED' | 'EDITED' | 'REJECTED';
  subjectId?: string;
  topicIds?: string[];
  marks?: number;
  editedQuestionText?: string;
  reviewNotes?: string;
}
