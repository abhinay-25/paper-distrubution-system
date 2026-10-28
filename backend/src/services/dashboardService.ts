/**
 * Institution-scoped Dashboard Summary Service — Step 4.
 *
 * Computes real, institution-wide summary counts across academic modules using
 * indexed COUNT / GROUP BY queries without loading question texts, answer keys,
 * or confidential payloads into memory.
 */

import { db } from "../lib/prisma.js";

export interface DashboardSummary {
  institution: {
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null;
  subjects: {
    total: number;
    active: number;
    archived: number;
  };
  questions: {
    total: number;
    active: number;
    draft: number;
    retired: number;
  };
  generationJobs: {
    total: number;
    completed: number;
    running: number;
    pending: number;
    failed: number;
    pendingCandidateReviews: number;
  };
  examinations: {
    total: number;
    active: number;
    inactive: number;
  };
  papers: {
    total: number;
    draft: number;
    submitted: number;
    approved: number;
    rejected: number;
  };
  submissions: {
    total: number;
    pending: number;
    approved: number;
    changesRequested: number;
    rejected: number;
  };
  sourceDocuments: {
    total: number;
    indexed: number;
    processing: number;
    failed: number;
    totalChunks: number;
  };
}

export async function getDashboardSummary(
  institutionId: string,
): Promise<DashboardSummary> {
  const [
    institution,
    subjectGroups,
    questionGroups,
    generationJobGroups,
    pendingCandidateReviews,
    examConfigGroups,
    paperGroups,
    submissionGroups,
    sourceDocGroups,
    totalChunksCount,
  ] = await Promise.all([
    db.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true, slug: true, status: true },
    }),
    db.subject.groupBy({
      by: ["status"],
      where: { institutionId },
      _count: { _all: true },
    }),
    db.question.groupBy({
      by: ["lifecycle"],
      where: { institutionId },
      _count: { _all: true },
    }),
    db.questionGenerationJob.groupBy({
      by: ["status"],
      where: { institutionId },
      _count: { _all: true },
    }),
    db.generatedQuestion.count({
      where: {
        status: "PENDING",
        job: { institutionId },
      },
    }),
    db.examConfiguration.groupBy({
      by: ["isActive"],
      where: { institutionId },
      _count: { _all: true },
    }),
    db.examPaper.groupBy({
      by: ["status"],
      where: { institutionId },
      _count: { _all: true },
    }),
    db.paperSubmission.groupBy({
      by: ["status"],
      where: { institutionId },
      _count: { _all: true },
    }),
    db.sourceDocument.groupBy({
      by: ["status"],
      where: { institutionId },
      _count: { _all: true },
    }),
    db.documentChunk.count({
      where: { institutionId },
    }),
  ]);

  const subjects = { total: 0, active: 0, archived: 0 };
  for (const row of subjectGroups) {
    const count = row._count._all;
    subjects.total += count;
    if (row.status === "ACTIVE") subjects.active += count;
    else if (row.status === "ARCHIVED") subjects.archived += count;
  }

  const questions = { total: 0, active: 0, draft: 0, retired: 0 };
  for (const row of questionGroups) {
    const count = row._count._all;
    questions.total += count;
    if (row.lifecycle === "ACTIVE") questions.active += count;
    else if (row.lifecycle === "DRAFT") questions.draft += count;
    else if (row.lifecycle === "RETIRED") questions.retired += count;
  }

  const generationJobs = {
    total: 0,
    completed: 0,
    running: 0,
    pending: 0,
    failed: 0,
    pendingCandidateReviews,
  };
  for (const row of generationJobGroups) {
    const count = row._count._all;
    generationJobs.total += count;
    if (row.status === "COMPLETED") generationJobs.completed += count;
    else if (row.status === "RUNNING") generationJobs.running += count;
    else if (row.status === "PENDING") generationJobs.pending += count;
    else if (row.status === "FAILED") generationJobs.failed += count;
  }

  const examinations = { total: 0, active: 0, inactive: 0 };
  for (const row of examConfigGroups) {
    const count = row._count._all;
    examinations.total += count;
    if (row.isActive) examinations.active += count;
    else examinations.inactive += count;
  }

  const papers = {
    total: 0,
    draft: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of paperGroups) {
    const count = row._count._all;
    papers.total += count;
    if (row.status === "DRAFT") papers.draft += count;
    else if (row.status === "SUBMITTED") papers.submitted += count;
    else if (row.status === "APPROVED") papers.approved += count;
    else if (row.status === "REJECTED") papers.rejected += count;
  }

  const submissions = {
    total: 0,
    pending: 0,
    approved: 0,
    changesRequested: 0,
    rejected: 0,
  };
  for (const row of submissionGroups) {
    const count = row._count._all;
    submissions.total += count;
    if (row.status === "PENDING") submissions.pending += count;
    else if (row.status === "APPROVED") submissions.approved += count;
    else if (row.status === "CHANGES_REQUESTED") submissions.changesRequested += count;
    else if (row.status === "REJECTED") submissions.rejected += count;
  }

  const sourceDocuments = {
    total: 0,
    indexed: 0,
    processing: 0,
    failed: 0,
    totalChunks: totalChunksCount,
  };
  for (const row of sourceDocGroups) {
    const count = row._count._all;
    sourceDocuments.total += count;
    if (row.status === "INDEXED") sourceDocuments.indexed += count;
    else if (row.status === "PROCESSING" || row.status === "UPLOADED") sourceDocuments.processing += count;
    else if (row.status === "FAILED") sourceDocuments.failed += count;
  }

  return {
    institution,
    subjects,
    questions,
    generationJobs,
    examinations,
    papers,
    submissions,
    sourceDocuments,
  };
}

