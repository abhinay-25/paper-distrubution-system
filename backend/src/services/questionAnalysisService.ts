/**
 * Question Analysis Service — Step 6: Question Intelligence
 *
 * Orchestrates AI-powered question analysis:
 * 1. Fetches the question revision from DB (Node.js is the authoritative data store).
 * 2. Gathers existing bank questions as duplicate-detection candidates.
 * 3. Calls the Python AI microservice via AIClient.
 * 4. Persists the AI result as a QuestionAnalysis record.
 * 5. Exposes faculty review/override operations.
 *
 * Key invariants:
 * - Faculty-assigned difficulty (QuestionRevision.difficulty) is NEVER modified
 *   automatically. Faculty must explicitly accept or override AI suggestions.
 * - AI results are always stored with reviewStatus = PENDING.
 * - Analysis is associated with the EXACT revision that was analyzed.
 * - The Python service never connects to the database — all data is passed by
 *   the Node.js backend.
 */

import { db } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { aiClient } from "./aiClient.js";
import type { TriggerAnalysisInput, ReviewAnalysisInput } from "../schemas/academic.js";

// Max number of existing questions sent to Python for duplicate detection.
// Keep bounded to avoid large payloads and slow embedding inference.
const MAX_DUPLICATE_CANDIDATES = 200;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicateCandidateSummary {
  candidateId: string;
  similarityScore: number;
  isNearDuplicate: boolean;
  isPotentialDuplicate: boolean;
}

export interface QuestionAnalysisSummary {
  id: string;
  revisionId: string;
  questionId: string;
  // AI Classification
  aiBloomsLevel: string;
  aiBloomsConfidence: number;
  aiSubjectTags: string[];
  aiQuestionTypeHint: string;
  // AI Difficulty
  aiSuggestedDifficulty: string;
  aiDifficultyConfidence: number;
  aiDifficultyRationale: string;
  // Duplicate detection
  hasPotentialDuplicates: boolean;
  hasNearDuplicates: boolean;
  duplicateCandidates: DuplicateCandidateSummary[];
  nearDuplicateThreshold: number;
  potentialDuplicateThreshold: number;
  // Review
  reviewStatus: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  facultyBloomsLevel: string | null;
  facultyDifficulty: string | null;
  facultyNotes: string | null;
  // Provenance
  aiProvider: string;
  aiModel: string;
  durationMs: number;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helper: map Prisma row to summary
// ---------------------------------------------------------------------------

function mapAnalysis(row: {
  id: string;
  revisionId: string;
  revision: { questionId: string };
  aiBloomsLevel: string;
  aiBloomsConfidence: number;
  aiSubjectTags: string[];
  aiQuestionTypeHint: string;
  aiSuggestedDifficulty: string;
  aiDifficultyConfidence: number;
  aiDifficultyRationale: string;
  hasPotentialDuplicates: boolean;
  hasNearDuplicates: boolean;
  duplicateCandidates: unknown;
  nearDuplicateThreshold: number;
  potentialDuplicateThreshold: number;
  reviewStatus: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  facultyBloomsLevel: string | null;
  facultyDifficulty: string | null;
  facultyNotes: string | null;
  aiProvider: string;
  aiModel: string;
  durationMs: number;
  createdAt: Date;
}): QuestionAnalysisSummary {
  return {
    id: row.id,
    revisionId: row.revisionId,
    questionId: row.revision.questionId,
    aiBloomsLevel: row.aiBloomsLevel,
    aiBloomsConfidence: row.aiBloomsConfidence,
    aiSubjectTags: row.aiSubjectTags,
    aiQuestionTypeHint: row.aiQuestionTypeHint,
    aiSuggestedDifficulty: row.aiSuggestedDifficulty,
    aiDifficultyConfidence: row.aiDifficultyConfidence,
    aiDifficultyRationale: row.aiDifficultyRationale,
    hasPotentialDuplicates: row.hasPotentialDuplicates,
    hasNearDuplicates: row.hasNearDuplicates,
    duplicateCandidates: (row.duplicateCandidates as DuplicateCandidateSummary[]) ?? [],
    nearDuplicateThreshold: row.nearDuplicateThreshold,
    potentialDuplicateThreshold: row.potentialDuplicateThreshold,
    reviewStatus: row.reviewStatus,
    reviewedAt: row.reviewedAt,
    reviewedBy: row.reviewedBy,
    facultyBloomsLevel: row.facultyBloomsLevel,
    facultyDifficulty: row.facultyDifficulty,
    facultyNotes: row.facultyNotes,
    aiProvider: row.aiProvider,
    aiModel: row.aiModel,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
  };
}

const analysisInclude = {
  revision: { select: { questionId: true } },
} as const;

// ---------------------------------------------------------------------------
// Trigger analysis
// ---------------------------------------------------------------------------

export async function triggerQuestionAnalysis(
  institutionId: string,
  questionId: string,
  input: TriggerAnalysisInput,
  requestId?: string,
): Promise<QuestionAnalysisSummary> {
  // 1. Verify question belongs to this institution
  const question = await db.question.findFirst({
    where: { id: questionId, institutionId },
    select: { id: true, subjectId: true },
  });
  if (!question) throw AppError.notFound("Question not found");

  // 2. Verify the revision belongs to this question
  const revision = await db.questionRevision.findFirst({
    where: { id: input.revisionId, questionId },
    select: { id: true, questionText: true },
  });
  if (!revision) throw AppError.notFound("Revision not found for this question");

  // 3. Gather duplicate-detection candidates (existing revisions, latest only)
  //    Only sent to Python when duplicate detection is not skipped.
  const candidates: { candidateId: string; text: string }[] = [];

  if (!input.skipDuplicateDetection) {
    // Fetch the latest revision of every OTHER question in the same subject.
    // We limit to MAX_DUPLICATE_CANDIDATES to bound payload size.
    const otherQuestions = await db.question.findMany({
      where: {
        institutionId,
        subjectId: question.subjectId,
        id: { not: questionId },
      },
      select: {
        id: true,
        currentRevisionNumber: true,
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: { id: true, questionText: true },
        },
      },
      take: MAX_DUPLICATE_CANDIDATES,
    });

    for (const q of otherQuestions) {
      const latestRev = q.revisions[0];
      if (latestRev) {
        candidates.push({ candidateId: latestRev.id, text: latestRev.questionText });
      }
    }
  }

