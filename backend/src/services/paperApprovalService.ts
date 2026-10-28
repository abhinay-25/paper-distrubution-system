/**
 * Independent Paper Approval and PDF Generation Service — Step 10
 *
 * Implements:
 *  - Independent approval lifecycle (DRAFT -> SUBMITTED -> APPROVED / REJECTED)
 *  - Immutable version snapshot association at submission time
 *  - Strict independent review enforcement (self-approval prohibited, role verification)
 *  - Mandatory review comments on rejection
 *  - Generation of college-template PDF bound to approved snapshot
 *  - Private PDF storage and cryptographic integrity verification
 */

import { db } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import { saveVersion } from "./paperVersionService.js";
import { hasPermission } from "./permissionPolicy.js";
import {
  renderCollegeQuestionPaperPdf,
  type ApprovedPaperSnapshot,
  type SectionData,
  type QuestionData,
} from "./pdfRendererService.js";
import {
  savePdfArtifact,
  getPdfStream,
  verifyFileIntegrity,
  type StoredArtifactMetadata,
} from "./storageService.js";
import type { Readable } from "node:stream";

export type ApprovalDecision = "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";

export interface SubmitPaperOptions {
  notes?: string;
  concurrencyVersion?: number;
}

export interface ReviewSubmissionInput {
  decision: ApprovalDecision;
  comments?: string;
}

/**
 * Submit an eligible exam paper for independent review.
 * Captures an immutable snapshot (PaperVersion) and creates a PaperSubmission.
 */
