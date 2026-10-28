/**
 * Question generation service — Step 7.
 *
 * Orchestrates:
 *  1. Creating a QuestionGenerationJob row (PENDING → RUNNING).
 *  2. Calling the Python AI service for question generation.
 *  3. Persisting returned candidates as GeneratedQuestion rows.
 *  4. Updating the job status to COMPLETED or FAILED.
 *  5. Faculty review: APPROVED / EDITED candidates are promoted into the
 *     question bank as real Question + QuestionRevision rows.
 *
 * Architecture invariants:
 *  - Node.js is the authoritative data store. The AI service has no DB access.
 *  - AI results are stored verbatim as candidates; never auto-promoted.
 *  - Rejection is permanent; the GeneratedQuestion row is kept for audit.
 */

import { db } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { aiClient, AIClientError } from "./aiClient.js";
import { getSubject } from "./subjectService.js";
import { retrieveRelevantChunks, buildRagContext } from "./ragService.js";
import type {
  CreateGenerationJobInput,
  ListGenerationJobsQuery,
  ReviewGeneratedQuestionInput,
} from "../schemas/academic.js";
import type { PaginatedResult } from "./subjectService.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerationJobSummary {
  id: string;
  institutionId: string;
  subjectId: string;
  topicId: string | null;
  requestedBy: string | null;
  questionType: string;
  difficulty: string | null;
  count: number;
  language: string;
  contextHint: string | null;
  sourceDocumentIds?: string[];
  groundingMode?: string | null;
  status: string;
  errorMessage: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  durationMs: number | null;
  createdAt: Date;
  updatedAt: Date;
  subject: { id: string; name: string; code: string };
  topic: { id: string; name: string; code: string | null } | null;
  _count: { generatedQuestions: number };
}

