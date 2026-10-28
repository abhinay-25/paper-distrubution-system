/**
 * Question analysis routes — nested under /api/v1/questions/:questionId/analyses
 *
 * POST   /api/v1/questions/:questionId/analyses           — trigger AI analysis
 * GET    /api/v1/questions/:questionId/analyses           — list all analyses
 * GET    /api/v1/questions/:questionId/analyses/:analysisId — get one analysis
 * PATCH  /api/v1/questions/:questionId/analyses/:analysisId/review — faculty review
 */

import { Router } from "express";
import { getTenant, requirePermission } from "../middleware/tenantContext.js";
import {
  triggerAnalysisSchema,
  reviewAnalysisSchema,
  analysisRouteParamSchema,
  questionParamSchema,
} from "../schemas/academic.js";
import {
  triggerQuestionAnalysis,
  listQuestionAnalyses,
  getQuestionAnalysis,
  reviewQuestionAnalysis,
} from "../services/questionAnalysisService.js";

export const analysisRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// POST /api/v1/questions/:questionId/analyses
// Trigger AI analysis for a specific revision
// ---------------------------------------------------------------------------

analysisRouter.post("/", requirePermission("questions:write"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId } = questionParamSchema.parse(req.params);
    const input = triggerAnalysisSchema.parse(req.body);

    const requestId = (req.headers["x-request-id"] as string | undefined) ?? undefined;
    const analysis = await triggerQuestionAnalysis(institutionId, questionId, input, requestId);

    res.status(202).json(analysis);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/questions/:questionId/analyses
// List all analyses for a question (newest first)
// ---------------------------------------------------------------------------

analysisRouter.get("/", requirePermission("questions:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId } = questionParamSchema.parse(req.params);

    const analyses = await listQuestionAnalyses(institutionId, questionId);
    res.json({ data: analyses });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/questions/:questionId/analyses/:analysisId
// Get a single analysis record
// ---------------------------------------------------------------------------

analysisRouter.get("/:analysisId", requirePermission("questions:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { questionId, analysisId } = analysisRouteParamSchema.parse(req.params);

    const analysis = await getQuestionAnalysis(institutionId, questionId, analysisId);
    res.json(analysis);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/questions/:questionId/analyses/:analysisId/review
// Faculty review: ACCEPTED | OVERRIDDEN | DISMISSED
// ---------------------------------------------------------------------------

analysisRouter.patch("/:analysisId/review", requirePermission("questions:write"), async (req, res, next) => {
  try {
    const { institutionId, userId } = getTenant(res);
    const { questionId, analysisId } = analysisRouteParamSchema.parse(req.params);
    const input = reviewAnalysisSchema.parse(req.body);

    const updated = await reviewQuestionAnalysis(institutionId, questionId, analysisId, input, userId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
