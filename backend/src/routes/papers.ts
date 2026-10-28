/**
 * Step 8 — Exam Configuration and Paper Builder routes.
 *
 * Base paths (under /api/v1):
 *   /exam-configs            — ExamConfiguration CRUD
 *   /exam-papers             — ExamPaper CRUD + lifecycle actions
 *   /exam-papers/:paperId/sections/:sectionId/slots — QuestionSlot management
 */

import { Router, type Request, type Response } from "express";
import { getTenant, requirePermission } from "../middleware/tenantContext.js";
import {
  createExamConfigSchema,
  updateExamConfigSchema,
  listExamConfigsQuerySchema,
  examConfigParamSchema,
  createExamPaperSchema,
  updateExamPaperSchema,
  listExamPapersQuerySchema,
  paperParamSchema,
  submitPaperSchema,
  createSectionSchema,
  updateSectionSchema,
  sectionParamSchema,
  addQuestionSlotSchema,
  updateQuestionSlotSchema,
  slotParamSchema,
  saveVersionSchema,
  compareVersionsSchema,
  previewModeSchema,
  paperVersionParamSchema,
  generatePdfSchema,
} from "../schemas/paper.js";
import {
  createExamConfig,
  listExamConfigs,
  getExamConfig,
  updateExamConfig,
  createExamPaper,
  listExamPapers,
  getExamPaper,
  updateExamPaper,
  submitExamPaper,
  addSection,
  updateSection,
  deleteSection,
  addQuestionSlot,
  updateQuestionSlot,
  removeQuestionSlot,
  validatePaper,
} from "../services/paperService.js";
import { getPaperPreview } from "../services/paperPreviewService.js";
import {
  saveVersion,
  listVersions,
  getVersion,
  compareVersions,
} from "../services/paperVersionService.js";
import {
  getPaperDecisionHistory,
  generateApprovedPaperPdf,
  getPdfArtifactDetails,
  getPdfDownloadStream,
} from "../services/paperApprovalService.js";

export const examConfigRouter = Router();
export const examPaperRouter = Router();

// ---------------------------------------------------------------------------
// Helper: resolve institutionId from tenant context
// ---------------------------------------------------------------------------

function getInstitutionId(res: Response): string {
  const { institutionId } = getTenant(res);
  return institutionId;
}

function sendPaginated(res: Response, result: { data: unknown[]; total: number; page: number; pageSize: number; totalPages: number }) {
  return res.json({
    data: result.data,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  });
}

// ===========================================================================
// ExamConfiguration routes — /api/v1/exam-configs
// ===========================================================================

/** POST /exam-configs */
examConfigRouter.post("/", requirePermission("exams:manage"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const body = createExamConfigSchema.parse(req.body);
  const config = await createExamConfig(institutionId, body);
  res.status(201).json(config);
});

/** GET /exam-configs */
examConfigRouter.get("/", requirePermission("exams:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const query = listExamConfigsQuerySchema.parse(req.query);
  const result = await listExamConfigs(institutionId, query);
  sendPaginated(res, result as { data: unknown[]; total: number; page: number; pageSize: number; totalPages: number });
});

/** GET /exam-configs/:configId */
examConfigRouter.get("/:configId", requirePermission("exams:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { configId } = examConfigParamSchema.parse(req.params);
  const config = await getExamConfig(institutionId, configId);
  res.json(config);
});

/** PATCH /exam-configs/:configId */
examConfigRouter.patch("/:configId", requirePermission("exams:manage"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { configId } = examConfigParamSchema.parse(req.params);
  const body = updateExamConfigSchema.parse(req.body);
  const config = await updateExamConfig(institutionId, configId, body);
  res.json(config);
});

// ===========================================================================
// ExamPaper routes — /api/v1/exam-papers
// ===========================================================================

/** POST /exam-papers */
examPaperRouter.post("/", requirePermission("papers:prepare"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const body = createExamPaperSchema.parse(req.body);
  const paper = await createExamPaper(institutionId, body);
  res.status(201).json(paper);
});

