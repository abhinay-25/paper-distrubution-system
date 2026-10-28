/**
 * Subject routes — /api/v1/subjects
 *
 * All routes require the X-Institution-Id dev header via tenantContextMiddleware.
 * In production, this will be replaced by session-based auth middleware.
 */

import { Router } from "express";
import { getTenant, requirePermission } from "../middleware/tenantContext.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  createSubjectSchema,
  updateSubjectSchema,
  listSubjectsQuerySchema,
  subjectParamSchema,
  topicParamSchema,
  createTopicSchema,
  updateTopicSchema,
} from "../schemas/academic.js";
import {
  listSubjects,
  getSubject,
  createSubject,
  updateSubject,
} from "../services/subjectService.js";
import {
  listTopics,
  getTopic,
  createTopic,
  updateTopic,
} from "../services/topicService.js";

export const subjectRouter = Router();

// ---------------------------------------------------------------------------
// GET /api/v1/subjects
// ---------------------------------------------------------------------------

subjectRouter.get("/", requirePermission("subjects:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const query = listSubjectsQuerySchema.parse(req.query);
    const result = await listSubjects(institutionId, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/subjects
// ---------------------------------------------------------------------------

subjectRouter.post("/", requirePermission("subjects:manage"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const input = createSubjectSchema.parse(req.body);
    const subject = await createSubject(institutionId, input);
    res.status(201).json(subject);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/subjects/:subjectId
// ---------------------------------------------------------------------------

subjectRouter.get("/:subjectId", requirePermission("subjects:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { subjectId } = subjectParamSchema.parse(req.params);
    const subject = await getSubject(institutionId, subjectId);
    res.json(subject);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/subjects/:subjectId
// ---------------------------------------------------------------------------

subjectRouter.patch("/:subjectId", requirePermission("subjects:manage"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { subjectId } = subjectParamSchema.parse(req.params);
    const input = updateSubjectSchema.parse(req.body);
    const subject = await updateSubject(institutionId, subjectId, input);
    res.json(subject);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/subjects/:subjectId/topics
// ---------------------------------------------------------------------------

subjectRouter.get("/:subjectId/topics", requirePermission("subjects:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { subjectId } = subjectParamSchema.parse(req.params);
    const topics = await listTopics(institutionId, subjectId);
    res.json({ data: topics });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/subjects/:subjectId/topics
// ---------------------------------------------------------------------------

subjectRouter.post("/:subjectId/topics", requirePermission("subjects:manage"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { subjectId } = subjectParamSchema.parse(req.params);
    const input = createTopicSchema.parse(req.body);
    const topic = await createTopic(institutionId, subjectId, input);
    res.status(201).json(topic);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/subjects/:subjectId/topics/:topicId
// ---------------------------------------------------------------------------

subjectRouter.get("/:subjectId/topics/:topicId", requirePermission("subjects:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { subjectId, topicId } = topicParamSchema.parse(req.params);
    const topic = await getTopic(institutionId, subjectId, topicId);
    res.json(topic);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/subjects/:subjectId/topics/:topicId
// ---------------------------------------------------------------------------

subjectRouter.patch("/:subjectId/topics/:topicId", requirePermission("subjects:manage"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    const { subjectId, topicId } = topicParamSchema.parse(req.params);
    const input = updateTopicSchema.parse(req.body);
    const topic = await updateTopic(institutionId, subjectId, topicId, input);
    res.json(topic);
  } catch (err) {
    next(err);
  }
});

// Silence unused import warning until more routes use it.
void AppError;