export interface GeneratedQuestionSummary {
  id: string;
  jobId: string;
  questionText: string;
  questionType: string;
  suggestedAnswer: string | null;
  explanation: string | null;
  difficulty: string | null;
  bloomsLevel: string | null;
  subjectTags: string[];
  sourceChunkIds: string[];
  metadata: unknown;
  status: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  promotedQuestionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// List jobs
// ---------------------------------------------------------------------------

export async function listGenerationJobs(
  institutionId: string,
  query: ListGenerationJobsQuery,
): Promise<PaginatedResult<GenerationJobSummary>> {
  const { subjectId, status, page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(subjectId ? { subjectId } : {}),
    ...(status ? { status: status as "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" } : {}),
  };

  const [total, jobs] = await db.$transaction([
    db.questionGenerationJob.count({ where }),
    db.questionGenerationJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        subject: { select: { id: true, name: true, code: true } },
        _count: { select: { generatedQuestions: true } },
      },
    }),
  ]);

  // Resolve topic names manually (Prisma doesn't support optional relation select with nullable FK easily)
  const topicIds = jobs
    .map((j) => j.topicId)
    .filter((id): id is string => id !== null);

  const topics =
    topicIds.length > 0
      ? await db.topic.findMany({
          where: { id: { in: topicIds } },
          select: { id: true, name: true, code: true },
        })
      : [];

  const topicMap = new Map(topics.map((t) => [t.id, t]));

  return {
    data: jobs.map((j) => ({
      ...j,
      difficulty: j.difficulty ?? null,
      topic: j.topicId ? (topicMap.get(j.topicId) ?? null) : null,
    })) as GenerationJobSummary[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// ---------------------------------------------------------------------------
// Get single job
// ---------------------------------------------------------------------------

export async function getGenerationJob(
  institutionId: string,
  jobId: string,
): Promise<GenerationJobSummary> {
  const job = await db.questionGenerationJob.findFirst({
    where: { id: jobId, institutionId },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      _count: { select: { generatedQuestions: true } },
    },
  });

  if (!job) {
    throw AppError.notFound("Generation job not found");
  }

  let topic: { id: string; name: string; code: string | null } | null = null;
  if (job.topicId) {
    topic = await db.topic.findUnique({
      where: { id: job.topicId },
      select: { id: true, name: true, code: true },
    });
  }

  return { ...job, difficulty: job.difficulty ?? null, topic } as GenerationJobSummary;
}

// ---------------------------------------------------------------------------
// List generated questions for a job
// ---------------------------------------------------------------------------

export async function listGeneratedQuestions(
  institutionId: string,
  jobId: string,
): Promise<GeneratedQuestionSummary[]> {
  // Verify the job belongs to this institution
  const job = await db.questionGenerationJob.findFirst({
    where: { id: jobId, institutionId },
    select: { id: true },
  });
  if (!job) {
    throw AppError.notFound("Generation job not found");
  }

  const questions = await db.generatedQuestion.findMany({
    where: { jobId },
    orderBy: { createdAt: "asc" },
  });

  return questions.map((q) => ({
    ...q,
    difficulty: q.difficulty ?? null,
  })) as GeneratedQuestionSummary[];
}

// ---------------------------------------------------------------------------
// Create + run a generation job
// ---------------------------------------------------------------------------

export async function createAndRunGenerationJob(
  institutionId: string,
  input: CreateGenerationJobInput,
  requestId?: string,
  userId?: string,
): Promise<GenerationJobSummary> {
  // 1. Validate subject
  const subject = await getSubject(institutionId, input.subjectId);

  // 2. Validate optional topic
  let topicName: string | undefined;
  if (input.topicId) {
    const topic = await db.topic.findFirst({
      where: { id: input.topicId, institutionId, subjectId: input.subjectId },
      select: { id: true, name: true },
    });
    if (!topic) {
      throw AppError.badRequest("topicId does not belong to this subject or institution");
    }
    topicName = topic.name;
  }

  // 2b. If useRag is requested, perform RAG retrieval
  let ragContext: ReturnType<typeof buildRagContext> | null = null;
  if (input.useRag) {
    const ragQuery = [subject.name, topicName, input.contextHint].filter(Boolean).join(" ");
    const retrievedChunks = await retrieveRelevantChunks(institutionId, ragQuery, {
      subjectId: input.subjectId,
      sourceDocumentIds: input.sourceDocumentIds,
      topK: 5,
    });
    if (retrievedChunks.length > 0) {
      ragContext = buildRagContext(retrievedChunks);
    }
  }

  const groundingMode = ragContext && ragContext.sources.length > 0 ? "document" : "general";
  const sourceChunkIds = ragContext ? ragContext.sources.map((s) => s.chunkId) : [];
  const sourceMetadata = ragContext
    ? {
        sources: ragContext.sources,
        groundingMode: "document",
      }
    : null;

  // 3. Create the job row in PENDING state
  const job = await db.questionGenerationJob.create({
    data: {
      institutionId,
      subjectId: input.subjectId,
      topicId: input.topicId ?? null,
      requestedBy: userId ?? null,
      questionType: input.questionType as "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "LONG_ANSWER" | "NUMERICAL",
      difficulty: (input.difficulty as "EASY" | "MEDIUM" | "HARD") ?? null,
      count: input.count,
      language: input.language,
      contextHint: input.contextHint ?? null,
      sourceDocumentIds: input.sourceDocumentIds ?? [],
      groundingMode,
      status: "PENDING",
      updatedAt: new Date(),
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      _count: { select: { generatedQuestions: true } },
    },
  });

  // 4. Transition to RUNNING
  await db.questionGenerationJob.update({
    where: { id: job.id },
    data: { status: "RUNNING", updatedAt: new Date() },
  });

  // 5. Call AI service
  let aiResponse;
  try {
    aiResponse = await aiClient.generateQuestions(
      {
        subjectName: subject.name,
        subjectCode: subject.code,
        topicName,
        questionType: input.questionType,
        difficulty: input.difficulty,
        count: input.count,
        language: input.language,
        contextHint: input.contextHint,
        groundingMode,
        sourceExcerpts: ragContext ? ragContext.excerpts : undefined,
        sourceContext: ragContext ? ragContext.context : undefined,
      },
      { requestId },
    );
  } catch (err) {
    // 5a. Mark job FAILED
    const errorMessage =
      err instanceof AIClientError ? err.message : "AI service call failed";
    await db.questionGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage,
        updatedAt: new Date(),
      },
    });
    // Preserve normalized upstream/timeout HTTP status (e.g. 504 on timeout, 429 on rate limit, 502 on invalid output, 503 on unavailable)
    const rawStatus =
      err instanceof AIClientError
        ? (err.statusCode ?? (err as { status?: number }).status)
        : undefined;
    const httpStatus =
      typeof rawStatus === "number" && rawStatus >= 400 && rawStatus < 600
        ? rawStatus
        : 503;
    throw new AppError(
      err instanceof AIClientError ? err.message : "AI service unavailable",
      httpStatus,
    );
  }

  // 6. Validate complete batch before persisting (never accept partial or malformed question batches)
  const generated = aiResponse?.result?.questions;
  const isCompleteValidBatch =
    Array.isArray(generated) &&
    generated.length === input.count &&
    generated.every(
      (q) =>
        q !== null &&
        typeof q === "object" &&
        typeof q.questionText === "string" &&
        q.questionText.trim().length >= 5,
    );

  if (!isCompleteValidBatch) {
    const batchErrorMessage =
      "AI service returned an incomplete or malformed question batch";
    await db.questionGenerationJob.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        errorMessage: batchErrorMessage,
        updatedAt: new Date(),
      },
    });
    throw new AppError(batchErrorMessage, 502);
  }

  // 7. Persist generated question candidates
  if (generated.length > 0) {
    await db.generatedQuestion.createMany({
      data: generated.map((q) => ({
        jobId: job.id,
        questionText: q.questionText,
        questionType: input.questionType as "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "LONG_ANSWER" | "NUMERICAL",
        suggestedAnswer: q.suggestedAnswer ?? null,
        explanation: q.explanation ?? null,
        difficulty: (q.difficulty as "EASY" | "MEDIUM" | "HARD") ?? null,
        bloomsLevel: q.bloomsLevel ?? null,
        subjectTags: q.subjectTags ?? [],
        sourceChunkIds,
        metadata: sourceMetadata ?? undefined,
        status: "PENDING",
        updatedAt: new Date(),
      })),
    });
  }

  // 8. Mark job COMPLETED
  const updatedJob = await db.questionGenerationJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      aiProvider: aiResponse.provider.name,
      aiModel: aiResponse.provider.model,
      durationMs: aiResponse.durationMs,
      updatedAt: new Date(),
    },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      _count: { select: { generatedQuestions: true } },
    },
  });

  let topic: { id: string; name: string; code: string | null } | null = null;
  if (updatedJob.topicId) {
    topic = await db.topic.findUnique({
      where: { id: updatedJob.topicId },
      select: { id: true, name: true, code: true },
    });
  }

  return { ...updatedJob, difficulty: updatedJob.difficulty ?? null, topic } as GenerationJobSummary;
}