  // 4. Call the Python AI microservice
  const aiResponse = await aiClient.analyzeQuestion(
    {
      revisionId: revision.id,
      questionText: revision.questionText,
      candidates,
    },
    { requestId },
  );

  const result = aiResponse.result;
  const classification = result.classification;
  const difficulty = result.difficultyEstimation;
  const duplicates = result.duplicateCandidates ?? [];

  // 5. Persist the AI result
  const stored = await db.questionAnalysis.create({
    data: {
      revisionId: input.revisionId,
      // Classification
      aiBloomsLevel: classification.bloomsLevel.toUpperCase() as never,
      aiBloomsConfidence: classification.bloomsConfidence,
      aiSubjectTags: classification.subjectTags,
      aiQuestionTypeHint: classification.questionTypeHint,
      // Difficulty
      aiSuggestedDifficulty: difficulty.suggestedDifficulty.toUpperCase() as never,
      aiDifficultyConfidence: difficulty.confidence,
      aiDifficultyRationale: difficulty.rationale,
      // Duplicate detection
      hasPotentialDuplicates: duplicates.some((d) => d.isPotentialDuplicate),
      hasNearDuplicates: duplicates.some((d) => d.isNearDuplicate),
      duplicateCandidates: duplicates as never,
      nearDuplicateThreshold: result.nearDuplicateThreshold,
      potentialDuplicateThreshold: result.potentialDuplicateThreshold,
      // Provenance
      aiProvider: aiResponse.provider.name,
      aiModel: aiResponse.provider.model,
      durationMs: aiResponse.durationMs,
      // Review starts as PENDING
      reviewStatus: "PENDING",
    },
    include: analysisInclude,
  });

  return mapAnalysis(stored as Parameters<typeof mapAnalysis>[0]);
}

// ---------------------------------------------------------------------------
// List analyses for a question
// ---------------------------------------------------------------------------

