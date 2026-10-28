/**
 * Zod schemas for Step 8: Examination Configuration and Question Paper Builder.
 * All route handlers import from here — no ad-hoc validation in handlers.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PAPER_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"] as const;

const MAX_TOTAL_MARKS = 9999.99;
const MIN_MARKS = 0.5;

// ---------------------------------------------------------------------------
// Shared mark schema
// ---------------------------------------------------------------------------

const marksSchema = z
  .number()
  .positive("marks must be positive")
  .max(MAX_TOTAL_MARKS)
  .min(MIN_MARKS)
  .transform((v) => Math.round(v * 100) / 100);

// ---------------------------------------------------------------------------
// ExamConfiguration schemas
// ---------------------------------------------------------------------------

export const createExamConfigSchema = z.object({
  subjectId: z.string().uuid("subjectId must be a valid UUID"),
  name: z.string().trim().min(1, "name is required").max(300),
  description: z.string().trim().max(2000).optional(),
  totalMarks: marksSchema,
  passingMarks: marksSchema.optional(),
  durationMinutes: z.number().int().min(1).max(600).optional(),
  instructions: z.string().trim().max(5000).optional(),
});

export const updateExamConfigSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    totalMarks: marksSchema.optional(),
    passingMarks: marksSchema.optional().nullable(),
    durationMinutes: z.number().int().min(1).max(600).optional().nullable(),
    instructions: z.string().trim().max(5000).optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided for update",
  });

export const listExamConfigsQuerySchema = z.object({
  subjectId: z.string().uuid().optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const examConfigParamSchema = z.object({
  configId: z.string().uuid("configId must be a valid UUID"),
});

// ---------------------------------------------------------------------------
// ExamPaper schemas
// ---------------------------------------------------------------------------

/** Inline section definition when creating a paper */
const sectionInputSchema = z.object({
  sectionLabel: z.string().trim().min(1).max(10),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(1000).optional(),
  sequenceOrder: z.number().int().min(0).default(0),
  requiredAnswers: z.number().int().min(1).optional(),
});

export const createExamPaperSchema = z.object({
  configId: z.string().uuid("configId must be a valid UUID"),
  title: z.string().trim().min(1, "title is required").max(500),
  notes: z.string().trim().max(2000).optional(),
  sections: z.array(sectionInputSchema).max(20).default([]),
});

export const updateExamPaperSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided for update",
  });

export const listExamPapersQuerySchema = z.object({
  configId: z.string().uuid().optional(),
  status: z.enum(PAPER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const paperParamSchema = z.object({
  paperId: z.string().uuid("paperId must be a valid UUID"),
});

export const submitPaperSchema = z.object({
  notes: z.string().trim().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// PaperSection schemas
// ---------------------------------------------------------------------------

export const createSectionSchema = z.object({
  sectionLabel: z.string().trim().min(1).max(10),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(1000).optional(),
  sequenceOrder: z.number().int().min(0).default(0),
  requiredAnswers: z.number().int().min(1).optional(),
});

export const updateSectionSchema = z
  .object({
    sectionLabel: z.string().trim().min(1).max(10).optional(),
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    sequenceOrder: z.number().int().min(0).optional(),
    requiredAnswers: z.number().int().min(1).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided for update",
  });

export const sectionParamSchema = z.object({
  paperId: z.string().uuid("paperId must be a valid UUID"),
  sectionId: z.string().uuid("sectionId must be a valid UUID"),
});

// ---------------------------------------------------------------------------
// QuestionSlot schemas
// ---------------------------------------------------------------------------

export const addQuestionSlotSchema = z.object({
  questionId: z.string().uuid("questionId must be a valid UUID"),
  revisionId: z.string().uuid("revisionId must be a valid UUID"),
  sequenceOrder: z.number().int().min(0).default(0),
  allocatedMarks: marksSchema,
  notes: z.string().trim().max(500).optional(),
});

export const updateQuestionSlotSchema = z
  .object({
    sequenceOrder: z.number().int().min(0).optional(),
    allocatedMarks: marksSchema.optional(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided for update",
  });

export const slotParamSchema = z.object({
  paperId: z.string().uuid(),
  sectionId: z.string().uuid(),
  slotId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Paper validation result types
// ---------------------------------------------------------------------------

export interface PaperValidationIssue {
  severity: "ERROR" | "WARNING" | "INFO";
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface TopicCoverageItem {
  topicId: string;
  topicName: string;
  questionCount: number;
  allocatedMarks: number;
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
// Inferred types
// ---------------------------------------------------------------------------

export type CreateExamConfigInput = z.infer<typeof createExamConfigSchema>;
export type UpdateExamConfigInput = z.infer<typeof updateExamConfigSchema>;
export type ListExamConfigsQuery = z.infer<typeof listExamConfigsQuerySchema>;
export type CreateExamPaperInput = z.infer<typeof createExamPaperSchema>;
export type UpdateExamPaperInput = z.infer<typeof updateExamPaperSchema>;
export type ListExamPapersQuery = z.infer<typeof listExamPapersQuerySchema>;
export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type AddQuestionSlotInput = z.infer<typeof addQuestionSlotSchema>;
export type UpdateQuestionSlotInput = z.infer<typeof updateQuestionSlotSchema>;

// ---------------------------------------------------------------------------
// Step 9 — Versioning & Preview schemas
// ---------------------------------------------------------------------------

export const saveVersionSchema = z.object({
  changeNote: z.string().trim().max(500).optional(),
  concurrencyVersion: z.number().int().min(0),
});

export const compareVersionsSchema = z.object({
  versionA: z.coerce.number().int().min(1),
  versionB: z.coerce.number().int().min(1),
});

export const previewModeSchema = z.enum(["faculty", "candidate"]);

export const paperVersionParamSchema = z.object({
  paperId: z.string().uuid("paperId must be a valid UUID"),
  versionNumber: z.coerce.number().int().min(1),
});

export type SaveVersionInput = z.infer<typeof saveVersionSchema>;
export type CompareVersionsQuery = z.infer<typeof compareVersionsSchema>;
export type PreviewMode = z.infer<typeof previewModeSchema>;

// ---------------------------------------------------------------------------
// Step 10 — Independent Approval & PDF Generation Schemas
// ---------------------------------------------------------------------------

export const reviewDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "CHANGES_REQUESTED"]),
  comments: z.string().trim().max(2000).optional(),
});

export const listSubmissionsQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "CHANGES_REQUESTED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const submissionParamSchema = z.object({
  submissionId: z.string().uuid("submissionId must be a valid UUID"),
});

export const generatePdfSchema = z.object({
  forceRegenerate: z.boolean().optional(),
});

export type ReviewDecisionInput = z.infer<typeof reviewDecisionSchema>;
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
export type GeneratePdfInput = z.infer<typeof generatePdfSchema>;


