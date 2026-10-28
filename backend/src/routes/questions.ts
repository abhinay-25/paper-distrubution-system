/**
 * Question routes — /api/v1/questions
 */

import { Router } from "express";
import { getTenant, requirePermission } from "../middleware/tenantContext.js";
import {
  createQuestionSchema,
  updateQuestionSchema,
  listQuestionsQuerySchema,
  questionParamSchema,
  revisionParamSchema,
} from "../schemas/academic.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  listQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  listRevisions,
  getRevision,
} from "../services/questionService.js";
import {
  getLatestQuestionAnalysis,
  resolveLatestRevisionId,
  triggerQuestionAnalysis,
} from "../services/questionAnalysisService.js";

export const questionRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/questions
// ---------------------------------------------------------------------------

questionRouter.get("/", requirePermission("questions:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const query = listQuestionsQuerySchema.parse(req.query);
    const result = await listQuestions(institutionId, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/questions
// ---------------------------------------------------------------------------

questionRouter.post("/", requirePermission("questions:write"), async (req, res, next) => {
  try {
    const { institutionId, userId } = getTenant(res);
    const input = createQuestionSchema.parse(req.body);
    const question = await createQuestion(institutionId, input, userId);
    res.status(201).json(question);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/questions/:questionId
// ---------------------------------------------------------------------------

questionRouter.get("/:questionId", requirePermission("questions:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId } = questionParamSchema.parse(req.params);
    const question = await getQuestion(institutionId, questionId);
    res.json(question);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/questions/:questionId
// (Creates a new revision — never mutates existing revisions)
// ---------------------------------------------------------------------------

questionRouter.patch("/:questionId", requirePermission("questions:write"), async (req, res, next) => {
  try {
    const { institutionId, userId } = getTenant(res);
    const { questionId } = questionParamSchema.parse(req.params);
    const input = updateQuestionSchema.parse(req.body);
    const question = await updateQuestion(institutionId, questionId, input, userId);
    res.json(question);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/questions/:questionId/revisions
// ---------------------------------------------------------------------------

questionRouter.get("/:questionId/revisions", requirePermission("questions:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId } = questionParamSchema.parse(req.params);
    const revisions = await listRevisions(institutionId, questionId);
    res.json({ data: revisions });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/questions/:questionId/revisions/:revisionId
// ---------------------------------------------------------------------------

questionRouter.get("/:questionId/revisions/:revisionId", requirePermission("questions:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId, revisionId } = revisionParamSchema.parse(req.params);
    const revision = await getRevision(institutionId, questionId, revisionId);
    res.json(revision);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/questions/:questionId/analysis
// Returns latest analysis for question
// ---------------------------------------------------------------------------

questionRouter.get("/:questionId/analysis", requirePermission("questions:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId } = questionParamSchema.parse(req.params);
    const analysis = await getLatestQuestionAnalysis(institutionId, questionId);
    if (!analysis) {
      throw AppError.notFound("No analysis found for this question");
    }
    res.json(analysis);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/questions/:questionId/classify
// Triggers / returns classification suggestion
// ---------------------------------------------------------------------------

questionRouter.post("/:questionId/classify", requirePermission("questions:write"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId } = questionParamSchema.parse(req.params);
    const bodyRevisionId = req.body?.revisionId as string | undefined;
    const revisionId = bodyRevisionId || (await resolveLatestRevisionId(institutionId, questionId));
    const requestId = (req.headers["x-request-id"] as string | undefined) ?? undefined;

    const analysis = await triggerQuestionAnalysis(
      institutionId,
      questionId,
      { revisionId, skipDuplicateDetection: true },
      requestId,
    );
    res.status(202).json({
      revisionId: analysis.revisionId,
      bloomsLevel: analysis.aiBloomsLevel,
      bloomsConfidence: analysis.aiBloomsConfidence,
      subjectTags: analysis.aiSubjectTags,
      questionTypeHint: analysis.aiQuestionTypeHint,
      analysisId: analysis.id,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/questions/:questionId/estimate-difficulty
// Triggers / returns difficulty estimation suggestion
// ---------------------------------------------------------------------------

questionRouter.post("/:questionId/estimate-difficulty", requirePermission("questions:write"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId } = questionParamSchema.parse(req.params);
    const bodyRevisionId = req.body?.revisionId as string | undefined;
    const revisionId = bodyRevisionId || (await resolveLatestRevisionId(institutionId, questionId));
    const requestId = (req.headers["x-request-id"] as string | undefined) ?? undefined;

    const analysis = await triggerQuestionAnalysis(
      institutionId,
      questionId,
      { revisionId, skipDuplicateDetection: true },
      requestId,
    );
    res.status(202).json({
      revisionId: analysis.revisionId,
      suggestedDifficulty: analysis.aiSuggestedDifficulty,
      confidence: analysis.aiDifficultyConfidence,
      rationale: analysis.aiDifficultyRationale,
      analysisId: analysis.id,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/questions/:questionId/detect-duplicates
// Triggers / returns semantic duplicate detection
// ---------------------------------------------------------------------------

questionRouter.post("/:questionId/detect-duplicates", requirePermission("questions:write"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId } = questionParamSchema.parse(req.params);
    const bodyRevisionId = req.body?.revisionId as string | undefined;
    const revisionId = bodyRevisionId || (await resolveLatestRevisionId(institutionId, questionId));
    const requestId = (req.headers["x-request-id"] as string | undefined) ?? undefined;

    const analysis = await triggerQuestionAnalysis(
      institutionId,
      questionId,
      { revisionId, skipDuplicateDetection: false },
      requestId,
    );
    res.status(202).json({
      revisionId: analysis.revisionId,
      hasPotentialDuplicates: analysis.hasPotentialDuplicates,
      hasNearDuplicates: analysis.hasNearDuplicates,
      duplicateCandidates: analysis.duplicateCandidates,
      nearDuplicateThreshold: analysis.nearDuplicateThreshold,
      potentialDuplicateThreshold: analysis.potentialDuplicateThreshold,
      analysisId: analysis.id,
    });
  } catch (err) {
    next(err);
  }
});
