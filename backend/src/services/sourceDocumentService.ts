import fs from "node:fs";
import crypto from "node:crypto";
import { db } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { processDocument } from "./documentProcessingService.js";

export type DocumentStatus = "UPLOADED" | "PROCESSING" | "INDEXED" | "FAILED";

export interface CreateSourceDocumentInput {
  title?: string;
  subjectId?: string;
}

export interface ListSourceDocumentsFilters {
  subjectId?: string;
  status?: DocumentStatus;
}

export interface CleanSourceDocument {
  id: string;
  institutionId: string;
  subjectId: string | null;
  uploadedById: string | null;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  contentHash: string;
  status: DocumentStatus;
  errorMessage: string | null;
  pageCount: number | null;
  chunkCount: number;
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  subject?: {
    id: string;
    code: string;
    name: string;
  } | null;
  uploadedBy?: {
    id: string;
    displayName: string;
    email: string;
  } | null;
}

function sanitizeDocument(doc: any): CleanSourceDocument {
  const { storagePath, ...rest } = doc;
  return rest as CleanSourceDocument;
}

export async function createSourceDocument(
  institutionId: string,
  uploadedById: string | null,
  input: CreateSourceDocumentInput,
  file: Express.Multer.File,
): Promise<CleanSourceDocument> {
  if (input.subjectId) {
    const subject = await db.subject.findFirst({
      where: { id: input.subjectId, institutionId },
    });
    if (!subject) {
      await fs.promises.unlink(file.path).catch(() => {});
      throw new AppError("Subject not found or does not belong to your institution", 400);
    }
  }

  const title = input.title?.trim() || file.originalname;
  const fileBuffer = await fs.promises.readFile(file.path);
  const contentHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  const doc = await db.sourceDocument.create({
    data: {
      institutionId,
      uploadedById,
      subjectId: input.subjectId || null,
      title,
      originalFilename: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      storagePath: file.path,
      contentHash,
      status: "UPLOADED",
    },
    include: {
      subject: { select: { id: true, code: true, name: true } },
      uploadedBy: { select: { id: true, displayName: true, email: true } },
    },
  });

  // Launch document extraction, chunking, and indexing in background
  void processDocument(doc.id).catch((err) => {
    console.error(`[SourceDocument] Background indexing failed for ${doc.id}:`, err);
  });

  return sanitizeDocument(doc);
}

export async function listSourceDocuments(
  institutionId: string,
  filters: ListSourceDocumentsFilters = {},
): Promise<CleanSourceDocument[]> {
  const docs = await db.sourceDocument.findMany({
    where: {
      institutionId,
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    include: {
      subject: { select: { id: true, code: true, name: true } },
      uploadedBy: { select: { id: true, displayName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return docs.map(sanitizeDocument);
}

export async function getSourceDocument(
  institutionId: string,
  id: string,
): Promise<CleanSourceDocument> {
  const doc = await db.sourceDocument.findUnique({
    where: { id },
    include: {
      subject: { select: { id: true, code: true, name: true } },
      uploadedBy: { select: { id: true, displayName: true, email: true } },
    },
  });

  if (!doc || doc.institutionId !== institutionId) {
    throw new AppError("Source document not found", 404);
  }

  return sanitizeDocument(doc);
}

export async function deleteSourceDocument(
  institutionId: string,
  id: string,
): Promise<{ success: boolean; id: string }> {
  const doc = await db.sourceDocument.findUnique({
    where: { id },
  });

  if (!doc || doc.institutionId !== institutionId) {
    throw new AppError("Source document not found", 404);
  }

  // Delete physical file
  await fs.promises.unlink(doc.storagePath).catch(() => {});

  // Delete DB record (cascades to document_chunks)
  await db.sourceDocument.delete({
    where: { id },
  });

  return { success: true, id };
}

export async function reprocessSourceDocument(
  institutionId: string,
  id: string,
): Promise<CleanSourceDocument> {
  const doc = await db.sourceDocument.findUnique({
    where: { id },
    include: {
      subject: { select: { id: true, code: true, name: true } },
      uploadedBy: { select: { id: true, displayName: true, email: true } },
    },
  });

  if (!doc || doc.institutionId !== institutionId) {
    throw new AppError("Source document not found", 404);
  }

  const updated = await db.sourceDocument.update({
    where: { id },
    data: {
      status: "UPLOADED",
      errorMessage: null,
      processingStartedAt: null,
      processingCompletedAt: null,
    },
    include: {
      subject: { select: { id: true, code: true, name: true } },
      uploadedBy: { select: { id: true, displayName: true, email: true } },
    },
  });

  void processDocument(id).catch((err) => {
    console.error(`[SourceDocument] Reprocess indexing failed for ${id}:`, err);
  });

  return sanitizeDocument(updated);
}

export async function getDocumentChunks(
  institutionId: string,
  documentId: string,
) {
  const doc = await db.sourceDocument.findUnique({
    where: { id: documentId },
    select: { id: true, institutionId: true },
  });

  if (!doc || doc.institutionId !== institutionId) {
    throw new AppError("Source document not found", 404);
  }

  const chunks = await db.documentChunk.findMany({
    where: {
      documentId: documentId,
      institutionId,
    },
    select: {
      id: true,
      chunkIndex: true,
      chunkText: true,
      pageNumber: true,
      tokenCount: true,
      createdAt: true,
    },
    orderBy: { chunkIndex: "asc" },
  });

  return chunks;
}
