/**
 * Subject service — business logic for institution-scoped subject management.
 *
 * All methods require a validated institutionId. The caller (route handler)
 * is responsible for obtaining it from the tenant context middleware.
 *
 * Cross-institution access is prevented by always scoping queries to
 * institutionId. The application never trusts a raw user-supplied UUID as
 * proof of access.
 */

import { db } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import type { CreateSubjectInput, UpdateSubjectInput, ListSubjectsQuery } from "../schemas/academic.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubjectRow {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  description: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  _count?: { topics: number; questions: number };
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// List subjects
// ---------------------------------------------------------------------------

export async function listSubjects(
  institutionId: string,
  query: ListSubjectsQuery,
): Promise<PaginatedResult<SubjectRow>> {
  const { search, status, page, pageSize } = query;
  const skip = (page - 1) * pageSize;

  const where = {
    institutionId,
    ...(status && { status }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" as const } },
        { code: { contains: search, mode: "insensitive" as const } },
      ],
    }),
  };

  const [data, total] = await Promise.all([
    db.subject.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ code: "asc" }, { name: "asc" }],
      include: { _count: { select: { topics: true, questions: true } } },
    }),
    db.subject.count({ where }),
  ]);

  return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

// ---------------------------------------------------------------------------
// Get subject by id
// ---------------------------------------------------------------------------

export async function getSubject(institutionId: string, subjectId: string): Promise<SubjectRow> {
  const subject = await db.subject.findFirst({
    where: { id: subjectId, institutionId },
    include: { _count: { select: { topics: true, questions: true } } },
  });
  if (!subject) throw AppError.notFound("Subject not found");
  return subject;
}

// ---------------------------------------------------------------------------
// Create subject
// ---------------------------------------------------------------------------

export async function createSubject(institutionId: string, input: CreateSubjectInput): Promise<SubjectRow> {
  // Confirm institution exists (prevents foreign key error leaking existence).
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { id: true } });
  if (!institution) throw AppError.notFound("Institution not found");

  try {
    return await db.subject.create({
      data: { institutionId, ...input },
      include: { _count: { select: { topics: true, questions: true } } },
    });
  } catch (err: unknown) {
    if (isUniqueConstraintError(err)) {
      throw AppError.conflict(`A subject with code '${input.code}' already exists in this institution`);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Update subject (name, description, status — code is immutable after creation)
// ---------------------------------------------------------------------------

export async function updateSubject(
  institutionId: string,
  subjectId: string,
  input: UpdateSubjectInput,
): Promise<SubjectRow> {
  await getSubject(institutionId, subjectId); // ensures ownership

  return db.subject.update({
    where: { id: subjectId },
    data: input,
    include: { _count: { select: { topics: true, questions: true } } },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUniqueConstraintError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    // Prisma error code for unique constraint violation
    return e["code"] === "P2002";
  }
  return false;
}
