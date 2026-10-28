/**
 * Shared Zod schemas for academic-data and question-bank validation.
 * All route handlers import from here — no ad-hoc validation in handlers.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants and enumerations
// ---------------------------------------------------------------------------

export const QUESTION_TYPES = ["MULTIPLE_CHOICE", "SHORT_ANSWER", "LONG_ANSWER", "NUMERICAL"] as const;
export const DIFFICULTY_LEVELS = ["EASY", "MEDIUM", "HARD"] as const;
export const QUESTION_LIFECYCLES = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export const SUBJECT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export const TOPIC_STATUSES = ["ACTIVE", "ARCHIVED"] as const;

// Maximum marks per question; configurable in future.
const MAX_MARKS = 999.99;
const MIN_MARKS = 0.5;

// ---------------------------------------------------------------------------
// Route parameter schemas
// ---------------------------------------------------------------------------

export const subjectParamSchema = z.object({
  subjectId: z.string().uuid("subjectId must be a valid UUID"),
});

export const topicParamSchema = z.object({
  subjectId: z.string().uuid("subjectId must be a valid UUID"),
  topicId: z.string().uuid("topicId must be a valid UUID"),
});

export const questionParamSchema = z.object({
  questionId: z.string().uuid("questionId must be a valid UUID"),
});

export const revisionParamSchema = z.object({
  questionId: z.string().uuid("questionId must be a valid UUID"),
  revisionId: z.string().uuid("revisionId must be a valid UUID"),
});

// ---------------------------------------------------------------------------
// Subject schemas
// ---------------------------------------------------------------------------

const subjectNameSchema = z
  .string()
  .trim()
  .min(1, "name is required")
  .max(200, "name must be at most 200 characters");

const subjectCodeSchema = z
  .string()
  .trim()
  .min(1, "code is required")
  .max(20, "code must be at most 20 characters")
  .regex(/^[A-Za-z0-9_\-]+$/, "code may only contain letters, digits, hyphens, and underscores");

export const createSubjectSchema = z.object({
  name: subjectNameSchema,
  code: subjectCodeSchema,
  description: z.string().trim().max(1000).optional(),
});

export const updateSubjectSchema = z
  .object({
    name: subjectNameSchema.optional(),
    description: z.string().trim().max(1000).optional().nullable(),
    status: z.enum(SUBJECT_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided for update",
  });

export const listSubjectsQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(SUBJECT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Topic schemas
// ---------------------------------------------------------------------------

export const createTopicSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(300),
  code: z.string().trim().max(20).optional(),
  description: z.string().trim().max(1000).optional(),
  sequenceOrder: z.number().int().min(0).default(0),
});

export const updateTopicSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    code: z.string().trim().max(20).optional().nullable(),
    description: z.string().trim().max(1000).optional().nullable(),
    sequenceOrder: z.number().int().min(0).optional(),
    status: z.enum(TOPIC_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided for update",
  });

// ---------------------------------------------------------------------------
// Question schemas
// ---------------------------------------------------------------------------

const marksSchema = z
  .number()
  .positive("marks must be positive")
  .max(MAX_MARKS, `marks must not exceed ${MAX_MARKS}`)
  .min(MIN_MARKS, `marks must be at least ${MIN_MARKS}`)
  // Round to 2 decimal places to avoid floating-point drift.
  .transform((v) => Math.round(v * 100) / 100);

export const createQuestionSchema = z.object({
  subjectId: z.string().uuid("subjectId must be a valid UUID"),
  questionText: z.string().trim().min(1, "questionText is required").max(10000),
  questionType: z.enum(QUESTION_TYPES),
  marks: marksSchema,
  language: z.string().trim().regex(/^[a-z]{2,3}(-[A-Z]{2,4})?$/, "language must be a BCP-47 tag").default("en"),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional(),
  explanation: z.string().trim().max(5000).optional(),
  topicIds: z.array(z.string().uuid()).max(10, "at most 10 topics per question").default([]),
  lifecycle: z.enum(QUESTION_LIFECYCLES).default("DRAFT"),
});

export const updateQuestionSchema = z.object({
  // All fields are required because a full new revision is always created.
  questionText: z.string().trim().min(1, "questionText is required").max(10000),
  questionType: z.enum(QUESTION_TYPES),
  marks: marksSchema,
  language: z.string().trim().regex(/^[a-z]{2,3}(-[A-Z]{2,4})?$/),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional().nullable(),
  explanation: z.string().trim().max(5000).optional().nullable(),
  topicIds: z.array(z.string().uuid()).max(10).default([]),
  lifecycle: z.enum(QUESTION_LIFECYCLES).optional(),
  // Optimistic-concurrency token — must equal current currentRevisionNumber.
  expectedRevisionNumber: z.number().int().min(0),
});

export const listQuestionsQuerySchema = z.object({
  search: z.string().trim().max(500).optional(),
  subjectId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  questionType: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional(),
  language: z.string().trim().max(10).optional(),
  lifecycle: z.enum(QUESTION_LIFECYCLES).optional(),
  marksMin: z.coerce.number().min(0).optional(),
  marksMax: z.coerce.number().max(MAX_MARKS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Types inferred from schemas
// ---------------------------------------------------------------------------

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
export type ListSubjectsQuery = z.infer<typeof listSubjectsQuerySchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type ListQuestionsQuery = z.infer<typeof listQuestionsQuerySchema>;

// ---------------------------------------------------------------------------
// Step 6 — Question Analysis schemas
// ---------------------------------------------------------------------------

export const BLOOMS_LEVELS = [
  "REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE", "UNDETERMINED",
] as const;

export const AI_DIFFICULTY_SUGGESTIONS = ["EASY", "MEDIUM", "HARD", "UNDETERMINED"] as const;

export const AI_ANALYSIS_REVIEW_STATUSES = [
  "PENDING", "ACCEPTED", "OVERRIDDEN", "DISMISSED",
] as const;

/** Route param for analysis endpoints: /questions/:questionId/analyses/:analysisId */
export const analysisRouteParamSchema = z.object({
  questionId: z.string().uuid("questionId must be a valid UUID"),
  analysisId: z.string().uuid("analysisId must be a valid UUID"),
});

