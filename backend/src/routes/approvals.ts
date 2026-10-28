/**
 * Paper Approval Queue Routes — Step 10
 *
 * Base path: /api/v1/paper-submissions
 */

import { Router, type Request, type Response } from "express";
import { getTenant, requirePermission } from "../middleware/tenantContext.js";
import {
  listSubmissionsQuerySchema,
  submissionParamSchema,
  reviewDecisionSchema,
} from "../schemas/paper.js";
import {
  listSubmissions,
  getSubmissionDetails,
  reviewSubmission,
} from "../services/paperApprovalService.js";

export const paperSubmissionRouter = Router();

const DEFAULT_DEV_REVIEWER_ID = "u0000000-0000-4000-8000-000000000002";

/** GET /api/v1/paper-submissions — list submissions awaiting or completed review */
paperSubmissionRouter.get("/", requirePermission("submissions:view"), async (req: Request, res: Response) => {
  const { institutionId } = getTenant(res);
  const query = listSubmissionsQuerySchema.parse(req.query);
  const result = await listSubmissions(institutionId, query);
  res.json(result);
});

/** GET /api/v1/paper-submissions/:submissionId — retrieve submission snapshot and validation */
paperSubmissionRouter.get("/:submissionId", requirePermission("submissions:view"), async (req: Request, res: Response) => {
  const { institutionId } = getTenant(res);
  const { submissionId } = submissionParamSchema.parse(req.params);
  const submission = await getSubmissionDetails(institutionId, submissionId);
  res.json(submission);
});

/** POST /api/v1/paper-submissions/:submissionId/decision — approve or reject submission */
paperSubmissionRouter.post("/:submissionId/decision", async (req: Request, res: Response) => {
  const { institutionId, userId, userRole } = getTenant(res);
  const { submissionId } = submissionParamSchema.parse(req.params);
  const body = reviewDecisionSchema.parse(req.body);

  const reviewerId = userId || DEFAULT_DEV_REVIEWER_ID;
  const role = userRole || "MODERATOR";

  const updated = await reviewSubmission(institutionId, submissionId, reviewerId, role, body);
  res.json(updated);
});