// ---------------------------------------------------------------------------
// Review a generated question (faculty action)
// ---------------------------------------------------------------------------

export async function reviewGeneratedQuestion(
  institutionId: string,
  jobId: string,
  generatedQuestionId: string,
  input: ReviewGeneratedQuestionInput,
  userId?: string,
): Promise<GeneratedQuestionSummary & { promotedQuestion?: { id: string } }> {
  // 1. Verify the job belongs to this institution
  const job = await db.questionGenerationJob.findFirst({
    where: { id: jobId, institutionId },
    select: { id: true, subjectId: true, topicId: true, questionType: true },
  });
  if (!job) {
    throw AppError.notFound("Generation job not found");
  }

  // 2. Load the generated question
  const genQ = await db.generatedQuestion.findFirst({
    where: { id: generatedQuestionId, jobId },
  });
  if (!genQ) {
    throw AppError.notFound("Generated question not found");
  }

  // 3. Prevent re-review
  if (genQ.status !== "PENDING") {
    throw AppError.conflict(
      `Generated question has already been reviewed (status: ${genQ.status})`,
    );
  }

  const now = new Date();

  // 4a. REJECTED — just mark the row
  if (input.reviewAction === "REJECTED") {
    const updated = await db.generatedQuestion.update({
      where: { id: generatedQuestionId },
      data: {
        status: "REJECTED",
        reviewedAt: now,
        reviewedBy: userId ?? null,
        reviewNotes: input.reviewNotes ?? null,
        updatedAt: now,
      },
    });
    return { ...updated, difficulty: updated.difficulty ?? null } as GeneratedQuestionSummary;
  }

  // 4b. APPROVED / EDITED — promote to the question bank
  const subjectId = input.subjectId ?? job.subjectId;
  if (input.subjectId && input.subjectId !== job.subjectId) {
    await getSubject(institutionId, input.subjectId);
  }
  const marks = input.marks!; // validated by schema
  const questionText =
    input.reviewAction === "EDITED" && input.editedQuestionText
      ? input.editedQuestionText
      : genQ.questionText;

  // Validate topic IDs belong to the subject
  const topicIds = input.topicIds ?? [];
  if (topicIds.length > 0) {
    const found = await db.topic.findMany({
      where: { id: { in: topicIds }, institutionId, subjectId },
      select: { id: true },
    });
    if (found.length !== topicIds.length) {
      throw AppError.badRequest("One or more topicIds do not belong to this subject");
    }
  }

  // Promote atomically
  let promotedQuestionId: string;
  await db.$transaction(async (tx) => {
    // Create Question + initial revision
    const newQuestion = await tx.question.create({
      data: {
        institutionId,
        subjectId,
        lifecycle: "DRAFT",
        currentRevisionNumber: 1,
        updatedAt: now,
      },
    });

    const revision = await tx.questionRevision.create({
      data: {
        questionId: newQuestion.id,
        revisionNumber: 1,
        questionText,
        questionType: genQ.questionType as "MULTIPLE_CHOICE" | "SHORT_ANSWER" | "LONG_ANSWER" | "NUMERICAL",
        marks: marks.toString(),
        language: "en",
        difficulty: (genQ.difficulty as "EASY" | "MEDIUM" | "HARD") ?? null,
        explanation: genQ.explanation ?? null,
        authorId: userId ?? null,
      },
    });

    // Link topics
    if (topicIds.length > 0) {
      await tx.questionTopicMap.createMany({
        data: topicIds.map((topicId) => ({
          revisionId: revision.id,
          topicId,
        })),
      });
    }

    // Mark generated question as APPROVED / EDITED
    await tx.generatedQuestion.update({
      where: { id: generatedQuestionId },
      data: {
        status: input.reviewAction === "EDITED" ? "EDITED" : "APPROVED",
        reviewedAt: now,
        reviewedBy: userId ?? null,
        reviewNotes: input.reviewNotes ?? null,
        promotedQuestionId: newQuestion.id,
        updatedAt: now,
      },
    });

    promotedQuestionId = newQuestion.id;
  });

  const updated = await db.generatedQuestion.findUniqueOrThrow({
    where: { id: generatedQuestionId },
  });

  return {
    ...updated,
    difficulty: updated.difficulty ?? null,
    promotedQuestion: { id: promotedQuestionId! },
  } as GeneratedQuestionSummary & { promotedQuestion?: { id: string } };
}