/** Body: POST /questions/:questionId/analyses — trigger AI analysis for a revision. */
export const triggerAnalysisSchema = z.object({
  revisionId: z.string().uuid("revisionId must be a valid UUID"),
  // When true, skips the duplicate-detection step (faster for bulk operations).
  skipDuplicateDetection: z.boolean().default(false),
});

/** Body: PATCH /questions/:questionId/analyses/:analysisId/review — faculty review. */
export const reviewAnalysisSchema = z
  .object({
    reviewAction: z.enum(["ACCEPTED", "OVERRIDDEN", "DISMISSED"]),
    // Required only when reviewAction = OVERRIDDEN
    facultyBloomsLevel: z.enum(BLOOMS_LEVELS).optional(),
    facultyDifficulty: z.enum(DIFFICULTY_LEVELS).optional(),
    facultyNotes: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.reviewAction === "OVERRIDDEN" && !v.facultyBloomsLevel && !v.facultyDifficulty) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "At least one of facultyBloomsLevel or facultyDifficulty is required when reviewAction is OVERRIDDEN",
        path: ["facultyBloomsLevel"],
      });
    }
  });

export type TriggerAnalysisInput = z.infer<typeof triggerAnalysisSchema>;
export type ReviewAnalysisInput = z.infer<typeof reviewAnalysisSchema>;

// ---------------------------------------------------------------------------
// Step 7 — Question Generation schemas
// ---------------------------------------------------------------------------

export const GENERATION_JOB_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;
export const GENERATED_QUESTION_STATUSES = ["PENDING", "APPROVED", "REJECTED", "EDITED"] as const;

/** Maximum questions that can be requested in a single generation job. */
const MAX_GENERATION_COUNT = 20;

/** Body: POST /generation-jobs — create a new AI question generation job. */
export const createGenerationJobSchema = z.object({
  subjectId: z.string().uuid("subjectId must be a valid UUID"),
  topicId: z.string().uuid("topicId must be a valid UUID").optional(),
  questionType: z.enum(QUESTION_TYPES),
  difficulty: z.enum(DIFFICULTY_LEVELS).optional(),
  count: z
    .number()
    .int()
    .min(1, "count must be at least 1")
    .max(MAX_GENERATION_COUNT, `count must not exceed ${MAX_GENERATION_COUNT}`),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(-[A-Z]{2,4})?$/, "language must be a BCP-47 tag")
    .default("en"),
  contextHint: z
    .string()
    .trim()
    .max(500, "contextHint must be at most 500 characters")
    .optional(),
  useRag: z.boolean().optional().default(false),
  sourceDocumentIds: z.array(z.string().uuid()).optional(),
});

/** Query: GET /generation-jobs */
export const listGenerationJobsQuerySchema = z.object({
  subjectId: z.string().uuid().optional(),
  status: z.enum(GENERATION_JOB_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Route param for generation job endpoints. */
export const generationJobParamSchema = z.object({
  jobId: z.string().uuid("jobId must be a valid UUID"),
});

/** Route param for generated question endpoints. */
export const generatedQuestionParamSchema = z.object({
  jobId: z.string().uuid("jobId must be a valid UUID"),
  questionId: z.string().uuid("questionId must be a valid UUID"),
});

/**
 * Body: PATCH /generation-jobs/:jobId/questions/:questionId/review
 *
 * Faculty review action:
 *  - APPROVED: question is added to the bank as-is.
 *  - EDITED: faculty provides edited text; that version is added to the bank.
 *  - REJECTED: question is not added; retained for audit only.
 */
export const reviewGeneratedQuestionSchema = z
  .object({
    reviewAction: z.enum(["APPROVED", "EDITED", "REJECTED"]),
    // Required when reviewAction = APPROVED or EDITED:
    subjectId: z.string().uuid().optional(),
    topicIds: z.array(z.string().uuid()).max(10).default([]),
    marks: z
      .number()
      .positive()
      .max(999.99)
      .min(0.5)
      .transform((v) => Math.round(v * 100) / 100)
      .optional(),
    // Required when reviewAction = EDITED: overrides AI question text
    editedQuestionText: z.string().trim().min(1).max(10000).optional(),
    // Optional faculty notes
    reviewNotes: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.reviewAction === "APPROVED" || v.reviewAction === "EDITED") {
      if (!v.subjectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "subjectId is required when approving or editing a generated question",
          path: ["subjectId"],
        });
      }
      if (v.marks === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "marks is required when approving or editing a generated question",
          path: ["marks"],
        });
      }
    }
    if (v.reviewAction === "EDITED" && !v.editedQuestionText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "editedQuestionText is required when reviewAction is EDITED",
        path: ["editedQuestionText"],
      });
    }
  });

export type CreateGenerationJobInput = z.infer<typeof createGenerationJobSchema>;
export type ListGenerationJobsQuery = z.infer<typeof listGenerationJobsQuerySchema>;
export type ReviewGeneratedQuestionInput = z.infer<typeof reviewGeneratedQuestionSchema>;