/** GET /exam-papers */
examPaperRouter.get("/", requirePermission("papers:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const query = listExamPapersQuerySchema.parse(req.query);
  const result = await listExamPapers(institutionId, query);
  sendPaginated(res, result as { data: unknown[]; total: number; page: number; pageSize: number; totalPages: number });
});

/** GET /exam-papers/:paperId */
examPaperRouter.get("/:paperId", requirePermission("papers:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const paper = await getExamPaper(institutionId, paperId);
  res.json(paper);
});

/** PATCH /exam-papers/:paperId */
examPaperRouter.patch("/:paperId", requirePermission("papers:prepare"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const body = updateExamPaperSchema.parse(req.body);
  const paper = await updateExamPaper(institutionId, paperId, body);
  res.json(paper);
});

/** POST /exam-papers/:paperId/submit */
examPaperRouter.post("/:paperId/submit", requirePermission("papers:submit"), async (req: Request, res: Response) => {
  const { institutionId, userId } = getTenant(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const body = submitPaperSchema.parse(req.body);
  const paper = await submitExamPaper(institutionId, paperId, body.notes, userId || undefined);
  res.json(paper);
});

/** GET /exam-papers/:paperId/submissions — list paper submission & approval history */
examPaperRouter.get("/:paperId/submissions", requirePermission("papers:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const history = await getPaperDecisionHistory(institutionId, paperId);
  res.json(history);
});

/** GET /exam-papers/:paperId/validate */
examPaperRouter.get("/:paperId/validate", requirePermission("papers:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const result = await validatePaper(institutionId, paperId);
  res.json(result);
});

// ---------------------------------------------------------------------------
// Step 9: Paper Preview & Versioning routes
// ---------------------------------------------------------------------------

/** GET /exam-papers/:paperId/preview?mode=faculty|candidate */
examPaperRouter.get("/:paperId/preview", requirePermission("papers:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const mode = previewModeSchema.optional().parse(req.query.mode) || "faculty";
  const preview = await getPaperPreview(institutionId, paperId, mode);
  res.json(preview);
});

/** POST /exam-papers/:paperId/versions */
examPaperRouter.post("/:paperId/versions", requirePermission("papers:prepare"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const body = saveVersionSchema.parse(req.body);
  const result = await saveVersion(
    institutionId,
    paperId,
    body.changeNote,
    body.concurrencyVersion,
  );
  res.status(201).json(result);
});

/** GET /exam-papers/:paperId/versions */
examPaperRouter.get("/:paperId/versions", requirePermission("papers:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const versions = await listVersions(institutionId, paperId);
  res.json(versions);
});

/** GET /exam-papers/:paperId/versions/compare?versionA=N&versionB=M */
examPaperRouter.get("/:paperId/versions/compare", requirePermission("papers:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const query = compareVersionsSchema.parse(req.query);
  const comparison = await compareVersions(
    institutionId,
    paperId,
    query.versionA,
    query.versionB,
  );
  res.json(comparison);
});

/** GET /exam-papers/:paperId/versions/:versionNumber */
examPaperRouter.get("/:paperId/versions/:versionNumber", requirePermission("papers:view"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId, versionNumber } = paperVersionParamSchema.parse(req.params);
  const version = await getVersion(institutionId, paperId, versionNumber);
  res.json(version);
});

// ---------------------------------------------------------------------------
// Step 10: PDF Generation and Artifact routes
// ---------------------------------------------------------------------------

