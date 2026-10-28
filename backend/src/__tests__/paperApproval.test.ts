/**
 * Step 10 — Independent Paper Approval and PDF Generation Tests
 *
 * Tests cover:
 *  - Unauthorized submission (missing institution header)
 *  - Self-approval enforcement (403 when reviewer === submitter)
 *  - Cross-institution access rejection
 *  - Invalid state transitions (e.g. deciding on already-decided submission)
 *  - Mandatory rejection comments
 *  - PDF generation blocked for non-APPROVED papers
 *  - PDF hash computation and artifact metadata
 *  - PDF download route authorization
 *  - Submission snapshot records correct validation state
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Environment mock
vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    CORS_ORIGIN: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5432/pds_test",
    AI_SERVICE_URL: "http://127.0.0.1:8000",
    AI_SERVICE_TOKEN: "mock_test_token_at_least_32_characters_long",
  },
}));

// ------------------------------------------------------------------
// Hoist mocks
// ------------------------------------------------------------------

const INSTITUTION_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_INSTITUTION_ID = "b0000000-0000-4000-8000-000000000099";
const PAPER_ID = "a0000000-0000-4000-8000-000000000010";
const VERSION_ID = "a0000000-0000-4000-8000-000000000020";
const SUBMISSION_ID = "a0000000-0000-4000-8000-000000000030";
const ARTIFACT_ID = "a0000000-0000-4000-8000-000000000040";
const SUBMITTER_USER_ID = "u0000000-0000-4000-8000-000000000001"; // faculty who submitted
const REVIEWER_USER_ID = "u0000000-0000-4000-8000-000000000002"; // independent reviewer

const mockVersion = {
  id: VERSION_ID,
  paperId: PAPER_ID,
  versionNumber: 1,
  snapshotJson: {
    id: PAPER_ID,
    title: "CS301 Midterm",
    config: {
      name: "Midterm 2026",
      totalMarks: 60,
      durationMinutes: 180,
      subject: { id: "sub-1", name: "Operating Systems", code: "CS301" },
    },
    sections: [],
  },
  changeNote: "Ready for approval",
  createdAt: new Date(),
};

const mockPendingSubmission = {
  id: SUBMISSION_ID,
  institutionId: INSTITUTION_ID,
  paperId: PAPER_ID,
  paperVersionId: VERSION_ID,
  submittedBy: SUBMITTER_USER_ID,
  submitterNotes: "Ready for review",
  status: "PENDING",
  validationSnapshot: {
    valid: true,
    issues: [],
    achievableMarks: 60,
    configTotalMarks: 60,
    marksDiscrepancy: 0,
    slotCount: 10,
  },
  decidedBy: null,
  decision: null,
  reviewComments: null,
  submittedAt: new Date(),
  decidedAt: null,
  paper: { id: PAPER_ID, title: "CS301 Midterm", status: "SUBMITTED" },
  version: mockVersion,
};

const mockApprovedPaper = {
  id: PAPER_ID,
  institutionId: INSTITUTION_ID,
  title: "CS301 Midterm",
  status: "APPROVED",
  configId: "cfg-1",
  concurrencyVersion: 3,
  config: {
    id: "cfg-1",
    name: "Midterm 2026",
    totalMarks: "60.00",
    durationMinutes: 180,
    instructions: "Answer all questions",
    subject: { id: "sub-1", name: "Operating Systems", code: "CS301" },
  },
  versions: [mockVersion],
};

const mockArtifact = {
  id: ARTIFACT_ID,
  institutionId: INSTITUTION_ID,
  paperId: PAPER_ID,
  paperVersionId: VERSION_ID,
  templateId: "cbit-autonomous-v1",
  templateVersion: "1.0.0",
  rendererVersion: "1.0.0",
  fileName: `paper_${PAPER_ID}_v1.pdf`,
  filePath: `/storage/${INSTITUTION_ID}/${PAPER_ID}/paper_${PAPER_ID}_v1.pdf`,
  fileSizeBytes: 54321,
  checksumSha256: "abc123def456abc123def456abc123def456abc123def456abc123def456abc123",
  pageCount: 2,
  generatedBy: REVIEWER_USER_ID,
  createdAt: new Date(),
  version: { versionNumber: 1, createdAt: new Date() },
};

const { mockPrisma, mockRenderPdf, mockSavePdf, mockVerifyIntegrity } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn((fn: any) => fn(mockTx)),
    paperSubmission: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    examPaper: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    paperVersion: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    paperPdfArtifact: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    institution: {
      findUnique: vi.fn(),
    },
  },
  mockRenderPdf: vi.fn(),
  mockSavePdf: vi.fn(),
  mockVerifyIntegrity: vi.fn(),
}));

// Transaction mock reuses outer mockPrisma
const mockTx = {
  paperSubmission: {
    create: vi.fn(),
    update: vi.fn(),
  },
  examPaper: {
    update: vi.fn(),
  },
};

vi.mock("../lib/prisma.js", () => ({
  db: mockPrisma,
  closePrisma: vi.fn(),
}));

vi.mock("../services/pdfRendererService.js", () => ({
  renderCollegeQuestionPaperPdf: (...args: unknown[]) => mockRenderPdf(...args),
  TEMPLATE_ID: "cbit-autonomous-v1",
  TEMPLATE_VERSION: "1.0.0",
  RENDERER_VERSION: "1.0.0",
}));

vi.mock("../services/storageService.js", () => ({
  savePdfArtifact: (...args: unknown[]) => mockSavePdf(...args),
  getPdfStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
  verifyFileIntegrity: (...args: unknown[]) => mockVerifyIntegrity(...args),
}));

import { createApp } from "../app.js";

const app = createApp();

// Auth helpers
const asSubmitter = {
  "x-institution-id": INSTITUTION_ID,
  "x-user-id": SUBMITTER_USER_ID,
  "x-user-role": "EXAMINER",
};

const asReviewer = {
  "x-institution-id": INSTITUTION_ID,
  "x-user-id": REVIEWER_USER_ID,
  "x-user-role": "MODERATOR",
};

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("Step 10 — Paper Approval API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ----------------------------------------------------------------
  // Authorization
  // ----------------------------------------------------------------

  describe("Authorization guards", () => {
    it("rejects requests missing x-institution-id header (401)", async () => {
      const res = await request(app).get("/api/v1/paper-submissions");
      expect(res.status).toBe(401);
    });

    it("lists submissions with valid institution header (200)", async () => {
      mockPrisma.paperSubmission.count.mockResolvedValueOnce(0);
      mockPrisma.paperSubmission.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .get("/api/v1/paper-submissions")
        .set("x-institution-id", INSTITUTION_ID);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ data: [], total: 0 });
    });
  });

  // ----------------------------------------------------------------
  // Approval Queue Listing
  // ----------------------------------------------------------------

  describe("GET /api/v1/paper-submissions", () => {
    it("returns PENDING submissions filtered by status", async () => {
      mockPrisma.paperSubmission.count.mockResolvedValueOnce(1);
      mockPrisma.paperSubmission.findMany.mockResolvedValueOnce([mockPendingSubmission]);

      const res = await request(app)
        .get("/api/v1/paper-submissions?status=PENDING")
        .set("x-institution-id", INSTITUTION_ID);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].status).toBe("PENDING");
    });
  });

  // ----------------------------------------------------------------
  // Submission Detail
  // ----------------------------------------------------------------

  describe("GET /api/v1/paper-submissions/:submissionId", () => {
    it("returns the submission with snapshot and validation state", async () => {
      mockPrisma.paperSubmission.findUnique.mockResolvedValueOnce(mockPendingSubmission);

      const res = await request(app)
        .get(`/api/v1/paper-submissions/${SUBMISSION_ID}`)
        .set("x-institution-id", INSTITUTION_ID);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(SUBMISSION_ID);
      expect(res.body.validationSnapshot).toBeDefined();
      expect(res.body.version).toBeDefined();
    });

    it("returns 404 for submission from another institution", async () => {
      // Returns a submission whose institutionId does NOT match the header
      mockPrisma.paperSubmission.findUnique.mockResolvedValueOnce({
        ...mockPendingSubmission,
        institutionId: OTHER_INSTITUTION_ID,
      });

      const res = await request(app)
        .get(`/api/v1/paper-submissions/${SUBMISSION_ID}`)
        .set("x-institution-id", INSTITUTION_ID);

      expect(res.status).toBe(404);
    });
  });

  // ----------------------------------------------------------------
  // Approval Decision — Self-Approval
  // ----------------------------------------------------------------

  describe("POST /api/v1/paper-submissions/:submissionId/decision — self-approval", () => {
    it("rejects self-approval with 403 when reviewer is the submitter", async () => {
      // Submission whose submittedBy === the reviewer making this call
      mockPrisma.paperSubmission.findUnique.mockResolvedValueOnce({
        ...mockPendingSubmission,
        submittedBy: REVIEWER_USER_ID, // same as caller
        paper: { ...mockPendingSubmission.paper, institutionId: INSTITUTION_ID },
      });

      const res = await request(app)
        .post(`/api/v1/paper-submissions/${SUBMISSION_ID}/decision`)
        .set(asReviewer)
        .send({ decision: "APPROVED" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/self-approval/i);
    });
  });

  // ----------------------------------------------------------------
  // Approval Decision — Mandatory Comments
  // ----------------------------------------------------------------

  describe("POST /api/v1/paper-submissions/:submissionId/decision — rejection comments", () => {
    it("rejects REJECTED decision without comments (422)", async () => {
      mockPrisma.paperSubmission.findUnique.mockResolvedValueOnce({
        ...mockPendingSubmission,
        submittedBy: SUBMITTER_USER_ID, // different from reviewer
        paper: { ...mockPendingSubmission.paper, institutionId: INSTITUTION_ID },
      });

      const res = await request(app)
        .post(`/api/v1/paper-submissions/${SUBMISSION_ID}/decision`)
        .set(asReviewer)
        .send({ decision: "REJECTED", comments: "" });

      expect(res.status).toBe(422);
      expect(res.body.error).toMatch(/mandatory|required|comment|reason/i);
    });

    it("accepts REJECTED decision with a reason (200)", async () => {
      mockPrisma.paperSubmission.findUnique.mockResolvedValueOnce({
        ...mockPendingSubmission,
        submittedBy: SUBMITTER_USER_ID,
        paper: { ...mockPendingSubmission.paper, institutionId: INSTITUTION_ID },
      });
      mockTx.paperSubmission.update.mockResolvedValueOnce({
        ...mockPendingSubmission,
        status: "REJECTED",
        decidedBy: REVIEWER_USER_ID,
        reviewComments: "Marks do not add up. Section B total is wrong.",
      });
      mockTx.examPaper.update.mockResolvedValueOnce({});

      const res = await request(app)
        .post(`/api/v1/paper-submissions/${SUBMISSION_ID}/decision`)
        .set(asReviewer)
        .send({ decision: "REJECTED", comments: "Marks do not add up. Section B total is wrong." });

      expect(res.status).toBe(200);
    });
  });

  // ----------------------------------------------------------------
  // Approval Decision — Already Decided
  // ----------------------------------------------------------------

  describe("POST /api/v1/paper-submissions/:submissionId/decision — repeat decisions", () => {
    it("rejects deciding on an already-approved submission (409)", async () => {
      mockPrisma.paperSubmission.findUnique.mockResolvedValueOnce({
        ...mockPendingSubmission,
        status: "APPROVED",
        submittedBy: SUBMITTER_USER_ID,
        paper: { ...mockPendingSubmission.paper, institutionId: INSTITUTION_ID },
      });

      const res = await request(app)
        .post(`/api/v1/paper-submissions/${SUBMISSION_ID}/decision`)
        .set(asReviewer)
        .send({ decision: "APPROVED" });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already been decided/i);
    });
  });

  // ----------------------------------------------------------------
  // Role Enforcement
  // ----------------------------------------------------------------

  describe("POST /api/v1/paper-submissions/:submissionId/decision — role check", () => {
    it("rejects VIEWER role from approving (403)", async () => {
      mockPrisma.paperSubmission.findUnique.mockResolvedValueOnce({
        ...mockPendingSubmission,
        submittedBy: SUBMITTER_USER_ID,
        paper: { ...mockPendingSubmission.paper, institutionId: INSTITUTION_ID },
      });

      const res = await request(app)
        .post(`/api/v1/paper-submissions/${SUBMISSION_ID}/decision`)
        .set({
          "x-institution-id": INSTITUTION_ID,
          "x-user-id": REVIEWER_USER_ID,
          "x-user-role": "VIEWER",
        })
        .send({ decision: "APPROVED" });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/unauthorized|approver role/i);
    });
  });

  // ----------------------------------------------------------------
  // Paper Submission History
  // ----------------------------------------------------------------

  describe("GET /api/v1/exam-papers/:paperId/submissions", () => {
    it("returns all submission and decision history for a paper", async () => {
      mockPrisma.examPaper.findUnique.mockResolvedValueOnce({
        id: PAPER_ID,
        institutionId: INSTITUTION_ID,
      });
      mockPrisma.paperSubmission.findMany.mockResolvedValueOnce([
        mockPendingSubmission,
        { ...mockPendingSubmission, id: "sub-old", status: "REJECTED", decidedAt: new Date() },
      ]);

      const res = await request(app)
        .get(`/api/v1/exam-papers/${PAPER_ID}/submissions`)
        .set("x-institution-id", INSTITUTION_ID);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });
  });

  // ----------------------------------------------------------------
  // PDF Generation — State Guard
  // ----------------------------------------------------------------

  describe("POST /api/v1/exam-papers/:paperId/pdf/generate", () => {
    it("rejects PDF generation for non-APPROVED paper (400)", async () => {
      mockPrisma.examPaper.findUnique.mockResolvedValueOnce({
        id: PAPER_ID,
        institutionId: INSTITUTION_ID,
        status: "SUBMITTED", // not APPROVED
        config: { subject: { id: "s", name: "OS", code: "CS301" } },
        versions: [],
      });

      const res = await request(app)
        .post(`/api/v1/exam-papers/${PAPER_ID}/pdf/generate`)
        .set(asReviewer)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/approved/i);
    });

    it("generates PDF for an APPROVED paper and returns artifact metadata (201)", async () => {
      mockPrisma.examPaper.findUnique.mockResolvedValueOnce(mockApprovedPaper);
      mockPrisma.paperPdfArtifact.findFirst.mockResolvedValueOnce(null); // no prior artifact
      mockPrisma.institution.findUnique.mockResolvedValueOnce({
        id: INSTITUTION_ID,
        name: "CBIT",
      });

      mockRenderPdf.mockResolvedValueOnce({
        buffer: Buffer.from("PDF_CONTENT_MOCK"),
        pageCount: 2,
        checksumSha256: "abc123def456abc123def456abc123def456abc123def456abc123def456abc123",
        templateId: "cbit-autonomous-v1",
        templateVersion: "1.0.0",
        rendererVersion: "1.0.0",
      });

      mockSavePdf.mockResolvedValueOnce({
        fileName: `paper_${PAPER_ID}_v1.pdf`,
        filePath: `/storage/${INSTITUTION_ID}/${PAPER_ID}/paper_${PAPER_ID}_v1.pdf`,
        fileSizeBytes: 16,
        checksumSha256: "abc123def456abc123def456abc123def456abc123def456abc123def456abc123",
      });

      mockPrisma.paperPdfArtifact.create.mockResolvedValueOnce(mockArtifact);

      const res = await request(app)
        .post(`/api/v1/exam-papers/${PAPER_ID}/pdf/generate`)
        .set(asReviewer)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.checksumSha256).toBeDefined();
      expect(res.body.templateId).toBe("cbit-autonomous-v1");
      expect(res.body.pageCount).toBe(2);
    });

    it("returns existing artifact without regenerating when forceRegenerate is false (201)", async () => {
      mockPrisma.examPaper.findUnique.mockResolvedValueOnce(mockApprovedPaper);
      mockPrisma.paperPdfArtifact.findFirst.mockResolvedValueOnce(mockArtifact);

      const res = await request(app)
        .post(`/api/v1/exam-papers/${PAPER_ID}/pdf/generate`)
        .set(asReviewer)
        .send({ forceRegenerate: false });

      expect(res.status).toBe(201);
      expect(mockRenderPdf).not.toHaveBeenCalled(); // no re-render
      expect(res.body.id).toBe(ARTIFACT_ID);
    });
  });

  // ----------------------------------------------------------------
  // PDF Artifact Metadata & Integrity
  // ----------------------------------------------------------------

  describe("GET /api/v1/exam-papers/:paperId/pdf", () => {
    it("returns artifact metadata with integrity verification result", async () => {
      mockPrisma.examPaper.findUnique.mockResolvedValueOnce({
        id: PAPER_ID,
        institutionId: INSTITUTION_ID,
        status: "APPROVED",
      });
      mockPrisma.paperPdfArtifact.findFirst.mockResolvedValueOnce(mockArtifact);
      mockVerifyIntegrity.mockResolvedValueOnce({
        verified: true,
        actualChecksum: mockArtifact.checksumSha256,
      });

      const res = await request(app)
        .get(`/api/v1/exam-papers/${PAPER_ID}/pdf`)
        .set("x-institution-id", INSTITUTION_ID);

      expect(res.status).toBe(200);
      expect(res.body.checksumSha256).toBe(mockArtifact.checksumSha256);
      expect(res.body.integrityVerified).toBe(true);
    });

    it("returns 404 when no PDF has been generated yet", async () => {
      mockPrisma.examPaper.findUnique.mockResolvedValueOnce({
        id: PAPER_ID,
        institutionId: INSTITUTION_ID,
        status: "APPROVED",
      });
      mockPrisma.paperPdfArtifact.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/api/v1/exam-papers/${PAPER_ID}/pdf`)
        .set("x-institution-id", INSTITUTION_ID);

      expect(res.status).toBe(404);
    });
  });
});


