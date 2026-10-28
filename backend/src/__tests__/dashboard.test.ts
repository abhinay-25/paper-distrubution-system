/**
 * Unit tests for Step 4 Institution Dashboard Summary API (/api/v1/dashboard).
 *
 * Covers:
 *  - Empty institution state (zero counts, null institution if unseeded)
 *  - Accurate status aggregation across Subjects, Questions, AI Generation Jobs,
 *    Examinations, Exam Papers, and Approval Submissions
 *  - Tenant isolation and authentication header enforcement
 *  - Strict query validation
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    CORS_ORIGIN: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5432/pds_test",
    AI_SERVICE_URL: "http://127.0.0.1:8000",
    AI_SERVICE_TOKEN: "mock_test_token_at_least_32_characters_long",
    AI_SERVICE_TIMEOUT_MS: 35000,
    AI_GENERATION_TIMEOUT_MS: 70000,
  },
}));

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    institution: {
      findUnique: vi.fn(),
    },
    subject: {
      groupBy: vi.fn(),
    },
    question: {
      groupBy: vi.fn(),
    },
    questionGenerationJob: {
      groupBy: vi.fn(),
    },
    generatedQuestion: {
      count: vi.fn(),
    },
    examConfiguration: {
      groupBy: vi.fn(),
    },
    examPaper: {
      groupBy: vi.fn(),
    },
    paperSubmission: {
      groupBy: vi.fn(),
    },
    sourceDocument: {
      groupBy: vi.fn(),
    },
    documentChunk: {
      count: vi.fn(),
    },
  },
}));

vi.mock("../lib/prisma.js", () => ({
  db: mockPrisma,
  closePrisma: vi.fn(),
}));

import { createApp } from "../app.js";

const app = createApp();

const INSTITUTION_A = "a0000000-0000-4000-8000-000000000001";
const INSTITUTION_B = "b0000000-0000-4000-8000-000000000002";

describe("Step 4 — GET /api/v1/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when x-institution-id header is missing or invalid", async () => {
    const resMissing = await request(app).get("/api/v1/dashboard");
    expect(resMissing.status).toBe(401);

    const resInvalid = await request(app)
      .get("/api/v1/dashboard")
      .set("x-institution-id", "not-a-uuid");
    expect(resInvalid.status).toBe(401);
  });

  it("returns zero counts and null institution for an empty tenant", async () => {
    mockPrisma.institution.findUnique.mockResolvedValue(null);
    mockPrisma.subject.groupBy.mockResolvedValue([]);
    mockPrisma.question.groupBy.mockResolvedValue([]);
    mockPrisma.questionGenerationJob.groupBy.mockResolvedValue([]);
    mockPrisma.generatedQuestion.count.mockResolvedValue(0);
    mockPrisma.examConfiguration.groupBy.mockResolvedValue([]);
    mockPrisma.examPaper.groupBy.mockResolvedValue([]);
    mockPrisma.paperSubmission.groupBy.mockResolvedValue([]);
    mockPrisma.sourceDocument.groupBy.mockResolvedValue([]);
    mockPrisma.documentChunk.count.mockResolvedValue(0);

    const res = await request(app)
      .get("/api/v1/dashboard")
      .set("x-institution-id", INSTITUTION_B);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      institution: null,
      subjects: { total: 0, active: 0, archived: 0 },
      questions: { total: 0, active: 0, draft: 0, retired: 0 },
      generationJobs: {
        total: 0,
        completed: 0,
        running: 0,
        pending: 0,
        failed: 0,
        pendingCandidateReviews: 0,
      },
      examinations: { total: 0, active: 0, inactive: 0 },
      papers: { total: 0, draft: 0, submitted: 0, approved: 0, rejected: 0 },
      submissions: {
        total: 0,
        pending: 0,
        approved: 0,
        changesRequested: 0,
        rejected: 0,
      },
      sourceDocuments: {
        total: 0,
        indexed: 0,
        processing: 0,
        failed: 0,
        totalChunks: 0,
      },
    });

    // Verify all groupBy/count queries were strictly scoped to INSTITUTION_B
    expect(mockPrisma.subject.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { institutionId: INSTITUTION_B } }),
    );
    expect(mockPrisma.question.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { institutionId: INSTITUTION_B } }),
    );
    expect(mockPrisma.examPaper.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { institutionId: INSTITUTION_B } }),
    );
    expect(mockPrisma.paperSubmission.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { institutionId: INSTITUTION_B } }),
    );
  });

  it("accurately aggregates institution-wide status counts across all modules", async () => {
    mockPrisma.institution.findUnique.mockResolvedValue({
      id: INSTITUTION_A,
      name: "Chaitanya Bharathi Institute of Technology (Autonomous)",
      slug: "cbit-autonomous",
      status: "ACTIVE",
    });
    mockPrisma.subject.groupBy.mockResolvedValue([
      { status: "ACTIVE", _count: { _all: 6 } },
      { status: "ARCHIVED", _count: { _all: 2 } },
    ]);
    mockPrisma.question.groupBy.mockResolvedValue([
      { lifecycle: "ACTIVE", _count: { _all: 42 } },
      { lifecycle: "DRAFT", _count: { _all: 8 } },
      { lifecycle: "RETIRED", _count: { _all: 3 } },
    ]);
    mockPrisma.questionGenerationJob.groupBy.mockResolvedValue([
      { status: "COMPLETED", _count: { _all: 9 } },
      { status: "FAILED", _count: { _all: 1 } },
      { status: "RUNNING", _count: { _all: 1 } },
    ]);
    mockPrisma.generatedQuestion.count.mockResolvedValue(14);
    mockPrisma.examConfiguration.groupBy.mockResolvedValue([
      { isActive: true, _count: { _all: 4 } },
      { isActive: false, _count: { _all: 1 } },
    ]);
    mockPrisma.examPaper.groupBy.mockResolvedValue([
      { status: "DRAFT", _count: { _all: 3 } },
      { status: "SUBMITTED", _count: { _all: 2 } },
      { status: "APPROVED", _count: { _all: 5 } },
      { status: "REJECTED", _count: { _all: 1 } },
    ]);
    mockPrisma.paperSubmission.groupBy.mockResolvedValue([
      { status: "PENDING", _count: { _all: 2 } },
      { status: "APPROVED", _count: { _all: 5 } },
      { status: "CHANGES_REQUESTED", _count: { _all: 1 } },
      { status: "REJECTED", _count: { _all: 1 } },
    ]);
    mockPrisma.sourceDocument.groupBy.mockResolvedValue([
      { status: "INDEXED", _count: { _all: 7 } },
      { status: "PROCESSING", _count: { _all: 1 } },
      { status: "FAILED", _count: { _all: 1 } },
    ]);
    mockPrisma.documentChunk.count.mockResolvedValue(48);

    const res = await request(app)
      .get("/api/v1/dashboard")
      .set("x-institution-id", INSTITUTION_A);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      institution: {
        id: INSTITUTION_A,
        name: "Chaitanya Bharathi Institute of Technology (Autonomous)",
        slug: "cbit-autonomous",
        status: "ACTIVE",
      },
      subjects: { total: 8, active: 6, archived: 2 },
      questions: { total: 53, active: 42, draft: 8, retired: 3 },
      generationJobs: {
        total: 11,
        completed: 9,
        running: 1,
        pending: 0,
        failed: 1,
        pendingCandidateReviews: 14,
      },
      examinations: { total: 5, active: 4, inactive: 1 },
      papers: { total: 11, draft: 3, submitted: 2, approved: 5, rejected: 1 },
      submissions: {
        total: 9,
        pending: 2,
        approved: 5,
        changesRequested: 1,
        rejected: 1,
      },
      sourceDocuments: {
        total: 9,
        indexed: 7,
        processing: 1,
        failed: 1,
        totalChunks: 48,
      },
    });
  });

  it("rejects unexpected query parameters with 400", async () => {
    const res = await request(app)
      .get("/api/v1/dashboard?unknownParam=123")
      .set("x-institution-id", INSTITUTION_A);
    expect(res.status).toBe(400);
  });
});

