import { Router } from "express";
import { healthRouter } from "./health.js";
import { authRouter } from "./auth.js";
import { institutionRouter } from "./institutions.js";
import { subjectRouter } from "./subjects.js";
import { questionRouter } from "./questions.js";
import { analysisRouter } from "./analyses.js";
import { generationRouter } from "./generation.js";
import { sourceDocumentRouter } from "./sourceDocuments.js";
import { examConfigRouter, examPaperRouter } from "./papers.js";
import { paperSubmissionRouter } from "./approvals.js";
import { dashboardRouter } from "./dashboard.js";
import { tenantContextMiddleware } from "../middleware/tenantContext.js";

/** Central route registry. */
export const apiRouter = Router();

// ---------------------------------------------------------------------------
// Unversioned utility & authentication routes (no pre-existing tenant required)
// ---------------------------------------------------------------------------

apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);

// ---------------------------------------------------------------------------
// /api/v1 — versioned academic API
// ---------------------------------------------------------------------------

const v1Router = Router();

// Authentication routes under /api/v1/auth (login, logout, me, switch-institution)
v1Router.use("/auth", authRouter);

// Apply server-side authentication & tenant context to all protected v1 routes.
v1Router.use(tenantContextMiddleware);

v1Router.use("/institutions", institutionRouter);
v1Router.use("/dashboard", dashboardRouter);
v1Router.use("/subjects", subjectRouter);
v1Router.use("/questions", questionRouter);
// Nested analyses under questions — mergeParams ensures questionId is accessible.
v1Router.use("/questions/:questionId/analyses", analysisRouter);
v1Router.use("/generation-jobs", generationRouter);
v1Router.use("/source-documents", sourceDocumentRouter);

// Step 8 — Examination Configuration and Paper Builder
v1Router.use("/exam-configs", examConfigRouter);
v1Router.use("/exam-papers", examPaperRouter);

// Step 10 — Independent Paper Approvals
v1Router.use("/paper-submissions", paperSubmissionRouter);

apiRouter.use("/v1", v1Router);


