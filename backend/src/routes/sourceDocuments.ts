import { Router } from "express";
import { z } from "zod";
import { getTenant, requirePermission } from "../middleware/tenantContext.js";
import { sourceDocumentUpload } from "../middleware/upload.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  createSourceDocument,
  listSourceDocuments,
  getSourceDocument,
  deleteSourceDocument,
  reprocessSourceDocument,
  getDocumentChunks,
  type DocumentStatus,
} from "../services/sourceDocumentService.js";

export const sourceDocumentRouter = Router();

const uuidParamSchema = z.object({
  id: z.string().uuid("Invalid document ID"),
});

const listQuerySchema = z.object({
  subjectId: z.string().uuid().optional(),
  status: z.enum(["UPLOADED", "PROCESSING", "INDEXED", "FAILED"]).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/v1/source-documents — upload document
// ---------------------------------------------------------------------------
sourceDocumentRouter.post(
  "/",
  requirePermission("questions:write"),
  sourceDocumentUpload.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError("No file uploaded. Please provide a document file.", 400);
      }

      const { institutionId, userId } = getTenant(res);
      const title = typeof req.body.title === "string" ? req.body.title : undefined;
      const subjectId = typeof req.body.subjectId === "string" && req.body.subjectId.trim() ? req.body.subjectId.trim() : undefined;

      const doc = await createSourceDocument(
        institutionId,
        userId,
        { title, subjectId },
        req.file,
      );

      res.status(201).json(doc);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/source-documents — list documents
// ---------------------------------------------------------------------------
sourceDocumentRouter.get(
  "/",
  requirePermission("questions:view"),
  async (req, res, next) => {
    try {
      const { institutionId } = getTenant(res);
      const query = listQuerySchema.parse(req.query);

      const docs = await listSourceDocuments(institutionId, {
        subjectId: query.subjectId,
        status: query.status as DocumentStatus | undefined,
      });

      res.json(docs);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/source-documents/:id — get single document details
// ---------------------------------------------------------------------------
sourceDocumentRouter.get(
  "/:id",
  requirePermission("questions:view"),
  async (req, res, next) => {
    try {
      const { institutionId } = getTenant(res);
      const { id } = uuidParamSchema.parse(req.params);

      const doc = await getSourceDocument(institutionId, id);
      res.json(doc);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/v1/source-documents/:id/reprocess — reprocess failed or updated doc
// ---------------------------------------------------------------------------
sourceDocumentRouter.post(
  "/:id/reprocess",
  requirePermission("questions:write"),
  async (req, res, next) => {
    try {
      const { institutionId } = getTenant(res);
      const { id } = uuidParamSchema.parse(req.params);

      const doc = await reprocessSourceDocument(institutionId, id);
      res.json(doc);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/v1/source-documents/:id — delete document & chunks
// ---------------------------------------------------------------------------
sourceDocumentRouter.delete(
  "/:id",
  requirePermission("questions:write"),
  async (req, res, next) => {
    try {
      const { institutionId } = getTenant(res);
      const { id } = uuidParamSchema.parse(req.params);

      const result = await deleteSourceDocument(institutionId, id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/v1/source-documents/:id/chunks — inspect chunk breakdown
// ---------------------------------------------------------------------------
sourceDocumentRouter.get(
  "/:id/chunks",
  requirePermission("questions:view"),
  async (req, res, next) => {
    try {
      const { institutionId } = getTenant(res);
      const { id } = uuidParamSchema.parse(req.params);

      const chunks = await getDocumentChunks(institutionId, id);
      res.json(chunks);
    } catch (err) {
      next(err);
    }
  },
);
