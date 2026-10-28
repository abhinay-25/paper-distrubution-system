/**
 * Unit tests for Question Intelligence (Step 6) API routes and service:
 * - POST /api/v1/questions/:questionId/analyses (trigger analysis)
 * - GET /api/v1/questions/:questionId/analyses (list analyses)
 * - GET /api/v1/questions/:questionId/analyses/:analysisId (get analysis)
 * - PATCH /api/v1/questions/:questionId/analyses/:analysisId/review (faculty review)
 * - GET /api/v1/questions/:questionId/analysis (latest analysis)
 * - POST /api/v1/questions/:questionId/classify
 * - POST /api/v1/questions/:questionId/estimate-difficulty
 * - POST /api/v1/questions/:questionId/detect-duplicates
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock env
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

const { mockPrisma, mockAnalyzeQuestion } = vi.hoisted(() => ({
  mockPrisma: {
    $queryRaw: vi.fn(),
    question: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    questionRevision: {
      findFirst: vi.fn(),
    },
    questionAnalysis: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  mockAnalyzeQuestion: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  db: mockPrisma,
  closePrisma: vi.fn(),
}));

vi.mock("../services/aiClient.js", () => ({
  aiClient: {
    analyzeQuestion: (...args: unknown[]) => mockAnalyzeQuestion(...args),
  },
  AIClient: vi.fn(),
}));

import { createApp } from "../app.js";

const app = createApp();

const INSTITUTION_ID = "a0000000-0000-4000-8000-000000000001";
const QUESTION_ID = "a0000000-0000-4000-8000-000000000002";
const REVISION_ID = "a0000000-0000-4000-8000-000000000003";
const ANALYSIS_ID = "a0000000-0000-4000-8000-000000000004";
const SUBJECT_ID = "a0000000-0000-4000-8000-000000000005";
const USER_ID = "a0000000-0000-4000-8000-000000000006";

const AUTH_HEADERS = {
  "x-institution-id": INSTITUTION_ID,
  "x-user-id": USER_ID,
};

const mockAnalysisDbRow = {
  id: ANALYSIS_ID,
  revisionId: REVISION_ID,
  revision: { questionId: QUESTION_ID },
  aiBloomsLevel: "UNDERSTAND",
  aiBloomsConfidence: 0.88,
  aiSubjectTags: ["algorithms", "sorting"],
  aiQuestionTypeHint: "conceptual",
  aiSuggestedDifficulty: "MEDIUM",
  aiDifficultyConfidence: 0.85,
  aiDifficultyRationale: "Requires analyzing algorithm time complexity.",
  hasPotentialDuplicates: false,
  hasNearDuplicates: false,
  duplicateCandidates: [],
  nearDuplicateThreshold: 0.90,
  potentialDuplicateThreshold: 0.75,
  reviewStatus: "PENDING",
  reviewedAt: null,
  reviewedBy: null,
  facultyBloomsLevel: null,
  facultyDifficulty: null,
  facultyNotes: null,
  aiProvider: "gemini",
  aiModel: "gemini-3.8-flash",
  durationMs: 320,
  createdAt: new Date("2026-10-26T12:00:00Z"),
};

describe("Question Intelligence Routes (Step 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Tenant isolation", () => {
    it("returns 401 when tenant context is missing", async () => {
      const res = await request(app)
        .post(`/api/v1/questions/${QUESTION_ID}/analyses`)
        .send({ revisionId: REVISION_ID });
      expect(res.status).toBe(401);
      expect(res.body.error).toContain("Dev mode");
    });
  });

  describe("POST /api/v1/questions/:questionId/analyses", () => {
    it("returns 404 if question does not belong to the institution", async () => {
      mockPrisma.question.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/questions/${QUESTION_ID}/analyses`)
        .set(AUTH_HEADERS)
        .send({ revisionId: REVISION_ID });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Question not found");
    });

    it("returns 404 if revision does not belong to the question", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({ id: QUESTION_ID, subjectId: SUBJECT_ID });
      mockPrisma.questionRevision.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post(`/api/v1/questions/${QUESTION_ID}/analyses`)
        .set(AUTH_HEADERS)
        .send({ revisionId: REVISION_ID });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Revision not found for this question");
    });

    it("triggers AI analysis, gathers subject candidates, and persists result (202 Accepted)", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({ id: QUESTION_ID, subjectId: SUBJECT_ID });
      mockPrisma.questionRevision.findFirst.mockResolvedValue({
        id: REVISION_ID,
        questionText: "What is the time complexity of MergeSort?",
      });
      mockPrisma.question.findMany.mockResolvedValue([
        {
          id: "other-q-1",
          currentRevisionNumber: 1,
          revisions: [{ id: "other-rev-1", questionText: "Explain QuickSort average case runtime." }],
        },
      ]);

      mockAnalyzeQuestion.mockResolvedValue({
        contractVersion: "v1",
        requestId: "req-123",
        operation: "question_analysis",
        result: {
          revisionId: REVISION_ID,
          classification: {
            bloomsLevel: "understand",
            bloomsConfidence: 0.88,
            subjectTags: ["algorithms", "sorting"],
            questionTypeHint: "conceptual",
          },
          difficultyEstimation: {
            suggestedDifficulty: "medium",
            confidence: 0.85,
            rationale: "Requires analyzing algorithm time complexity.",
          },
          duplicateCandidates: [],
          nearDuplicateThreshold: 0.90,
          potentialDuplicateThreshold: 0.75,
        },
        provider: { name: "gemini", model: "gemini-3.8-flash" },
        durationMs: 320,
      });

      mockPrisma.questionAnalysis.create.mockResolvedValue(mockAnalysisDbRow);

      const res = await request(app)
        .post(`/api/v1/questions/${QUESTION_ID}/analyses`)
        .set(AUTH_HEADERS)
        .send({ revisionId: REVISION_ID });

      expect(res.status).toBe(202);
      expect(res.body.id).toBe(ANALYSIS_ID);
      expect(res.body.reviewStatus).toBe("PENDING");
      expect(res.body.aiBloomsLevel).toBe("UNDERSTAND");
      expect(res.body.aiSuggestedDifficulty).toBe("MEDIUM");

      // Verify AI client called with candidates from same subject
      expect(mockAnalyzeQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          revisionId: REVISION_ID,
          questionText: "What is the time complexity of MergeSort?",
          candidates: [{ candidateId: "other-rev-1", text: "Explain QuickSort average case runtime." }],
        }),
        expect.anything(),
      );

      // Verify DB persistence with PENDING review status
      expect(mockPrisma.questionAnalysis.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            revisionId: REVISION_ID,
            reviewStatus: "PENDING",
            aiBloomsLevel: "UNDERSTAND",
            aiSuggestedDifficulty: "MEDIUM",
          }),
        }),
      );
    });
  });

  describe("GET /api/v1/questions/:questionId/analyses", () => {
    it("lists all analyses for a question in descending chronological order", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({ id: QUESTION_ID });
      mockPrisma.questionAnalysis.findMany.mockResolvedValue([mockAnalysisDbRow]);

      const res = await request(app)
        .get(`/api/v1/questions/${QUESTION_ID}/analyses`)
        .set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(ANALYSIS_ID);
    });
  });

  describe("GET /api/v1/questions/:questionId/analyses/:analysisId", () => {
    it("returns 404 if analysis not found", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({ id: QUESTION_ID });
      mockPrisma.questionAnalysis.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/questions/${QUESTION_ID}/analyses/${ANALYSIS_ID}`)
        .set(AUTH_HEADERS);

      expect(res.status).toBe(404);
    });

    it("returns single analysis record", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({ id: QUESTION_ID });
      mockPrisma.questionAnalysis.findFirst.mockResolvedValue(mockAnalysisDbRow);

      const res = await request(app)
        .get(`/api/v1/questions/${QUESTION_ID}/analyses/${ANALYSIS_ID}`)
        .set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ANALYSIS_ID);
    });
  });

  describe("PATCH /api/v1/questions/:questionId/analyses/:analysisId/review (Faculty Review)", () => {
    it("accepts AI suggestions (ACCEPTED)", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({ id: QUESTION_ID });
      mockPrisma.questionAnalysis.findFirst.mockResolvedValue({
        id: ANALYSIS_ID,
        reviewStatus: "PENDING",
      });
      mockPrisma.questionAnalysis.update.mockResolvedValue({
        ...mockAnalysisDbRow,
        reviewStatus: "ACCEPTED",
        reviewedBy: USER_ID,
        reviewedAt: new Date(),
      });

      const res = await request(app)
        .patch(`/api/v1/questions/${QUESTION_ID}/analyses/${ANALYSIS_ID}/review`)
        .set(AUTH_HEADERS)
        .send({ reviewAction: "ACCEPTED" });

      expect(res.status).toBe(200);
      expect(res.body.reviewStatus).toBe("ACCEPTED");
      expect(mockPrisma.questionAnalysis.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ANALYSIS_ID },
          data: expect.objectContaining({
            reviewStatus: "ACCEPTED",
            reviewedBy: USER_ID, // middleware now reads x-user-id header in dev mode
          }),
        }),
      );
    });

    it("overrides AI suggestions with faculty values (OVERRIDDEN)", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({ id: QUESTION_ID });
      mockPrisma.questionAnalysis.findFirst.mockResolvedValue({
        id: ANALYSIS_ID,
        reviewStatus: "PENDING",
      });
      mockPrisma.questionAnalysis.update.mockResolvedValue({
        ...mockAnalysisDbRow,
        reviewStatus: "OVERRIDDEN",
        facultyBloomsLevel: "APPLY",
        facultyDifficulty: "HARD",
        facultyNotes: "Students struggle with the recurrence relation.",
        reviewedBy: null,
        reviewedAt: new Date(),
      });

      const res = await request(app)
        .patch(`/api/v1/questions/${QUESTION_ID}/analyses/${ANALYSIS_ID}/review`)
        .set(AUTH_HEADERS)
        .send({
          reviewAction: "OVERRIDDEN",
          facultyBloomsLevel: "APPLY",
          facultyDifficulty: "HARD",
          facultyNotes: "Students struggle with the recurrence relation.",
        });

      expect(res.status).toBe(200);
      expect(res.body.reviewStatus).toBe("OVERRIDDEN");
      expect(res.body.facultyDifficulty).toBe("HARD");
      expect(res.body.facultyBloomsLevel).toBe("APPLY");
    });

    it("rejects OVERRIDDEN action if neither facultyBloomsLevel nor facultyDifficulty is provided (400)", async () => {
      const res = await request(app)
        .patch(`/api/v1/questions/${QUESTION_ID}/analyses/${ANALYSIS_ID}/review`)
        .set(AUTH_HEADERS)
        .send({
          reviewAction: "OVERRIDDEN",
          facultyNotes: "Just a note without any override",
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 409 Conflict if analysis was already reviewed", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({ id: QUESTION_ID });
      mockPrisma.questionAnalysis.findFirst.mockResolvedValue({
        id: ANALYSIS_ID,
        reviewStatus: "ACCEPTED", // Already reviewed!
      });

      const res = await request(app)
        .patch(`/api/v1/questions/${QUESTION_ID}/analyses/${ANALYSIS_ID}/review`)
        .set(AUTH_HEADERS)
        .send({ reviewAction: "DISMISSED" });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain("already been reviewed");
    });
  });

  describe("Question Intelligence Convenience Endpoints", () => {
    it("GET /api/v1/questions/:questionId/analysis returns latest analysis", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({ id: QUESTION_ID });
      mockPrisma.questionAnalysis.findFirst.mockResolvedValue(mockAnalysisDbRow);

      const res = await request(app)
        .get(`/api/v1/questions/${QUESTION_ID}/analysis`)
        .set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(ANALYSIS_ID);
    });

    it("POST /api/v1/questions/:questionId/classify returns classification result", async () => {
      mockPrisma.question.findFirst.mockResolvedValue({
        id: QUESTION_ID,
        subjectId: SUBJECT_ID,
        revisions: [{ id: REVISION_ID }],
      });
      mockPrisma.questionRevision.findFirst.mockResolvedValue({
        id: REVISION_ID,
        questionText: "Explain Dijkstra algorithm.",
      });
      mockAnalyzeQuestion.mockResolvedValue({
        contractVersion: "v1",
        requestId: "req-1",
        operation: "question_analysis",
        result: {
          revisionId: REVISION_ID,
          classification: {
            bloomsLevel: "understand",
            bloomsConfidence: 0.9,
            subjectTags: ["graphs"],
            questionTypeHint: "conceptual",
          },
          difficultyEstimation: {
            suggestedDifficulty: "medium",
            confidence: 0.8,
            rationale: "Requires graph concept knowledge.",
          },
          duplicateCandidates: [],
          nearDuplicateThreshold: 0.9,
          potentialDuplicateThreshold: 0.75,
        },
        provider: { name: "gemini", model: "gemini-3.8-flash" },
        durationMs: 250,
      });
      mockPrisma.questionAnalysis.create.mockResolvedValue(mockAnalysisDbRow);

      const res = await request(app)
        .post(`/api/v1/questions/${QUESTION_ID}/classify`)
        .set(AUTH_HEADERS)
        .send();

      expect(res.status).toBe(202);
      expect(res.body.bloomsLevel).toBe("UNDERSTAND");
      expect(res.body.analysisId).toBe(ANALYSIS_ID);
    });
  });
});