/** POST /exam-papers/:paperId/pdf/generate — generate PDF from approved paper */
examPaperRouter.post("/:paperId/pdf/generate", requirePermission("pdf:generate"), async (req: Request, res: Response) => {
  const { institutionId, userId } = getTenant(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const body = generatePdfSchema.parse(req.body || {});
  const artifact = await generateApprovedPaperPdf(
    institutionId,
    paperId,
    userId ?? undefined,
    body,
  );
  res.status(201).json(artifact);
});

/** GET /exam-papers/:paperId/pdf — get PDF artifact metadata and integrity verification */
examPaperRouter.get("/:paperId/pdf", requirePermission("pdf:download"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const details = await getPdfArtifactDetails(institutionId, paperId);
  res.json(details);
});

/** GET /exam-papers/:paperId/pdf/download — download private PDF file */
examPaperRouter.get("/:paperId/pdf/download", requirePermission("pdf:download"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const { stream, fileName, fileSizeBytes, checksumSha256 } = await getPdfDownloadStream(
    institutionId,
    paperId,
  );
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Content-Length", fileSizeBytes);
  res.setHeader("ETag", `"${checksumSha256}"`);
  stream.pipe(res);
});

/** GET /exam-papers/:paperId/pdf/preview — inline PDF stream for browser viewer */
examPaperRouter.get("/:paperId/pdf/preview", requirePermission("pdf:download"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const { stream, fileName, fileSizeBytes, checksumSha256 } = await getPdfDownloadStream(
    institutionId,
    paperId,
  );
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
  res.setHeader("Content-Length", fileSizeBytes);
  res.setHeader("ETag", `"${checksumSha256}"`);
  stream.pipe(res);
});



// ---------------------------------------------------------------------------
// PaperSection routes — /exam-papers/:paperId/sections
// ---------------------------------------------------------------------------

/** POST /exam-papers/:paperId/sections */
examPaperRouter.post("/:paperId/sections", requirePermission("papers:prepare"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId } = paperParamSchema.parse(req.params);
  const body = createSectionSchema.parse(req.body);
  const section = await addSection(institutionId, paperId, body);
  res.status(201).json(section);
});

/** PATCH /exam-papers/:paperId/sections/:sectionId */
examPaperRouter.patch("/:paperId/sections/:sectionId", requirePermission("papers:prepare"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId, sectionId } = sectionParamSchema.parse(req.params);
  const body = updateSectionSchema.parse(req.body);
  const section = await updateSection(institutionId, paperId, sectionId, body);
  res.json(section);
});

/** DELETE /exam-papers/:paperId/sections/:sectionId */
examPaperRouter.delete("/:paperId/sections/:sectionId", requirePermission("papers:prepare"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId, sectionId } = sectionParamSchema.parse(req.params);
  await deleteSection(institutionId, paperId, sectionId);
  res.status(204).send();
});

// ---------------------------------------------------------------------------
// QuestionSlot routes — /exam-papers/:paperId/sections/:sectionId/slots
// ---------------------------------------------------------------------------

/** POST /exam-papers/:paperId/sections/:sectionId/slots */
examPaperRouter.post("/:paperId/sections/:sectionId/slots", requirePermission("papers:prepare"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId, sectionId } = sectionParamSchema.parse(req.params);
  const body = addQuestionSlotSchema.parse(req.body);
  const slot = await addQuestionSlot(institutionId, paperId, sectionId, body);
  res.status(201).json(slot);
});

/** PATCH /exam-papers/:paperId/sections/:sectionId/slots/:slotId */
examPaperRouter.patch("/:paperId/sections/:sectionId/slots/:slotId", requirePermission("papers:prepare"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId, sectionId, slotId } = slotParamSchema.parse(req.params);
  const body = updateQuestionSlotSchema.parse(req.body);
  const slot = await updateQuestionSlot(institutionId, paperId, sectionId, slotId, body);
  res.json(slot);
});

/** DELETE /exam-papers/:paperId/sections/:sectionId/slots/:slotId */
examPaperRouter.delete("/:paperId/sections/:sectionId/slots/:slotId", requirePermission("papers:prepare"), async (req: Request, res: Response) => {
  const institutionId = getInstitutionId(res);
  const { paperId, sectionId, slotId } = slotParamSchema.parse(req.params);
  await removeQuestionSlot(institutionId, paperId, sectionId, slotId);
  res.status(204).send();
});
