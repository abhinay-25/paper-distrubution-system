/**
 * Unit tests for the academic API routes.
 *
 * All database operations are mocked via vi.mock so no real DB is needed.
 * Integration tests (requiring Docker) are noted separately.
 *
 * Coverage:
 *   - Subject CRUD (valid, invalid, duplicate code, 404)
 *   - Topic CRUD (valid, invalid parent, 404)
 *   - Question creation and update (valid, invalid marks, type, concurrency conflict)
 *   - Question list with filters
 *   - Revision list and get
 *   - Tenant context enforcement (missing header → 401)
 *   - Error responses do not disclose DB internals
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// --- Mock env so process.exit is never called ---
vi.mock("../config/env.js", () => ({
  env: {
    NODE_ENV: "test",
    PORT: 4000,
    CORS_ORIGIN: "http://localhost:5173",
    DATABASE_URL: "postgresql://test:test@localhost:5432/pds_test",
    AI_SERVICE_URL: "http://127.0.0.1:8000",
    AI_SERVICE_TOKEN: "dev_internal_service_secret_token_at_least_32_chars_long_for_security",
  },
}));

// --- Mock Prisma singleton ---
vi.mock("../lib/prisma.js", () => ({
  db: { $queryRaw: vi.fn() },
  closePrisma: vi.fn(),
}));

// --- Mock services ---
vi.mock("../services/subjectService.js", () => ({
  listSubjects: vi.fn(),
  getSubject: vi.fn(),
  createSubject: vi.fn(),
  updateSubject: vi.fn(),
}));

vi.mock("../services/topicService.js", () => ({
  listTopics: vi.fn(),
  getTopic: vi.fn(),
  createTopic: vi.fn(),
  updateTopic: vi.fn(),
}));

vi.mock("../services/questionService.js", () => ({
  listQuestions: vi.fn(),
  getQuestion: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  listRevisions: vi.fn(),
  getRevision: vi.fn(),
}));

import { createApp } from "../app.js";
import * as subjectService from "../services/subjectService.js";
import * as topicService from "../services/topicService.js";
import * as questionService from "../services/questionService.js";
import { AppError } from "../middleware/errorHandler.js";

const app = createApp();
const INSTITUTION_ID = "a0000000-0000-4000-8000-000000000001";
const SUBJECT_ID = "a0000000-0000-4000-8000-000000000002";
const TOPIC_ID = "a0000000-0000-4000-8000-000000000003";
const QUESTION_ID = "a0000000-0000-4000-8000-000000000004";
const REVISION_ID = "a0000000-0000-4000-8000-000000000005";

const withTenant = (req: request.Test) => req.set("x-institution-id", INSTITUTION_ID);

const mockSubject = {
  id: SUBJECT_ID,
  institutionId: INSTITUTION_ID,
  name: "Computer Science",
  code: "CS101",
  description: null,
  status: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { topics: 0, questions: 0 },
};

const mockTopic = {
  id: TOPIC_ID,
  institutionId: INSTITUTION_ID,
  subjectId: SUBJECT_ID,
  name: "Data Structures",
  code: "U1",
  description: null,
  sequenceOrder: 1,
  status: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRevision = {
  id: REVISION_ID,
  questionId: QUESTION_ID,
  revisionNumber: 1,
  questionText: "What is a stack?",
  questionType: "SHORT_ANSWER",
  marks: "5.00",
  language: "en",
  difficulty: "EASY",
  explanation: null,
  authorId: null,
  createdAt: new Date(),
  topics: [{ id: TOPIC_ID, name: "Data Structures", code: "U1" }],
};

const mockQuestion = {
  id: QUESTION_ID,
  institutionId: INSTITUTION_ID,
  subjectId: SUBJECT_ID,
  lifecycle: "DRAFT",
  currentRevisionNumber: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  subject: { id: SUBJECT_ID, name: "Computer Science", code: "CS101" },
  currentRevision: mockRevision,
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ===========================================================================
// TENANT CONTEXT
// ===========================================================================

describe("Tenant context enforcement", () => {
  it("returns 401 when X-Institution-Id header is missing", async () => {
    const res = await request(app).get("/api/v1/subjects");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("x-institution-id");
  });

  it("returns 401 when X-Institution-Id is not a valid UUID", async () => {
    const res = await request(app)
      .get("/api/v1/subjects")
      .set("x-institution-id", "not-a-uuid");
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// SUBJECTS
// ===========================================================================

describe("GET /api/v1/subjects", () => {
  it("returns paginated subject list", async () => {
    vi.mocked(subjectService.listSubjects).mockResolvedValue({
      data: [mockSubject],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    const res = await withTenant(request(app).get("/api/v1/subjects"));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].code).toBe("CS101");
  });

  it("rejects pageSize > 100", async () => {
    const res = await withTenant(request(app).get("/api/v1/subjects?pageSize=101"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/subjects", () => {
  it("creates a subject and returns 201", async () => {
    vi.mocked(subjectService.createSubject).mockResolvedValue(mockSubject);
    const res = await withTenant(
      request(app).post("/api/v1/subjects").send({ name: "Computer Science", code: "CS101" }),
    );
    expect(res.status).toBe(201);
    expect(res.body.code).toBe("CS101");
  });

  it("returns 400 when name is missing", async () => {
    const res = await withTenant(request(app).post("/api/v1/subjects").send({ code: "CS101" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("returns 400 when code contains invalid characters", async () => {
    const res = await withTenant(
      request(app).post("/api/v1/subjects").send({ name: "CS", code: "CS 101" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 409 when subject code is duplicate", async () => {
    vi.mocked(subjectService.createSubject).mockRejectedValue(
      AppError.conflict("A subject with code 'CS101' already exists"),
    );
    const res = await withTenant(
      request(app).post("/api/v1/subjects").send({ name: "CS", code: "CS101" }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 404 when institution does not exist", async () => {
    vi.mocked(subjectService.createSubject).mockRejectedValue(AppError.notFound("Institution not found"));
    const res = await withTenant(
      request(app).post("/api/v1/subjects").send({ name: "CS", code: "CS101" }),
    );
    expect(res.status).toBe(404);
  });
});

describe("GET /api/v1/subjects/:subjectId", () => {
  it("returns subject when found", async () => {
    vi.mocked(subjectService.getSubject).mockResolvedValue(mockSubject);
    const res = await withTenant(request(app).get(`/api/v1/subjects/${SUBJECT_ID}`));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(SUBJECT_ID);
  });

  it("returns 404 when subject not found", async () => {
    vi.mocked(subjectService.getSubject).mockRejectedValue(AppError.notFound("Subject not found"));
    const res = await withTenant(request(app).get(`/api/v1/subjects/${SUBJECT_ID}`));
    expect(res.status).toBe(404);
    // Must not reveal DB internals
    expect(res.body.error).not.toContain("prisma");
    expect(res.body.error).not.toContain("SQL");
  });

  it("returns 400 for non-UUID subjectId", async () => {
    const res = await withTenant(request(app).get("/api/v1/subjects/not-a-uuid"));
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/subjects/:subjectId", () => {
  it("updates a subject", async () => {
    vi.mocked(subjectService.updateSubject).mockResolvedValue({
      ...mockSubject,
      name: "Advanced CS",
    });
    const res = await withTenant(
      request(app).patch(`/api/v1/subjects/${SUBJECT_ID}`).send({ name: "Advanced CS" }),
    );
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Advanced CS");
  });

  it("returns 400 when body is empty", async () => {
    const res = await withTenant(
      request(app).patch(`/api/v1/subjects/${SUBJECT_ID}`).send({}),
    );
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// TOPICS
// ===========================================================================

describe("GET /api/v1/subjects/:subjectId/topics", () => {
  it("returns topic list", async () => {
    vi.mocked(topicService.listTopics).mockResolvedValue([mockTopic]);
    const res = await withTenant(request(app).get(`/api/v1/subjects/${SUBJECT_ID}/topics`));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe("POST /api/v1/subjects/:subjectId/topics", () => {
  it("creates a topic and returns 201", async () => {
    vi.mocked(topicService.createTopic).mockResolvedValue(mockTopic);
    const res = await withTenant(
      request(app).post(`/api/v1/subjects/${SUBJECT_ID}/topics`).send({ name: "Data Structures" }),
    );
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Data Structures");
  });

  it("returns 400 when name is missing", async () => {
    const res = await withTenant(
      request(app).post(`/api/v1/subjects/${SUBJECT_ID}/topics`).send({}),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when parent subject is from another institution", async () => {
    vi.mocked(topicService.createTopic).mockRejectedValue(AppError.notFound("Subject not found"));
    const res = await withTenant(
      request(app).post(`/api/v1/subjects/${SUBJECT_ID}/topics`).send({ name: "DS" }),
    );
    expect(res.status).toBe(404);
  });
});

// ===========================================================================
// QUESTIONS
// ===========================================================================

const validCreateQuestion = {
  subjectId: SUBJECT_ID,
  questionText: "Explain the concept of recursion.",
  questionType: "LONG_ANSWER",
  marks: 10,
  language: "en",
  topicIds: [],
};

describe("POST /api/v1/questions", () => {
  it("creates a question with initial revision", async () => {
    vi.mocked(questionService.createQuestion).mockResolvedValue(mockQuestion);
    const res = await withTenant(
      request(app).post("/api/v1/questions").send(validCreateQuestion),
    );
    expect(res.status).toBe(201);
    expect(res.body.currentRevisionNumber).toBe(1);
    expect(res.body.currentRevision).toBeDefined();
  });

  it("returns 400 for marks = 0", async () => {
    const res = await withTenant(
      request(app).post("/api/v1/questions").send({ ...validCreateQuestion, marks: 0 }),
    );
    expect(res.status).toBe(400);
    expect(res.body.details?.marks).toBeDefined();
  });

  it("returns 400 for negative marks", async () => {
    const res = await withTenant(
      request(app).post("/api/v1/questions").send({ ...validCreateQuestion, marks: -5 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for marks > 999.99", async () => {
    const res = await withTenant(
      request(app).post("/api/v1/questions").send({ ...validCreateQuestion, marks: 1000 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported question type", async () => {
    const res = await withTenant(
      request(app).post("/api/v1/questions").send({ ...validCreateQuestion, questionType: "ESSAY" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid language tag", async () => {
    const res = await withTenant(
      request(app).post("/api/v1/questions").send({ ...validCreateQuestion, language: "english" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for more than 10 topicIds", async () => {
    const tooMany = Array.from({ length: 11 }, (_, i) =>
      `b0000000-0000-4000-8000-${i.toString().padStart(12, "0")}`,
    );
    const res = await withTenant(
      request(app).post("/api/v1/questions").send({ ...validCreateQuestion, topicIds: tooMany }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when topicId is not a UUID", async () => {
    const res = await withTenant(
      request(app).post("/api/v1/questions").send({ ...validCreateQuestion, topicIds: ["not-a-uuid"] }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when topics belong to another institution", async () => {
    vi.mocked(questionService.createQuestion).mockRejectedValue(
      AppError.badRequest("Topic IDs do not belong to this institution/subject"),
    );
    const res = await withTenant(
      request(app).post("/api/v1/questions").send({ ...validCreateQuestion, topicIds: [TOPIC_ID] }),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/v1/questions/:questionId", () => {
  const validUpdate = {
    ...validCreateQuestion,
    expectedRevisionNumber: 1,
  };

  it("creates a new revision on update", async () => {
    vi.mocked(questionService.updateQuestion).mockResolvedValue({
      ...mockQuestion,
      currentRevisionNumber: 2,
    });
    const res = await withTenant(
      request(app).patch(`/api/v1/questions/${QUESTION_ID}`).send(validUpdate),
    );
    expect(res.status).toBe(200);
    expect(res.body.currentRevisionNumber).toBe(2);
  });

  it("returns 409 on concurrent edit (wrong expectedRevisionNumber)", async () => {
    vi.mocked(questionService.updateQuestion).mockRejectedValue(
      AppError.conflict("Concurrent edit detected"),
    );
    const res = await withTenant(
      request(app).patch(`/api/v1/questions/${QUESTION_ID}`).send({ ...validUpdate, expectedRevisionNumber: 0 }),
    );
    expect(res.status).toBe(409);
  });

  it("returns 400 when expectedRevisionNumber is missing", async () => {
    const { expectedRevisionNumber: _, ...withoutToken } = validUpdate;
    const res = await withTenant(
      request(app).patch(`/api/v1/questions/${QUESTION_ID}`).send(withoutToken),
    );
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/questions", () => {
  it("returns paginated question list", async () => {
    vi.mocked(questionService.listQuestions).mockResolvedValue({
      data: [mockQuestion],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    const res = await withTenant(request(app).get("/api/v1/questions"));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it("accepts valid filter parameters", async () => {
    vi.mocked(questionService.listQuestions).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    const res = await withTenant(
      request(app).get(
        `/api/v1/questions?questionType=SHORT_ANSWER&difficulty=EASY&language=en&marksMin=2&marksMax=10`,
      ),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid questionType filter", async () => {
    const res = await withTenant(request(app).get("/api/v1/questions?questionType=ESSAY"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for pageSize > 100", async () => {
    const res = await withTenant(request(app).get("/api/v1/questions?pageSize=200"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/v1/questions/:questionId/revisions", () => {
  it("returns revision list", async () => {
    vi.mocked(questionService.listRevisions).mockResolvedValue([mockRevision]);
    const res = await withTenant(request(app).get(`/api/v1/questions/${QUESTION_ID}/revisions`));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].revisionNumber).toBe(1);
  });
});

describe("GET /api/v1/questions/:questionId/revisions/:revisionId", () => {
  it("returns a specific revision", async () => {
    vi.mocked(questionService.getRevision).mockResolvedValue(mockRevision);
    const res = await withTenant(
      request(app).get(`/api/v1/questions/${QUESTION_ID}/revisions/${REVISION_ID}`),
    );
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(REVISION_ID);
  });

  it("returns 404 for a revision from another question", async () => {
    vi.mocked(questionService.getRevision).mockRejectedValue(AppError.notFound("Revision not found"));
    const res = await withTenant(
      request(app).get(`/api/v1/questions/${QUESTION_ID}/revisions/${REVISION_ID}`),
    );
    expect(res.status).toBe(404);
  });
});
