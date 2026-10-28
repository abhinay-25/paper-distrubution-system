/**
 * Unit tests for Step 7 AI-Powered Question Generation API & Service.
 *
 * Covers:
 *  - POST /api/v1/generation-jobs (create & run job)
 *  - GET /api/v1/generation-jobs (list jobs)
 *  - GET /api/v1/generation-jobs/:jobId (get job)
 *  - GET /api/v1/generation-jobs/:jobId/questions (list candidates)
 *  - PATCH /api/v1/generation-jobs/:jobId/questions/:questionId/review (faculty review / promote)
 *  - Multi-tenant isolation and input validation
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

const { mockPrisma, mockGenerateQuestions } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    subject: {
      findFirst: vi.fn(),
    },
    topic: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    questionGenerationJob: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      count: vi.fn(),
    },
    generatedQuestion: {
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    question: {
      create: vi.fn(),
    },
    questionRevision: {
      create: vi.fn(),
    },
    questionTopicMap: {
      createMany: vi.fn(),
    },
  },
  mockGenerateQuestions: vi.fn(),
}));

vi.mock("../lib/prisma.js", () => ({
  db: mockPrisma,
  closePrisma: vi.fn(),
}));

vi.mock("../services/aiClient.js", () => ({
  aiClient: {
    generateQuestions: (...args: unknown[]) => mockGenerateQuestions(...args),
  },
  AIClient: vi.fn(),
  AIClientError: class AIClientError extends Error {
    public readonly statusCode: number;
    constructor(
      message: string,
      public code = "AI_ERROR",
      public status = 502,
      public retryable = false,
    ) {
      super(message);
      this.statusCode = status;
    }
  },
}));

import { createApp } from "../app.js";

const app = createApp();

const INSTITUTION_ID = "a0000000-0000-4000-8000-000000000001";
const SUBJECT_ID = "a0000000-0000-4000-8000-000000000002";
const TOPIC_ID = "a0000000-0000-4000-8000-000000000003";
const JOB_ID = "a0000000-0000-4000-8000-000000000004";
const GEN_QUESTION_ID = "a0000000-0000-4000-8000-000000000005";
const NEW_QUESTION_ID = "a0000000-0000-4000-8000-000000000006";
const USER_ID = "a0000000-0000-4000-8000-000000000007";

const AUTH_HEADERS = {
  "x-institution-id": INSTITUTION_ID,
  "x-user-id": USER_ID,
};

const mockSubjectRow = {
  id: SUBJECT_ID,
  institutionId: INSTITUTION_ID,
  name: "Computer Networks",
  code: "CS401",
  status: "ACTIVE",
};

const mockJobRow = {
  id: JOB_ID,
  institutionId: INSTITUTION_ID,
  subjectId: SUBJECT_ID,
  topicId: TOPIC_ID,
  requestedBy: USER_ID,
  questionType: "MULTIPLE_CHOICE",
  difficulty: "MEDIUM",
  count: 2,
  language: "en",
  contextHint: "Focus on sliding window",
  status: "COMPLETED",
  errorMessage: null,
  aiProvider: "gemini",
  aiModel: "gemini-3.8-flash",
  durationMs: 450,
  createdAt: new Date(),
  updatedAt: new Date(),
  subject: { id: SUBJECT_ID, name: "Computer Networks", code: "CS401" },
  _count: { generatedQuestions: 2 },
};

const mockGeneratedQuestionRow = {
  id: GEN_QUESTION_ID,
  jobId: JOB_ID,
  questionText: "What is the function of ARP in IPv4?",
  questionType: "MULTIPLE_CHOICE",
  suggestedAnswer: "Resolves IP addresses to MAC addresses.",
  explanation: "Network layer to data link layer address mapping.",
  difficulty: "EASY",
  bloomsLevel: "remember",
  subjectTags: ["networking", "arp"],
  status: "PENDING",
  reviewedAt: null,
  reviewedBy: null,
  reviewNotes: null,
  promotedQuestionId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("Step 7 — AI Question Generation API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/v1/generation-jobs", () => {
    it("successfully creates and executes a question generation job", async () => {
      mockPrisma.subject.findFirst.mockResolvedValue(mockSubjectRow);
      mockPrisma.topic.findFirst.mockResolvedValue({ id: TOPIC_ID, name: "Data Link Layer" });
      mockPrisma.questionGenerationJob.create.mockResolvedValue(mockJobRow);
      mockPrisma.questionGenerationJob.update.mockResolvedValue(mockJobRow);
      mockPrisma.generatedQuestion.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.questionGenerationJob.findUniqueOrThrow.mockResolvedValue(mockJobRow);

      mockGenerateQuestions.mockResolvedValue({
        contractVersion: "v1",
        requestId: "req-123",
        operation: "generate_questions",
        result: {
          questions: [
            {
              questionText: "What is ARP?",
              suggestedAnswer: "Address Resolution Protocol",
              explanation: "Maps IP to MAC",
              difficulty: "EASY",
              bloomsLevel: "remember",
              subjectTags: ["arp"],
            },
            {
              questionText: "Explain Stop and Wait protocol.",
              suggestedAnswer: "Sender transmits one frame and waits for ACK.",
              difficulty: "MEDIUM",
              bloomsLevel: "understand",
              subjectTags: ["flow-control"],
            },
          ],
          totalRequested: 2,
          totalGenerated: 2,
        },
        provider: { name: "gemini", model: "gemini-3.8-flash" },
        durationMs: 450,
      });

      const res = await request(app)
        .post("/api/v1/generation-jobs")
        .set(AUTH_HEADERS)
        .send({
          subjectId: SUBJECT_ID,
          topicId: TOPIC_ID,
          questionType: "MULTIPLE_CHOICE",
          difficulty: "MEDIUM",
          count: 2,
          contextHint: "Focus on sliding window",
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(JOB_ID);
      expect(mockGenerateQuestions).toHaveBeenCalledTimes(1);
      expect(mockPrisma.generatedQuestion.createMany).toHaveBeenCalledTimes(1);
    });

    it("rejects request if count is out of bounds (> 20)", async () => {
      const res = await request(app)
        .post("/api/v1/generation-jobs")
        .set(AUTH_HEADERS)
        .send({
          subjectId: SUBJECT_ID,
          questionType: "MULTIPLE_CHOICE",
          count: 50,
        });

      expect(res.status).toBe(400);
      expect(mockGenerateQuestions).not.toHaveBeenCalled();
    });

    it("rejects request if subject does not belong to institution", async () => {
      mockPrisma.subject.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/v1/generation-jobs")
        .set(AUTH_HEADERS)
        .send({
          subjectId: SUBJECT_ID,
          questionType: "MULTIPLE_CHOICE",
          count: 3,
        });

      expect(res.status).toBe(404);
      expect(mockGenerateQuestions).not.toHaveBeenCalled();
    });

    it("returns 504 and marks job FAILED without duplicate calls when AI generation times out", async () => {
      const { AIClientError } = await import("../services/aiClient.js");
      mockPrisma.subject.findFirst.mockResolvedValue(mockSubjectRow);
      mockPrisma.questionGenerationJob.create.mockResolvedValue({ ...mockJobRow, status: "PENDING" });
      mockPrisma.questionGenerationJob.update.mockResolvedValue({ ...mockJobRow, status: "FAILED" });

      mockGenerateQuestions.mockRejectedValueOnce(
        new AIClientError("AI service request timed out", "AI_CLIENT_TIMEOUT", 504, true),
      );

      const res = await request(app)
        .post("/api/v1/generation-jobs")
        .set(AUTH_HEADERS)
        .send({
          subjectId: SUBJECT_ID,
          questionType: "MULTIPLE_CHOICE",
          count: 2,
        });

      expect(res.status).toBe(504);
      expect(res.body.error).toBe("AI service request timed out");
      expect(mockGenerateQuestions).toHaveBeenCalledTimes(1);
      expect(mockPrisma.generatedQuestion.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.questionGenerationJob.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID },
          data: expect.objectContaining({
            status: "FAILED",
            errorMessage: "AI service request timed out",
          }),
        }),
      );
    });

    it("translates Python AI service errors (e.g. 502 PROVIDER_INVALID_OUTPUT) cleanly", async () => {
      const { AIClientError } = await import("../services/aiClient.js");
      mockPrisma.subject.findFirst.mockResolvedValue(mockSubjectRow);
      mockPrisma.questionGenerationJob.create.mockResolvedValue({ ...mockJobRow, status: "PENDING" });
      mockPrisma.questionGenerationJob.update.mockResolvedValue({ ...mockJobRow, status: "FAILED" });

      mockGenerateQuestions.mockRejectedValueOnce(
        new AIClientError(
          "The AI provider returned output that did not match the expected structure.",
          "PROVIDER_INVALID_OUTPUT",
          502,
          false,
        ),
      );

      const res = await request(app)
        .post("/api/v1/generation-jobs")
        .set(AUTH_HEADERS)
        .send({
          subjectId: SUBJECT_ID,
          questionType: "SHORT_ANSWER",
          count: 3,
        });

      expect(res.status).toBe(502);
      expect(res.body.error).toContain("did not match the expected structure");
      expect(mockPrisma.generatedQuestion.createMany).not.toHaveBeenCalled();
    });

    it("rejects partial or incomplete question batches without persisting partial candidates", async () => {
      mockPrisma.subject.findFirst.mockResolvedValue(mockSubjectRow);
      mockPrisma.questionGenerationJob.create.mockResolvedValue({ ...mockJobRow, count: 3, status: "PENDING" });
      mockPrisma.questionGenerationJob.update.mockResolvedValue({ ...mockJobRow, status: "FAILED" });

      // Requested 3 questions, but AI response only contains 1 question (partial batch)
      mockGenerateQuestions.mockResolvedValueOnce({
        contractVersion: "v1",
        requestId: "req-partial",
        operation: "generate_questions",
        result: {
          questions: [
            {
              questionText: "Only one question returned instead of three.",
              suggestedAnswer: "Answer 1",
              difficulty: "EASY",
              bloomsLevel: "remember",
              subjectTags: ["networking"],
            },
          ],
          totalRequested: 3,
          totalGenerated: 1,
        },
        provider: { name: "gemini", model: "gemini-3.6-flash" },
        durationMs: 300,
      });

      const res = await request(app)
        .post("/api/v1/generation-jobs")
        .set(AUTH_HEADERS)
        .send({
          subjectId: SUBJECT_ID,
          questionType: "SHORT_ANSWER",
          count: 3,
        });

      expect(res.status).toBe(502);
      expect(res.body.error).toContain("incomplete or malformed question batch");
      expect(mockPrisma.generatedQuestion.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.questionGenerationJob.update).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: { id: JOB_ID },
          data: expect.objectContaining({
            status: "FAILED",
          }),
        }),
      );
    });
  });

  describe("GET /api/v1/generation-jobs", () => {
    it("returns paginated list of generation jobs for the institution", async () => {
      mockPrisma.$transaction.mockResolvedValue([1, [mockJobRow]]);
      mockPrisma.topic.findMany.mockResolvedValue([{ id: TOPIC_ID, name: "Data Link Layer", code: "T1" }]);

      const res = await request(app)
        .get("/api/v1/generation-jobs")
        .set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].id).toBe(JOB_ID);
    });
  });

  describe("GET /api/v1/generation-jobs/:jobId", () => {
    it("returns single job by ID", async () => {
      mockPrisma.questionGenerationJob.findFirst.mockResolvedValue(mockJobRow);
      mockPrisma.topic.findUnique.mockResolvedValue({ id: TOPIC_ID, name: "Data Link Layer", code: "T1" });

      const res = await request(app)
        .get(`/api/v1/generation-jobs/${JOB_ID}`)
        .set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(JOB_ID);
      expect(res.body.subject.code).toBe("CS401");
    });

    it("returns 404 if job does not exist in institution", async () => {
      mockPrisma.questionGenerationJob.findFirst.mockResolvedValue(null);

      const res = await request(app)
        .get(`/api/v1/generation-jobs/${JOB_ID}`)
        .set(AUTH_HEADERS);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/generation-jobs/:jobId/questions", () => {
    it("lists generated questions for a job", async () => {
      mockPrisma.questionGenerationJob.findFirst.mockResolvedValue({ id: JOB_ID });
      mockPrisma.generatedQuestion.findMany.mockResolvedValue([mockGeneratedQuestionRow]);

      const res = await request(app)
        .get(`/api/v1/generation-jobs/${JOB_ID}/questions`)
        .set(AUTH_HEADERS);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(GEN_QUESTION_ID);
    });
  });

  describe("PATCH /api/v1/generation-jobs/:jobId/questions/:questionId/review", () => {
    it("promotes approved question to the Question Bank", async () => {
      mockPrisma.questionGenerationJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
        questionType: "MULTIPLE_CHOICE",
      });
      mockPrisma.generatedQuestion.findFirst.mockResolvedValue(mockGeneratedQuestionRow);

      // Transaction mock implementation
      mockPrisma.$transaction.mockImplementation(async (callback: any) => {
        const tx = {
          question: {
            create: vi.fn().mockResolvedValue({ id: NEW_QUESTION_ID }),
          },
          questionRevision: {
            create: vi.fn().mockResolvedValue({ id: "rev-new-1" }),
          },
          questionTopicMap: {
            createMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
          generatedQuestion: {
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      });

      mockPrisma.topic.findMany.mockResolvedValue([{ id: TOPIC_ID }]);
      mockPrisma.generatedQuestion.findUniqueOrThrow.mockResolvedValue({
        ...mockGeneratedQuestionRow,
        status: "APPROVED",
        promotedQuestionId: NEW_QUESTION_ID,
      });

      const res = await request(app)
        .patch(`/api/v1/generation-jobs/${JOB_ID}/questions/${GEN_QUESTION_ID}/review`)
        .set(AUTH_HEADERS)
        .send({
          reviewAction: "APPROVED",
          subjectId: SUBJECT_ID,
          marks: 5,
          topicIds: [TOPIC_ID],
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("APPROVED");
      expect(res.body.promotedQuestion.id).toBe(NEW_QUESTION_ID);
    });

    it("rejects candidate question without creating question bank row", async () => {
      mockPrisma.questionGenerationJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        subjectId: SUBJECT_ID,
        topicId: TOPIC_ID,
        questionType: "MULTIPLE_CHOICE",
      });
      mockPrisma.generatedQuestion.findFirst.mockResolvedValue(mockGeneratedQuestionRow);
      mockPrisma.generatedQuestion.update.mockResolvedValue({
        ...mockGeneratedQuestionRow,
        status: "REJECTED",
        reviewNotes: "Off-topic for current syllabus",
      });

      const res = await request(app)
        .patch(`/api/v1/generation-jobs/${JOB_ID}/questions/${GEN_QUESTION_ID}/review`)
        .set(AUTH_HEADERS)
        .send({
          reviewAction: "REJECTED",
          reviewNotes: "Off-topic for current syllabus",
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("REJECTED");
      expect(mockPrisma.question.create).not.toHaveBeenCalled();
    });

    it("returns 409 conflict when re-reviewing already reviewed question", async () => {
      mockPrisma.questionGenerationJob.findFirst.mockResolvedValue({
        id: JOB_ID,
        subjectId: SUBJECT_ID,
      });
      mockPrisma.generatedQuestion.findFirst.mockResolvedValue({
        ...mockGeneratedQuestionRow,
        status: "APPROVED",
      });

      const res = await request(app)
        .patch(`/api/v1/generation-jobs/${JOB_ID}/questions/${GEN_QUESTION_ID}/review`)
        .set(AUTH_HEADERS)
        .send({
          reviewAction: "REJECTED",
        });

      expect(res.status).toBe(409);
    });
  });
});
