/**
 * Private Storage Service — Step 10
 *
 * Implements private file storage for generated examination PDF artifacts.
 *
 * Key guarantees:
 *  1. Private location outside web root; never served via public static URLs.
 *  2. Atomic file persistence (write to temporary path, then rename) to prevent incomplete files.
 *  3. Cryptographic SHA-256 checksum calculation and verification.
 *  4. Path traversal protection.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { AppError } from "../middleware/errorHandler.js";

const DEFAULT_STORAGE_DIR = path.resolve(process.cwd(), "storage", "pdf-artifacts");

export function getStorageBaseDir(): string {
  return process.env["PDF_STORAGE_DIR"]
    ? path.resolve(process.env["PDF_STORAGE_DIR"])
    : DEFAULT_STORAGE_DIR;
}

export interface StoredArtifactMetadata {
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  checksumSha256: string;
}

/**
 * Persists a generated PDF buffer to private disk storage atomically.
 */
export async function savePdfArtifact(
  institutionId: string,
  paperId: string,
  versionNumber: number,
  buffer: Buffer,
): Promise<StoredArtifactMetadata> {
  const baseDir = getStorageBaseDir();
  const targetDir = path.join(baseDir, institutionId, paperId);

  await fs.promises.mkdir(targetDir, { recursive: true });

  const fileName = `paper_${paperId}_v${versionNumber}.pdf`;
  const filePath = path.join(targetDir, fileName);
  const tempPath = path.join(targetDir, `${fileName}.${crypto.randomBytes(6).toString("hex")}.tmp`);

  // Compute SHA-256 checksum
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  try {
    // Write to temporary file
    await fs.promises.writeFile(tempPath, buffer);
    // Atomically rename to final file path
    await fs.promises.rename(tempPath, filePath);
  } catch (err) {
    // Clean up temporary file if write or rename failed
    try {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch {
      // ignore cleanup error
    }
    throw new AppError(`Failed to persist PDF artifact to private storage: ${(err as Error).message}`, 500);
  }

  return {
    fileName,
    filePath,
    fileSizeBytes: buffer.length,
    checksumSha256: hash,
  };
}

/**
 * Returns a readable stream for a stored PDF artifact, verifying path boundary.
 */
export function getPdfStream(filePath: string): fs.ReadStream {
  const baseDir = getStorageBaseDir();
  const resolvedPath = path.resolve(filePath);

  // Path traversal check
  if (!resolvedPath.startsWith(baseDir)) {
    throw new AppError("Invalid file path: path traversal detected", 403);
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new AppError("PDF artifact file not found on storage", 404);
  }

  return fs.createReadStream(resolvedPath);
}

/**
 * Reads the stored file and verifies its SHA-256 hash against the expected checksum.
 */
export async function verifyFileIntegrity(
  filePath: string,
  expectedChecksum: string,
): Promise<{ verified: boolean; actualChecksum: string }> {
  const baseDir = getStorageBaseDir();
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(baseDir) || !fs.existsSync(resolvedPath)) {
    return { verified: false, actualChecksum: "" };
  }

  const content = await fs.promises.readFile(resolvedPath);
  const actualChecksum = crypto.createHash("sha256").update(content).digest("hex");

  return {
    verified: actualChecksum.toLowerCase() === expectedChecksum.toLowerCase(),
    actualChecksum,
  };
}

