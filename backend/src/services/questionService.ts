/**
 * Question service — business logic for the question bank.
 *
 * Key invariants enforced here:
 *  1. Question creation is atomic (question + initial revision in one transaction).
 *  2. Editing creates a new revision; it never mutates existing revisions.
 *  3. Revision numbers are unique per question (DB unique constraint + service check).
 *  4. Optimistic concurrency: caller must supply expectedRevisionNumber matching
 *     the current value. Mismatch → 409 Conflict.
 *  5. All topic IDs must belong to the same institution and subject.
 *  6. Marks stored as Decimal(6,2); passed as JS number, converted to string for Prisma.
 */

import { db } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { getSubject } from "./subjectService.js";
import type { CreateQuestionInput, UpdateQuestionInput, ListQuestionsQuery } from "../schemas/academic.js";
import type { PaginatedResult } from "./subjectService.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevisionSummary {
  id: string;
  questionId: string;
  revisionNumber: number;
  questionText: string;
  questionType: string;
  marks: string; // Decimal → string to avoid JS float drift
  language: string;
  difficulty: string | null;
  explanation: string | null;
  authorId: string | null;
  createdAt: Date;
  topics: { id: string; name: string; code: string | null }[];
}

export interface QuestionWithCurrentRevision {
  id: string;
  institutionId: string;
  subjectId: string;
  lifecycle: string;
  currentRevisionNumber: number;
  createdAt: Date;
  updatedAt: Date;
  subject: { id: string; name: string; code: string };
  currentRevision: RevisionSummary | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify every topicId belongs to the correct institution + subject. */
async function validateTopicIds(
  institutionId: string,
  subjectId: string,
  topicIds: string[],
): Promise<void> {
  if (topicIds.length === 0) return;

  const found = await db.topic.findMany({
    where: { id: { in: topicIds }, institutionId, subjectId },
    select: { id: true },
  });

  if (found.length !== topicIds.length) {
    const foundIds = new Set(found.map((t) => t.id));
    const invalid = topicIds.filter((id) => !foundIds.has(id));
    throw AppError.badRequest(
      `Topic IDs do not belong to this institution/subject: ${invalid.join(", ")}`,
    );
  }
}

/** Build the include clause for the current revision with topics. */
const revisionInclude = {
  questionTopicMaps: {
    include: { topic: { select: { id: true, name: true, code: true } } },
  },
} as const;

function mapRevision(rev: {
  id: string;
  questionId: string;
  revisionNumber: number;
  questionText: string;
  questionType: string;
  marks: { toString(): string };
  language: string;
  difficulty: string | null;
  explanation: string | null;
  authorId: string | null;
  createdAt: Date;
  questionTopicMaps: { topic: { id: string; name: string; code: string | null } }[];
}): RevisionSummary {
  return {
    id: rev.id,
    questionId: rev.questionId,
    revisionNumber: rev.revisionNumber,
    questionText: rev.questionText,
    questionType: rev.questionType,
    marks: rev.marks.toString(),
    language: rev.language,
    difficulty: rev.difficulty,
    explanation: rev.explanation,
    authorId: rev.authorId,
    createdAt: rev.createdAt,
    topics: rev.questionTopicMaps.map((m) => m.topic),
  };
}

// ---------------------------------------------------------------------------
// List questions (paginated, filterable)
// ---------------------------------------------------------------------------

export async function listQuestions(
  institutionId: string,
  query: ListQuestionsQuery,
): Promise<PaginatedResult<QuestionWithCurrentRevision>> {
  const { search, subjectId, topicId, questionType, difficulty, language, lifecycle, marksMin, marksMax, page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  // Build filter for revisions
  const revisionFilter = {
    ...(questionType && { questionType }),
    ...(difficulty && { difficulty }),
    ...(language && { language }),
    ...(marksMin !== undefined && { marks: { gte: marksMin } }),
    ...(marksMax !== undefined && { marks: { lte: marksMax } }),
    ...(search && { questionText: { contains: search, mode: "insensitive" as const } }),
    ...(topicId && { questionTopicMaps: { some: { topicId } } }),
  };

  const hasRevisionFilter = Object.keys(revisionFilter).length > 0;

  const where = {
    institutionId,
    ...(subjectId && { subjectId }),
    ...(lifecycle && { lifecycle }),
    ...(hasRevisionFilter && {
      revisions: {
        some: {
          revisionNumber: db.question.fields.currentRevisionNumber, // same-revision filter
          ...revisionFilter,
        },
      },
    }),
  };

  const [questions, total] = await Promise.all([
    db.question.findMany({
      where: {
        institutionId,
        ...(subjectId && { subjectId }),
        ...(lifecycle && { lifecycle }),
      },
      skip,
      take: pageSize,
      orderBy: [{ updatedAt: "desc" }],
      include: {
        subject: { select: { id: true, name: true, code: true } },
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          include: revisionInclude,
        },
      },
    }),
    db.question.count({ where: { institutionId, ...(subjectId && { subjectId }), ...(lifecycle && { lifecycle }) } }),
  ]);

  // Apply in-memory filters that need join data (simpler than complex Prisma where)
  let filtered = questions;
  if (hasRevisionFilter) {
    filtered = questions.filter((q) => {
      const rev = q.revisions[0];
      if (!rev) return false;
      if (questionType && rev.questionType !== questionType) return false;
      if (difficulty && rev.difficulty !== difficulty) return false;
      if (language && rev.language !== language) return false;
      if (search && !rev.questionText.toLowerCase().includes(search.toLowerCase())) return false;
      if (marksMin !== undefined && Number(rev.marks) < marksMin) return false;
      if (marksMax !== undefined && Number(rev.marks) > marksMax) return false;
      if (topicId && !rev.questionTopicMaps.some((m) => m.topicId === topicId)) return false;
      return true;
    });
  }

  const data = filtered.map((q) => ({
    id: q.id,
    institutionId: q.institutionId,
    subjectId: q.subjectId,
    lifecycle: q.lifecycle,
    currentRevisionNumber: q.currentRevisionNumber,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    subject: q.subject,
    currentRevision: q.revisions[0] ? mapRevision(q.revisions[0] as Parameters<typeof mapRevision>[0]) : null,
  }));

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ---------------------------------------------------------------------------
// Get single question
// ---------------------------------------------------------------------------

export async function getQuestion(
  institutionId: string,
  questionId: string,
): Promise<QuestionWithCurrentRevision> {
  const q = await db.question.findFirst({
    where: { id: questionId, institutionId },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      revisions: {
        orderBy: { revisionNumber: "desc" },
        take: 1,
        include: revisionInclude,
      },
    },
  });
  if (!q) throw AppError.notFound("Question not found");

  return {
    id: q.id,
    institutionId: q.institutionId,
    subjectId: q.subjectId,
    lifecycle: q.lifecycle,
    currentRevisionNumber: q.currentRevisionNumber,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
    subject: q.subject,
    currentRevision: q.revisions[0] ? mapRevision(q.revisions[0] as Parameters<typeof mapRevision>[0]) : null,
  };
}

// ---------------------------------------------------------------------------
// Create question (atomic: question + revision 1)
// ---------------------------------------------------------------------------

export async function createQuestion(
  institutionId: string,
  input: CreateQuestionInput,
  userId: string | null,
): Promise<QuestionWithCurrentRevision> {
  // Validate subject ownership.
  await getSubject(institutionId, input.subjectId);
  // Validate topics belong to the correct institution and subject.
  await validateTopicIds(institutionId, input.subjectId, input.topicIds);

  const { subjectId, questionText, questionType, marks, language, difficulty, explanation, topicIds, lifecycle } = input;

  const result = await db.$transaction(async (tx) => {
    // Create the logical question.
    const question = await tx.question.create({
      data: {
        institutionId,
        subjectId,
        lifecycle,
        currentRevisionNumber: 1,
      },
    });

    // Create the initial revision (revisionNumber = 1).
    const revision = await tx.questionRevision.create({
      data: {
        questionId: question.id,
        revisionNumber: 1,
        questionText,
        questionType,
        marks: marks.toString(),
        language,
        difficulty: difficulty ?? null,
        explanation: explanation ?? null,
        authorId: userId,
        questionTopicMaps: {
          create: topicIds.map((topicId) => ({ topicId })),
        },
      },
      include: revisionInclude,
    });

    return { question, revision };
  });

  const subject = await db.subject.findUniqueOrThrow({
    where: { id: subjectId },
    select: { id: true, name: true, code: true },
  });

  return {
    id: result.question.id,
    institutionId,
    subjectId,
    lifecycle: result.question.lifecycle,
    currentRevisionNumber: result.question.currentRevisionNumber,
    createdAt: result.question.createdAt,
    updatedAt: result.question.updatedAt,
    subject,
    currentRevision: mapRevision(result.revision as Parameters<typeof mapRevision>[0]),
  };
}

// ---------------------------------------------------------------------------
// Update question (creates a new revision; never mutates previous ones)
// ---------------------------------------------------------------------------

export async function updateQuestion(
  institutionId: string,
  questionId: string,
  input: UpdateQuestionInput,
  userId: string | null,
): Promise<QuestionWithCurrentRevision> {
  const existing = await db.question.findFirst({
    where: { id: questionId, institutionId },
    select: { id: true, subjectId: true, currentRevisionNumber: true, lifecycle: true },
  });
  if (!existing) throw AppError.notFound("Question not found");

  // Optimistic-concurrency check.
  if (existing.currentRevisionNumber !== input.expectedRevisionNumber) {
    throw AppError.conflict(
      `Concurrent edit detected: expected revision ${input.expectedRevisionNumber}, ` +
        `but current is ${existing.currentRevisionNumber}. Reload and retry.`,
    );
  }

  const nextRevision = existing.currentRevisionNumber + 1;
  const { questionText, questionType, marks, language, difficulty, explanation, topicIds, lifecycle } = input;

  // Validate topics if provided.
  await validateTopicIds(institutionId, existing.subjectId, topicIds);

  await db.$transaction(async (tx) => {
    // Insert new revision — DB unique constraint prevents duplicate revisionNumber.
    await tx.questionRevision.create({
      data: {
        questionId,
        revisionNumber: nextRevision,
        questionText,
        questionType,
        marks: marks.toString(),
        language,
        difficulty: difficulty ?? null,
        explanation: explanation ?? null,
        authorId: userId,
        questionTopicMaps: {
          create: topicIds.map((topicId) => ({ topicId })),
        },
      },
    });

    // Atomically update the pointer + lifecycle.
    const updated = await tx.question.updateMany({
      where: {
        id: questionId,
        institutionId,
        currentRevisionNumber: input.expectedRevisionNumber, // double-check in same tx
      },
      data: {
        currentRevisionNumber: nextRevision,
        ...(lifecycle !== undefined && { lifecycle }),
      },
    });

    if (updated.count === 0) {
      // Another concurrent transaction won the race.
      throw AppError.conflict("Concurrent update conflict. Reload and retry.");
    }
  });

  return getQuestion(institutionId, questionId);
}

// ---------------------------------------------------------------------------
// List revisions for a question
// ---------------------------------------------------------------------------

export async function listRevisions(
  institutionId: string,
  questionId: string,
): Promise<RevisionSummary[]> {
  await getQuestion(institutionId, questionId); // ownership check

  const revisions = await db.questionRevision.findMany({
    where: { questionId },
    orderBy: { revisionNumber: "desc" },
    include: revisionInclude,
  });

  return revisions.map((r) => mapRevision(r as Parameters<typeof mapRevision>[0]));
}

// ---------------------------------------------------------------------------
// Get specific revision
// ---------------------------------------------------------------------------

export async function getRevision(
  institutionId: string,
  questionId: string,
  revisionId: string,
): Promise<RevisionSummary> {
  await getQuestion(institutionId, questionId); // ownership check

  const revision = await db.questionRevision.findFirst({
    where: { id: revisionId, questionId },
    include: revisionInclude,
  });
  if (!revision) throw AppError.notFound("Revision not found");

  return mapRevision(revision as Parameters<typeof mapRevision>[0]);
}