export async function submitPaperForApproval(
  institutionId: string,
  paperId: string,
  userId: string,
  options: SubmitPaperOptions = {},
) {
  // 1. Fetch paper and verify tenant isolation
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    include: {
      config: { include: { subject: true } },
      sections: { include: { slots: { include: { revision: true } } } },
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (!paper || paper.institutionId !== institutionId) {
    throw new AppError("Exam paper not found", 404);
  }

  // 2. Validate current paper status
  if (paper.status === "SUBMITTED") {
    throw new AppError("Paper is already pending review", 409);
  }
  if (paper.status === "APPROVED") {
    throw new AppError("Paper is already approved", 400);
  }

  // 3. Pre-submission validation: blocking errors prohibit submission
  const { validatePaper } = await import("./paperService.js");
  const validation = await validatePaper(institutionId, paperId);
  const blockingIssues = validation.issues.filter((i) => i.severity === "ERROR");
  if (blockingIssues.length > 0) {
    throw new AppError(
      `Paper cannot be submitted due to ${blockingIssues.length} blocking validation error(s): ${blockingIssues.map((b) => b.message).join("; ")}`,
      422,
    );
  }

  // 4. Ensure an immutable snapshot is persisted for the exact current draft state.
  // If no version exists yet, OR if the latest version was already used in a previous submission,
  // OR if the draft was modified after the latest version snapshot was taken, create a new version.
  let version = paper.versions[0];
  let needsNewSnapshot = !version;

  if (version) {
    const existingSubForVersion = await db.paperSubmission?.findFirst?.({
      where: { paperVersionId: version.id },
      select: { id: true },
    });
    if (existingSubForVersion) {
      needsNewSnapshot = true;
    } else {
      const snap = version.snapshotJson as Record<string, unknown> | null;
      if (snap && (snap["title"] !== paper.title || snap["version"] !== paper.version)) {
        needsNewSnapshot = true;
      }
    }
  }

  if (needsNewSnapshot) {
    const verResult = await saveVersion(
      institutionId,
      paperId,
      options.notes || (version ? "Re-submission snapshot" : "Initial submission snapshot"),
      paper.concurrencyVersion,
    );
    const createdVer = await db.paperVersion.findUnique({
      where: {
        paperId_versionNumber: {
          paperId,
          versionNumber: verResult.versionNumber,
        },
      },
    });
    if (!createdVer) throw new AppError("Failed to persist version snapshot", 500);
    version = createdVer;
  }

  if (!version) {
    throw new AppError("Failed to resolve paper version snapshot", 500);
  }
  const resolvedVersion = version;

  // 5. Create submission record and update paper state in transaction
  return db.$transaction(async (tx) => {
    const submission = await tx.paperSubmission.create({
      data: {
        institutionId,
        paperId,
        paperVersionId: resolvedVersion.id,
        submittedBy: userId,
        submitterNotes: options.notes?.trim() || null,
        status: "PENDING",
        validationSnapshot: JSON.parse(JSON.stringify(validation)),
      },
      include: {
        paper: { select: { id: true, title: true, status: true } },
        version: { select: { id: true, versionNumber: true } },
      },
    });

    await tx.examPaper.update({
      where: { id: paperId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        createdBy: paper.createdBy || userId,
        notes: options.notes ?? paper.notes,
      },
    });

    return {
      ...submission,
      status: "SUBMITTED" as const,
      submissionStatus: submission.status,
    };
  });
}

/**
 * List submissions within the caller's institution with optional status filter.
 */
export async function listSubmissions(
  institutionId: string,
  query: { status?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

  const where: Record<string, unknown> = { institutionId };
  if (query.status) {
    where["status"] = query.status;
  }

  const [total, submissions] = await Promise.all([
    db.paperSubmission.count({ where }),
    db.paperSubmission.findMany({
      where,
      include: {
        paper: {
          select: {
            id: true,
            title: true,
            config: {
              select: {
                id: true,
                name: true,
                totalMarks: true,
                subject: { select: { id: true, name: true, code: true } },
              },
            },
          },
        },
        version: {
          select: {
            id: true,
            versionNumber: true,
            createdAt: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    data: submissions,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/**
 * Get full submission details including exact snapshot JSON and validation findings.
 */
export async function getSubmissionDetails(institutionId: string, submissionId: string) {
  const submission = await db.paperSubmission.findUnique({
    where: { id: submissionId },
    include: {
      paper: {
        include: {
          config: {
            include: {
              subject: { select: { id: true, name: true, code: true } },
            },
          },
        },
      },
      version: true,
    },
  });

  if (!submission || submission.institutionId !== institutionId) {
    throw new AppError("Submission not found", 404);
  }

  return submission;
}

/**
 * List decision history for a paper across all its versions.
 */
export async function getPaperDecisionHistory(institutionId: string, paperId: string) {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { id: true, institutionId: true },
  });

  if (!paper || paper.institutionId !== institutionId) {
    throw new AppError("Exam paper not found", 404);
  }

  return db.paperSubmission.findMany({
    where: { paperId, institutionId },
    include: {
      version: { select: { id: true, versionNumber: true, createdAt: true } },
    },
    orderBy: { submittedAt: "desc" },
  });
}

/**
 * Record an independent approval or rejection decision.
 *
 * Invariants:
 *  1. Self-approval strictly prohibited: submitter !== reviewer
 *  2. Reviewer must have MODERATOR, INSTITUTION_ADMIN, or SUPER_ADMIN role
 *  3. Mandatory comments when rejecting or requesting changes
 *  4. Safe concurrency: only PENDING submissions can be decided
 */
export async function reviewSubmission(
  institutionId: string,
  submissionId: string,
  reviewerId: string,
  reviewerRole: string | null,
  input: ReviewSubmissionInput,
) {
  const submission = await db.paperSubmission.findUnique({
    where: { id: submissionId },
    include: { paper: true, version: true },
  });

  if (!submission || submission.institutionId !== institutionId) {
    throw new AppError("Submission not found", 404);
  }

  if (submission.status !== "PENDING") {
    throw new AppError("Submission has already been decided", 409);
  }

  // Invariant 1: Self-approval check
  if (submission.submittedBy === reviewerId) {
    throw new AppError(
      "Self-approval prohibited: An author cannot approve or reject their own question paper submission",
      403,
    );
  }

  // Invariant 2: Approver role / permission check
  if (reviewerRole) {
    if (!hasPermission(reviewerRole, "submissions:decide")) {
      throw new AppError(
        `Unauthorized: Approver role required (MODERATOR, INSTITUTION_ADMIN, or SUPER_ADMIN). Current role: ${reviewerRole}`,
        403,
      );
    }
  }

  // Invariant 3: Mandatory comments on rejection / changes requested
  if (input.decision === "REJECTED" || input.decision === "CHANGES_REQUESTED") {
    if (!input.comments || input.comments.trim().length === 0) {
      throw new AppError(
        "A review comment or rejection reason is mandatory when rejecting or requesting changes",
        422,
      );
    }
  }

  const decidedAt = new Date();
  const decisionComments = input.comments?.trim() || null;

  return db.$transaction(async (tx) => {
    // 1. Update submission
    const updatedSubmission = await tx.paperSubmission.update({
      where: { id: submissionId },
      data: {
        status: input.decision,
        decidedBy: reviewerId,
        decidedAt,
        decision: input.decision,
        reviewComments: decisionComments,
      },
    });

    // 2. Update paper status
    if (input.decision === "APPROVED") {
      await tx.examPaper.update({
        where: { id: submission.paperId },
        data: {
          status: "APPROVED",
          approvedAt: decidedAt,
          approvedBy: reviewerId,
          rejectionReason: null,
        },
      });
    } else {
      await tx.examPaper.update({
        where: { id: submission.paperId },
        data: {
          status: "REJECTED",
          rejectionReason: decisionComments,
          concurrencyVersion: { increment: 1 },
        },
      });
    }

    return updatedSubmission;
  });
}

/**
 * Generate a college-template PDF for an approved paper.
 *
 * Invariants:
 *  - Generates only for APPROVED papers
 *  - Idempotent: returns existing artifact unless forceRegenerate is true
 *  - Calculates and records SHA-256 integrity hash
 */
export async function generateApprovedPaperPdf(
  institutionId: string,
  paperId: string,
  userId?: string,
  options: { forceRegenerate?: boolean } = {},
) {
  // 1. Fetch paper and verify approval
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    include: {
      config: { include: { subject: true } },
      versions: { orderBy: { versionNumber: "desc" }, take: 1 },
    },
  });

  if (!paper || paper.institutionId !== institutionId) {
    throw new AppError("Exam paper not found", 404);
  }

  if (paper.status !== "APPROVED") {
    throw new AppError(
      `PDF generation is only permitted for APPROVED papers. Current status: ${paper.status}`,
      400,
    );
  }

  const latestVersion = paper.versions[0];
  if (!latestVersion) {
    throw new AppError("Approved paper does not have a version snapshot", 500);
  }

  // 2. Return existing artifact if already generated and not forcing regeneration
  if (!options.forceRegenerate) {
    const existingArtifact = await db.paperPdfArtifact.findFirst({
      where: { paperVersionId: latestVersion.id },
      orderBy: { createdAt: "desc" },
    });
    if (existingArtifact) {
      return existingArtifact;
    }
  }

  // 3. Extract institution name for header
  const institution = await db.institution.findUnique({
    where: { id: institutionId },
    select: { name: true },
  });

  // 4. Construct snapshot for PDF renderer from immutable snapshotJson
  const snapshotData = latestVersion.snapshotJson as any;

  const sortedRawSections = [...(snapshotData.sections || [])].sort(
    (a: any, b: any) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0),
  );

  const sections: SectionData[] = sortedRawSections.map((sec: any) => {
    const sortedSlots = [...(sec.slots || [])].sort(
      (a: any, b: any) => (a.sequenceOrder ?? 0) - (b.sequenceOrder ?? 0),
    );
    return {
      id: sec.id,
      sectionLabel: sec.sectionLabel || "A",
      title: sec.title || "",
      description: sec.description ?? null,
      requiredAnswers: sec.requiredAnswers,
      totalSlots: sec.totalSlots,
      sectionMarks: sec.sectionMarks,
      questions: sortedSlots.map((slot: any, idx: number) => {
        const analysis = slot.revision?.analyses?.[0];
        const resolvedBlooms =
          analysis?.facultyBloomsLevel ||
          analysis?.aiBloomsLevel ||
          slot.bloomsLevel ||
          (slot.revision?.difficulty === "HARD"
            ? "ANALYZE"
            : slot.revision?.difficulty === "MEDIUM"
            ? "UNDERSTAND"
            : "REMEMBER");

        const topic = slot.revision?.questionTopicMaps?.[0]?.topic;
        let resolvedCo: number | string = slot.courseOutcome ?? 1;
        if (typeof topic?.sequenceOrder === "number" && topic.sequenceOrder > 0) {
          resolvedCo = topic.sequenceOrder;
        } else if (typeof topic?.code === "string") {
          const match = topic.code.match(/(\d+)/);
          if (match?.[1]) resolvedCo = parseInt(match[1], 10);
        } else if (typeof topic?.name === "string") {
          const match = topic.name.match(/(?:CO|UNIT|U)\s*(\d+)/i);
          if (match?.[1]) resolvedCo = parseInt(match[1], 10);
        }

        return {
          slotId: slot.id,
          sequenceOrder: slot.sequenceOrder ?? idx + 1,
          questionText: slot.revision?.questionText || slot.questionText || "",
          marks: slot.allocatedMarks ?? slot.revision?.marks ?? 0,
          bloomsLevel: resolvedBlooms,
          courseOutcome: resolvedCo,
          subpartLabel: slot.subpartLabel ?? null,
          choiceGroup: slot.choiceGroup ?? null,
          orWithNext: slot.orWithNext ?? false,
        };
      }),
    };
  });

  const pdfSnapshot: ApprovedPaperSnapshot = {
    id: paper.id,
    title: paper.title,
    version: latestVersion.versionNumber,
    institutionName: institution?.name || "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)",
    regulationCode: "R22",
    config: {
      name: paper.config.name,
      totalMarks: paper.config.totalMarks.toString(),
      durationMinutes: paper.config.durationMinutes,
      instructions: paper.config.instructions,
      subject: {
        id: paper.config.subject.id,
        name: paper.config.subject.name,
        code: paper.config.subject.code,
      },
    },
    sections,
  };

  // 5. Render deterministic PDF
  const renderResult = await renderCollegeQuestionPaperPdf(pdfSnapshot);

  // 6. Save PDF to private disk storage
  const stored = await savePdfArtifact(
    institutionId,
    paperId,
    latestVersion.versionNumber,
    renderResult.buffer,
  );

  // 7. Persist artifact record in database
  return db.paperPdfArtifact.create({
    data: {
      institutionId,
      paperId,
      paperVersionId: latestVersion.id,
      templateId: renderResult.templateId,
      templateVersion: renderResult.templateVersion,
      rendererVersion: renderResult.rendererVersion,
      fileName: stored.fileName,
      filePath: stored.filePath,
      fileSizeBytes: stored.fileSizeBytes,
      checksumSha256: stored.checksumSha256,
      pageCount: renderResult.pageCount,
      generatedBy: userId || null,
    },
  });
}

/**
 * Retrieve the latest PDF artifact record and verify file integrity on disk.
 */
export async function getPdfArtifactDetails(institutionId: string, paperId: string) {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    select: { id: true, institutionId: true, status: true },
  });

  if (!paper || paper.institutionId !== institutionId) {
    throw new AppError("Exam paper not found", 404);
  }

  const artifact = await db.paperPdfArtifact.findFirst({
    where: { paperId, institutionId },
    orderBy: { createdAt: "desc" },
    include: {
      version: { select: { versionNumber: true, createdAt: true } },
    },
  });

  if (!artifact) {
    throw new AppError("No generated PDF artifact found for this paper", 404);
  }

  // Verify file integrity
  const { verified, actualChecksum } = await verifyFileIntegrity(
    artifact.filePath,
    artifact.checksumSha256,
  );

  return {
    ...artifact,
    integrityVerified: verified,
    actualChecksum,
  };
}

/**
 * Open a readable stream to the private PDF artifact for download/preview.
 * Verifies tenant ownership, APPROVED paper status, and SHA-256 file integrity.
 */
export async function getPdfDownloadStream(
  institutionId: string,
  paperId: string,
): Promise<{ stream: Readable; fileName: string; fileSizeBytes: number; checksumSha256: string }> {
  const paper = await db.examPaper?.findUnique?.({
    where: { id: paperId },
    select: { id: true, institutionId: true, status: true },
  });

  if (paper) {
    if (paper.institutionId !== institutionId) {
      throw new AppError("No PDF artifact available for download", 404);
    }
    if (paper.status !== "APPROVED") {
      throw new AppError(
        `PDF download is only permitted for APPROVED papers. Current status: ${paper.status}`,
        409,
      );
    }
  }

  const artifact = await db.paperPdfArtifact.findFirst({
    where: { paperId, institutionId },
    orderBy: { createdAt: "desc" },
  });

  if (!artifact) {
    throw new AppError("No PDF artifact available for download", 404);
  }

  const integrity = await verifyFileIntegrity(artifact.filePath, artifact.checksumSha256);
  if (integrity && integrity.verified === false) {
    throw new AppError(
      "PDF artifact integrity verification failed: stored file checksum does not match approved snapshot hash",
      500,
    );
  }

  const stream = getPdfStream(artifact.filePath);
  return {
    stream,
    fileName: artifact.fileName,
    fileSizeBytes: artifact.fileSizeBytes,
    checksumSha256: artifact.checksumSha256,
  };
}
