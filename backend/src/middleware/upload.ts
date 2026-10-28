import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import type { Request } from "express";
import { AppError } from "./errorHandler.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads", "source-documents");

// Ensure directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Generate secure random filename
    const uuid = crypto.randomUUID();
    const safeExt = MIME_TO_EXT[file.mimetype] || path.extname(file.originalname).toLowerCase();
    // Guard against path traversal in ext
    const cleanExt = safeExt.replace(/[^a-z0-9.]/gi, "").replace(/\.+/g, ".");
    cb(null, `${uuid}${cleanExt.startsWith(".") ? cleanExt : `.${cleanExt}`}`);
  },
});

function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        `Unsupported file type '${file.mimetype}'. Only PDF (.pdf), TXT (.txt), and DOCX (.docx) documents are supported.`,
        400,
      ),
    );
  }
}

export const sourceDocumentUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
  fileFilter,
});
