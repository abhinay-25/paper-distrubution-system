/**
 * Question generation routes — /api/v1/generation-jobs
 *
 * POST   /api/v1/generation-jobs                            — trigger generation job
 * GET    /api/v1/generation-jobs                            — list generation jobs
 * GET    /api/v1/generation-jobs/:jobId                     — get single job
 * GET    /api/v1/generation-jobs/:jobId/questions           — list generated questions
 * PATCH  /api/v1/generation-jobs/:jobId/questions/:questionId/review — faculty review / promote
 */

import { Router } from "express";
import { getTenant, requirePermission } from "../middleware/tenantContext.js";
import {
  createGenerationJobSchema,
  listGenerationJobsQuerySchema,
  generationJobParamSchema,
  generatedQuestionParamSchema,
  reviewGeneratedQuestionSchema,
} from "../schemas/academic.js";
import {
  createAndRunGenerationJob,
  listGenerationJobs,
  getGenerationJob,
  listGeneratedQuestions,
  reviewGeneratedQuestion,
} from "../services/questionGenerationService.js";

export const generationRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/v1/generation-jobs
// ---------------------------------------------------------------------------
generationRouter.post("/", requirePermission("ai:generate"), async (req, res, next) => {
  try {
    const { institutionId, userId } = getTenant(res);
    const input = createGenerationJobSchema.parse(req.body);
    const requestId = (req.headers["x-request-id"] as string | undefined) ?? undefined;

    const job = await createAndRunGenerationJob(
      institutionId,
      input,
      requestId,
      userId ?? undefined,
    );
    res.status(201).json(job);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/generation-jobs
// ---------------------------------------------------------------------------
generationRouter.get("/", requirePermission("ai:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const query = listGenerationJobsQuerySchema.parse(req.query);
    const result = await listGenerationJobs(institutionId, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/generation-jobs/:jobId
// ---------------------------------------------------------------------------
generationRouter.get("/:jobId", requirePermission("ai:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { jobId } = generationJobParamSchema.parse(req.params);
    const job = await getGenerationJob(institutionId, jobId);
    res.json(job);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/generation-jobs/:jobId/questions
// ---------------------------------------------------------------------------
generationRouter.get("/:jobId/questions", requirePermission("ai:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { jobId } = generationJobParamSchema.parse(req.params);
    const questions = await listGeneratedQuestions(institutionId, jobId);
    res.json({ data: questions });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/generation-jobs/:jobId/questions/:questionId/review
// ---------------------------------------------------------------------------
generationRouter.patch("/:jobId/questions/:questionId/review", requirePermission("ai:promote"), async (req, res, next) => {
  try {
    const { institutionId, userId } = getTenant(res);
    const { jobId, questionId } = generatedQuestionParamSchema.parse(req.params);
    const input = reviewGeneratedQuestionSchema.parse(req.body);

    const updated = await reviewGeneratedQuestion(
      institutionId,
      jobId,
      questionId,
      input,
      userId ?? undefined,
    );
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
