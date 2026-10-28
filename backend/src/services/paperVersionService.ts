/**
 * Paper Versioning and Snapshot Service — Step 9
 *
 * Implements:
 *  - Optimistic concurrency control (concurrencyVersion verification)
 *  - Full paper snapshot persistence (PaperVersion)
 *  - Historical version listing (metadata only, no heavy payloads)
 *  - Version snapshot retrieval
 *  - Side-by-side snapshot comparison
 *
 * Tenant isolation is strictly enforced on all operations.
 */

import { db } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";

export interface SaveVersionResult {
  versionNumber: number;
  concurrencyVersion: number;
}

export interface VersionSummary {
  id: string;
  paperId: string;
  versionNumber: number;
  changeNote: string | null;
  createdAt: Date;
}

/**
 * Save an immutable version snapshot of an exam paper.
 * Verifies concurrencyVersion matches the expected token to prevent concurrent overwrite.
 */
export async function saveVersion(
  institutionId: string,
  paperId: string,
  changeNote: string | undefined,
  concurrencyVersion: number,
): Promise<SaveVersionResult> {
  return db.$transaction(async (tx) => {
    // 1. Fetch paper with its complete tree
    const paper = await tx.examPaper.findUnique({
      where: { id: paperId },
      include: {
        config: {
          include: {
            subject: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        sections: {
          orderBy: { sequenceOrder: "asc" },
          include: {
            slots: {
              orderBy: { sequenceOrder: "asc" },
              include: {
                revision: {
                  select: {
                    id: true,
                    revisionNumber: true,
                    questionText: true,
                    questionType: true,
                    marks: true,
                    difficulty: true,
                    language: true,
                    explanation: true,
                    analyses: {
                      orderBy: { createdAt: "desc" },
                      select: {
                        aiBloomsLevel: true,
                        facultyBloomsLevel: true,
                        reviewStatus: true,
                        hasPotentialDuplicates: true,
                        hasNearDuplicates: true,
                      },
                    },
                    questionTopicMaps: {
                      include: {
                        topic: {
                          select: { id: true, name: true, code: true, sequenceOrder: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!paper || paper.institutionId !== institutionId) {
      throw new AppError("Exam paper not found", 404);
    }

    if (paper.status === "SUBMITTED" || paper.status === "APPROVED") {
      throw new AppError(
        `Cannot create a new draft version while paper is ${paper.status}`,
        409,
      );
    }

    // 2. Concurrency check (optimistic locking)
    if (paper.concurrencyVersion !== concurrencyVersion) {
      throw new AppError("Concurrent edit detected — please reload the paper", 409);
    }

    // 3. Determine next version number
    const latestVersion = await tx.paperVersion.findFirst({
      where: { paperId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    // 4. Create snapshot JSON
    const snapshotJson = JSON.parse(JSON.stringify(paper));

    await tx.paperVersion.create({
      data: {
        paperId,
        versionNumber: nextVersionNumber,
        snapshotJson,
        changeNote: changeNote?.trim() || null,
      },
    });

    // 5. Increment concurrencyVersion on examPaper (and transition REJECTED -> DRAFT)
    const newConcurrencyVersion = concurrencyVersion + 1;
    await tx.examPaper.update({
      where: { id: paperId },
      data: {
        concurrencyVersion: newConcurrencyVersion,
        ...(paper.status === "REJECTED" && { status: "DRAFT" }),
      },
    });

    return {
      versionNumber: nextVersionNumber,
      concurrencyVersion: newConcurrencyVersion,
    };
  });
}

/**
 * List all historical versions for a paper.
 * Returns metadata only (omits heavy snapshot JSON for fast loading).
 */
export async function listVersions(
  institutionId: string,
  paperId: string,
): Promise<VersionSummary[]> {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { id: true, institutionId: true },
  });
  if (!paper || paper.institutionId !== institutionId) {
    throw new AppError("Exam paper not found", 404);
  }

  return db.paperVersion.findMany({
    where: { paperId },
    select: {
      id: true,
      paperId: true,
      versionNumber: true,
      changeNote: true,
      createdAt: true,
    },
    orderBy: { versionNumber: "desc" },
  });
}

/**
 * Retrieve a specific version snapshot by version number.
 */
export async function getVersion(
  institutionId: string,
  paperId: string,
  versionNumber: number,
) {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { id: true, institutionId: true },
  });
  if (!paper || paper.institutionId !== institutionId) {
    throw new AppError("Exam paper not found", 404);
  }

  const version = await db.paperVersion.findUnique({
    where: {
      paperId_versionNumber: {
        paperId,
        versionNumber,
      },
    },
  });

  if (!version) {
    throw new AppError(`Paper version ${versionNumber} not found`, 404);
  }

  return version;
}

/**
 * Compare two version snapshots of the same paper.
 */
export async function compareVersions(
  institutionId: string,
  paperId: string,
  versionA: number,
  versionB: number,
) {
  const [verA, verB] = await Promise.all([
    getVersion(institutionId, paperId, versionA),
    getVersion(institutionId, paperId, versionB),
  ]);

  return {
    versionA: verA.snapshotJson,
    versionB: verB.snapshotJson,
  };
}