export async function listQuestionAnalyses(
  institutionId: string,
  questionId: string,
): Promise<QuestionAnalysisSummary[]> {
  // Ownership check
  const question = await db.question.findFirst({
    where: { id: questionId, institutionId },
    select: { id: true },
  });
  if (!question) throw AppError.notFound("Question not found");

  const analyses = await db.questionAnalysis.findMany({
    where: { revision: { questionId } },
    orderBy: { createdAt: "desc" },
    include: analysisInclude,
  });

  return analyses.map((a) => mapAnalysis(a as Parameters<typeof mapAnalysis>[0]));
}

// ---------------------------------------------------------------------------
// Get single analysis
// ---------------------------------------------------------------------------

export async function getQuestionAnalysis(
  institutionId: string,
  questionId: string,
  analysisId: string,
): Promise<QuestionAnalysisSummary> {
  const question = await db.question.findFirst({
    where: { id: questionId, institutionId },
    select: { id: true },
  });
  if (!question) throw AppError.notFound("Question not found");

  const analysis = await db.questionAnalysis.findFirst({
    where: { id: analysisId, revision: { questionId } },
    include: analysisInclude,
  });
  if (!analysis) throw AppError.notFound("Analysis not found");

  return mapAnalysis(analysis as Parameters<typeof mapAnalysis>[0]);
}

// ---------------------------------------------------------------------------
// Faculty review / override
// ---------------------------------------------------------------------------

export async function reviewQuestionAnalysis(
  institutionId: string,
  questionId: string,
  analysisId: string,
  input: ReviewAnalysisInput,
  userId: string | null,
): Promise<QuestionAnalysisSummary> {
  const question = await db.question.findFirst({
    where: { id: questionId, institutionId },
    select: { id: true },
  });
  if (!question) throw AppError.notFound("Question not found");

  const existing = await db.questionAnalysis.findFirst({
    where: { id: analysisId, revision: { questionId } },
    select: { id: true, reviewStatus: true },
  });
  if (!existing) throw AppError.notFound("Analysis not found");

  // Prevent re-reviewing already reviewed analyses
  if (existing.reviewStatus !== "PENDING") {
    throw AppError.conflict(
      `Analysis has already been reviewed (status: ${existing.reviewStatus}). Create a new analysis to re-evaluate.`,
    );
  }

  const updated = await db.questionAnalysis.update({
    where: { id: analysisId },
    data: {
      reviewStatus: input.reviewAction as never,
      reviewedAt: new Date(),
      reviewedBy: userId,
      ...(input.reviewAction === "OVERRIDDEN" && {
        facultyBloomsLevel: input.facultyBloomsLevel as never ?? null,
        facultyDifficulty: input.facultyDifficulty as never ?? null,
        facultyNotes: input.facultyNotes ?? null,
      }),
    },
    include: analysisInclude,
  });

  return mapAnalysis(updated as Parameters<typeof mapAnalysis>[0]);
}

// ---------------------------------------------------------------------------
// Get latest analysis for a question
// ---------------------------------------------------------------------------

export async function getLatestQuestionAnalysis(
  institutionId: string,
  questionId: string,
): Promise<QuestionAnalysisSummary | null> {
  const question = await db.question.findFirst({
    where: { id: questionId, institutionId },
    select: { id: true },
  });
  if (!question) throw AppError.notFound("Question not found");

  const latest = await db.questionAnalysis.findFirst({
    where: { revision: { questionId } },
    orderBy: { createdAt: "desc" },
    include: analysisInclude,
  });

  return latest ? mapAnalysis(latest as Parameters<typeof mapAnalysis>[0]) : null;
}

// ---------------------------------------------------------------------------
// Resolve latest revision ID for a question
// ---------------------------------------------------------------------------

export async function resolveLatestRevisionId(
  institutionId: string,
  questionId: string,
): Promise<string> {
  const question = await db.question.findFirst({
    where: { id: questionId, institutionId },
    select: {
      revisions: {
        orderBy: { revisionNumber: "desc" },
        take: 1,
        select: { id: true },
      },
    },
  });
  if (!question) throw AppError.notFound("Question not found");
  const latestRev = question.revisions[0];
  if (!latestRev) throw AppError.notFound("No revisions found for this question");
  return latestRev.id;
}
