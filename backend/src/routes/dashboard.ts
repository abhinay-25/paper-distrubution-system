/**
 * Dashboard summary routes — /api/v1/dashboard
 *
 * Requires tenant context (X-Institution-Id in dev mode) via tenantContextMiddleware.
 */

import { Router } from "express";
import { z } from "zod";
import { getTenant, requirePermission } from "../middleware/tenantContext.js";
import { getDashboardSummary } from "../services/dashboardService.js";

export const dashboardRouter = Router();

const dashboardQuerySchema = z.object({}).strict();

/** GET /api/v1/dashboard — institution-scoped summary counts across all modules */
dashboardRouter.get("/", requirePermission("dashboard:view"), async (req, res, next) => {
  try {
    const { institutionId } = getTenant(res);
    dashboardQuerySchema.parse(req.query);
    const summary = await getDashboardSummary(institutionId);
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

