import type { Difficulty, QuestionType } from './academic';

export type PaperStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

export interface ExamConfiguration {
  id: string;
  institutionId: string;
  subjectId: string;
  name: string;
  description: string | null;
  totalMarks: string | number;
  passingMarks: string | number | null;
  durationMinutes: number | null;
  instructions: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subject?: {
    id: string;
    name: string;
    code: string;
  };
  _count?: {
    papers: number;
  };
}

export interface CreateExamConfigInput {
  subjectId: string;
  name: string;
  description?: string;
  totalMarks: number;
  passingMarks?: number;
  durationMinutes?: number;
  instructions?: string;
}

export interface UpdateExamConfigInput {
  name?: string;
  description?: string | null;
  totalMarks?: number;
  passingMarks?: number | null;
  durationMinutes?: number | null;
  instructions?: string | null;
  isActive?: boolean;
}

export interface PaperSection {
  id: string;
  paperId: string;
  sectionLabel: string;
  title: string;
  description: string | null;
  sequenceOrder: number;
  totalSlots: number;
  requiredAnswers: number | null;
  sectionMarks: string | number;
  slots: QuestionSlot[];
}

export interface QuestionSlotRevision {
  id: string;
  revisionNumber: number;
  questionText: string;
  questionType: QuestionType;
  marks: string | number;
  difficulty: Difficulty | null;
  language?: string;
  explanation?: string | null;
  analyses?: {
    aiBloomsLevel?: string | null;
    facultyBloomsLevel?: string | null;
    reviewStatus?: string;
    hasPotentialDuplicates: boolean;
    hasNearDuplicates: boolean;
  }[];
  questionTopicMaps?: {
    topic: {
      id?: string;
      name: string;
      code?: string | null;
      sequenceOrder?: number;
    };
  }[];
  question?: {
    questionTopicMaps?: {
      topic: {
        id?: string;
        name: string;
        code?: string | null;
        sequenceOrder?: number;
      };
    }[];
  };
}

export interface QuestionSlot {
  id: string;
  sectionId: string;
  questionId: string;
  revisionId: string;
  sequenceOrder: number;
  allocatedMarks: string | number;
  notes: string | null;
  revision: QuestionSlotRevision;
}

export interface ExamPaper {
  id: string;
  institutionId: string;
  configId: string;
  title: string;
  status: PaperStatus;
  version: number;
  concurrencyVersion: number;
  createdBy: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  config: ExamConfiguration;
  sections: PaperSection[];
  _count?: {
    sections: number;
  };
}

export interface CreateExamPaperInput {
  configId: string;
  title: string;
  notes?: string;
  sections?: CreateSectionInput[];
}

export interface UpdateExamPaperInput {
  title?: string;
  notes?: string | null;
}

export interface CreateSectionInput {
  sectionLabel: string;
  title: string;
  description?: string;
  sequenceOrder?: number;
  requiredAnswers?: number | null;
}

export interface UpdateSectionInput {
  sectionLabel?: string;
  title?: string;
  description?: string | null;
  sequenceOrder?: number;
  requiredAnswers?: number | null;
}

export interface AddQuestionSlotInput {
  questionId: string;
  revisionId: string;
  sequenceOrder?: number;
  allocatedMarks: number;
  notes?: string;
}

export interface UpdateQuestionSlotInput {
  sequenceOrder?: number;
  allocatedMarks?: number;
  notes?: string | null;
}

export interface PaperValidationIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface SectionCalculationSummary {
  sectionId: string;
  sectionLabel: string;
  title: string;
  slotCount: number;
  requiredAnswers: number | null;
  printedMarks: number;
  achievableMarks: number;
  isOptionalChoice: boolean;
  isChoiceAmbiguous: boolean;
  ambiguityReason?: string;
}

export interface TopicCoverageItem {
  topicId: string;
  topicName: string;
  questionCount: number;
  allocatedMarks: number;
}

export interface PaperValidationResult {
  valid: boolean;
  totalMarks: number;
  printedMarks: number;
  achievableMarks: number;
  configTotalMarks: number;
  marksDiscrepancy: number;
  slotCount: number;
  requiredQuestionCount: number;
  sectionCount: number;
  issues: PaperValidationIssue[];
  sectionSummaries: SectionCalculationSummary[];
  syllabusTopicCoverage: TopicCoverageItem[];
  difficultyDistribution: Record<string, number>;
  duplicateWarningsCount: number;
}

// ---------------------------------------------------------------------------
// Step 9: Paper Versioning & Preview types
// ---------------------------------------------------------------------------

export interface PaperVersion {
  id: string;
  paperId: string;
  versionNumber: number;
  changeNote?: string | null;
  createdAt: string;
  snapshotJson?: ExamPaper;
}

export interface SaveVersionResponse {
  versionNumber: number;
  concurrencyVersion: number;
}

export interface CompareVersionsResponse {
  versionA: ExamPaper;
  versionB: ExamPaper;
}

// ---------------------------------------------------------------------------
// Step 10: Independent Approval & PDF Generation types
// ---------------------------------------------------------------------------

export type PaperSubmissionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';

export interface PaperSubmission {
  id: string;
  institutionId: string;
  paperId: string;
  paperVersionId: string;
  submittedBy: string;
  submitterNotes: string | null;
  status: PaperSubmissionStatus;
  validationSnapshot: PaperValidationResult;
  decidedBy: string | null;
  decision: string | null;
  reviewComments: string | null;
  submittedAt: string;
  decidedAt: string | null;
  paper?: {
    id: string;
    title: string;
    status?: PaperStatus;
    config?: {
      id: string;
      name: string;
      totalMarks: string | number;
      subject?: {
        id: string;
        name: string;
        code: string;
      };
    };
  };
  version?: {
    id: string;
    versionNumber: number;
    createdAt: string;
    snapshotJson?: ExamPaper;
  };
}

export interface PaperPdfArtifact {
  id: string;
  institutionId: string;
  paperId: string;
  paperVersionId: string;
  templateId: string;
  templateVersion: string;
  rendererVersion: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  checksumSha256: string;
  pageCount: number;
  generatedBy: string | null;
  createdAt: string;
  integrityVerified?: boolean;
  actualChecksum?: string;
  version?: {
    versionNumber: number;
    createdAt: string;
  };
}

export interface ReviewDecisionInput {
  decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  comments?: string;
}


