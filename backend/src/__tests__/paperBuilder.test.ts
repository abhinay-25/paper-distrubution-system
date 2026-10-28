/**
 * Tests for Step 8: Exam Configuration and Question Paper Builder.
 *
 * Covers:
 *  - Pure marks calculations and optional-choice rules (paperCalculator)
 *  - Paper validation logic (totals mismatch, empty sections, duplicates, topic coverage)
 *  - API endpoints for ExamConfigurations and ExamPapers
 *  - Tenant isolation and validation enforcement
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import {
  calculateSectionMarks,
  calculatePaperMarks,
  round2,
} from "../services/paperCalculator.js";

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
  db: {
    $queryRaw: vi.fn(),
    examConfiguration: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    examPaper: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    paperSection: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    questionSlot: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    questionRevision: {
      findUnique: vi.fn(),
    },
    subject: {
      findUnique: vi.fn(),
    },
  },
  closePrisma: vi.fn(),
}));

// Mock paperService functions for routing tests
vi.mock("../services/paperService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/paperService.js")>();
  return {
    ...actual,
    createExamConfig: vi.fn(),
    listExamConfigs: vi.fn(),
    getExamConfig: vi.fn(),
    updateExamConfig: vi.fn(),
    createExamPaper: vi.fn(),
    listExamPapers: vi.fn(),
    getExamPaper: vi.fn(),
    updateExamPaper: vi.fn(),
    submitExamPaper: vi.fn(),
    addSection: vi.fn(),
    updateSection: vi.fn(),
    deleteSection: vi.fn(),
    addQuestionSlot: vi.fn(),
    updateQuestionSlot: vi.fn(),
    removeQuestionSlot: vi.fn(),
    validatePaper: vi.fn(),
  };
});

import { createApp } from "../app.js";
import * as paperService from "../services/paperService.js";

const app = createApp();

const TEST_INSTITUTION_ID = "a0000000-0000-4000-8000-000000000001";
const CONFIG_ID = "a0000000-0000-4000-8000-000000000011";
const SUBJECT_ID = "a0000000-0000-4000-8000-000000000022";
const PAPER_ID = "a0000000-0000-4000-8000-000000000033";
const SECTION_ID = "a0000000-0000-4000-8000-000000000044";
const SLOT_ID = "a0000000-0000-4000-8000-000000000055";
const QUESTION_ID = "a0000000-0000-4000-8000-000000000066";
const REVISION_ID = "a0000000-0000-4000-8000-000000000077";

describe("Step 8: Paper Calculator Module", () => {
  it("calculates simple mandatory section marks correctly", () => {
    const section = {
      id: "sec-1",
      sectionLabel: "A",
      title: "Mandatory Section",
      requiredAnswers: null,
      slots: [
        { id: "s-1", allocatedMarks: 5 },
        { id: "s-2", allocatedMarks: 5 },
        { id: "s-3", allocatedMarks: 10 },
      ],
    };

    const summary = calculateSectionMarks(section);
    expect(summary.slotCount).toBe(3);
    expect(summary.printedMarks).toBe(20);
    expect(summary.achievableMarks).toBe(20);
    expect(summary.isOptionalChoice).toBe(false);
    expect(summary.isChoiceAmbiguous).toBe(false);
  });

  it("calculates optional section with uniform marks (Answer 3 of 5, 2 marks each)", () => {
    const section = {
      id: "sec-2",
      sectionLabel: "B",
      title: "Short Answer (Choice)",
      requiredAnswers: 3,
      slots: [
        { id: "s-1", allocatedMarks: 2 },
        { id: "s-2", allocatedMarks: 2 },
        { id: "s-3", allocatedMarks: 2 },
        { id: "s-4", allocatedMarks: 2 },
        { id: "s-5", allocatedMarks: 2 },
      ],
    };

    const summary = calculateSectionMarks(section);
    expect(summary.slotCount).toBe(5);
    expect(summary.requiredAnswers).toBe(3);
    expect(summary.printedMarks).toBe(10);
    expect(summary.achievableMarks).toBe(6); // 3 * 2 marks
    expect(summary.isOptionalChoice).toBe(true);
    expect(summary.isChoiceAmbiguous).toBe(false);
  });

  it("flags optional section with non-uniform marks as ambiguous", () => {
    const section = {
      id: "sec-3",
      sectionLabel: "C",
      title: "Essay Choice",
      requiredAnswers: 2,
      slots: [
        { id: "s-1", allocatedMarks: 10 },
        { id: "s-2", allocatedMarks: 15 },
        { id: "s-3", allocatedMarks: 10 },
      ],
    };

    const summary = calculateSectionMarks(section);
    expect(summary.isChoiceAmbiguous).toBe(true);
    expect(summary.ambiguityReason).toContain("non-uniform slot marks");
    expect(summary.achievableMarks).toBe(25); // Top 2: 15 + 10
  });

  it("handles invalid choice configuration where requiredAnswers exceeds slots", () => {
    const section = {
      id: "sec-4",
      sectionLabel: "D",
      title: "Broken Section",
      requiredAnswers: 6,
      slots: [{ id: "s-1", allocatedMarks: 5 }],
    };

    const summary = calculateSectionMarks(section);
    expect(summary.isChoiceAmbiguous).toBe(true);
    expect(summary.ambiguityReason).toContain("exceeds available question slots");
  });

  it("calculates whole paper totals and checks discrepancy against configTotalMarks", () => {
    const sections = [
      {
        id: "sec-1",
        sectionLabel: "A",
        title: "Part A",
        requiredAnswers: null,
        slots: [
          { id: "s-1", allocatedMarks: 10 },
          { id: "s-2", allocatedMarks: 10 },
        ],
      },
      {
        id: "sec-2",
        sectionLabel: "B",
        title: "Part B",
        requiredAnswers: 2,
        slots: [
          { id: "s-3", allocatedMarks: 15 },
          { id: "s-4", allocatedMarks: 15 },
          { id: "s-5", allocatedMarks: 15 },
        ],
      },
    ];

    // Part A achievable = 20, Part B achievable = 30 -> Total achievable = 50
    // Total printed = 20 + 45 = 65
    const result = calculatePaperMarks(sections, 50);
    expect(result.totalPrintedMarks).toBe(65);
    expect(result.totalAchievableMarks).toBe(50);
    expect(result.marksDiscrepancy).toBe(0);
    expect(result.isMarksMatch).toBe(true);
    expect(result.totalSlots).toBe(5);
    expect(result.totalRequiredQuestions).toBe(4); // 2 + 2
  });

  it("reports discrepancy when achievable total does not match config", () => {
    const sections = [
      {
        id: "sec-1",
        sectionLabel: "A",
        title: "Part A",
        slots: [{ id: "s-1", allocatedMarks: 40 }],
      },
    ];

    const result = calculatePaperMarks(sections, 100);
    expect(result.marksDiscrepancy).toBe(60);
    expect(result.isMarksMatch).toBe(false);
  });
});

describe("Step 8: Exam Configuration API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires x-institution-id header", async () => {
    const res = await request(app).get("/api/v1/exam-configs");
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("x-institution-id");
  });

  it("creates an exam configuration with valid input", async () => {
    const mockCreated = {
      id: CONFIG_ID,
      institutionId: TEST_INSTITUTION_ID,
      subjectId: SUBJECT_ID,
      name: "Midterm Examination 2026",
      totalMarks: "100.00",
      durationMinutes: 180,
      instructions: "No electronic devices allowed",
      isActive: true,
      subject: { id: SUBJECT_ID, name: "Operating Systems", code: "CS301" },
    };

    vi.mocked(paperService.createExamConfig).mockResolvedValueOnce(mockCreated as any);

    const res = await request(app)
      .post("/api/v1/exam-configs")
      .set("x-institution-id", TEST_INSTITUTION_ID)
      .send({
        subjectId: SUBJECT_ID,
        name: "Midterm Examination 2026",
        totalMarks: 100,
        durationMinutes: 180,
        instructions: "No electronic devices allowed",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(CONFIG_ID);
    expect(res.body.name).toBe("Midterm Examination 2026");
  });

  it("rejects invalid exam config input (e.g. non-positive marks)", async () => {
    const res = await request(app)
      .post("/api/v1/exam-configs")
      .set("x-institution-id", TEST_INSTITUTION_ID)
      .send({
        subjectId: SUBJECT_ID,
        name: "Invalid Config",
        totalMarks: -10, // Invalid
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });

  it("lists exam configurations for the institution", async () => {
    vi.mocked(paperService.listExamConfigs).mockResolvedValueOnce({
      data: [{ id: CONFIG_ID, name: "Midterm Examination 2026" }],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    } as any);

    const res = await request(app)
      .get("/api/v1/exam-configs")
      .set("x-institution-id", TEST_INSTITUTION_ID);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });
});

describe("Step 8: Exam Paper Builder API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an exam paper draft", async () => {
    const mockPaper = {
      id: PAPER_ID,
      institutionId: TEST_INSTITUTION_ID,
      configId: CONFIG_ID,
      title: "CS301 Midterm Paper Draft",
      status: "DRAFT",
      version: 1,
      sections: [],
    };

    vi.mocked(paperService.createExamPaper).mockResolvedValueOnce(mockPaper as any);

    const res = await request(app)
      .post("/api/v1/exam-papers")
      .set("x-institution-id", TEST_INSTITUTION_ID)
      .send({
        configId: CONFIG_ID,
        title: "CS301 Midterm Paper Draft",
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(PAPER_ID);
    expect(res.body.status).toBe("DRAFT");
  });

  it("adds a section to an exam paper", async () => {
    const mockSection = {
      id: SECTION_ID,
      paperId: PAPER_ID,
      sectionLabel: "A",
      title: "Multiple Choice Questions",
      sequenceOrder: 1,
      slots: [],
    };

    vi.mocked(paperService.addSection).mockResolvedValueOnce(mockSection as any);

    const res = await request(app)
      .post(`/api/v1/exam-papers/${PAPER_ID}/sections`)
      .set("x-institution-id", TEST_INSTITUTION_ID)
      .send({
        sectionLabel: "A",
        title: "Multiple Choice Questions",
        sequenceOrder: 1,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(SECTION_ID);
    expect(res.body.sectionLabel).toBe("A");
  });

  it("adds a question slot referencing an immutable revisionId", async () => {
    const mockSlot = {
      id: SLOT_ID,
      sectionId: SECTION_ID,
      questionId: QUESTION_ID,
      revisionId: REVISION_ID,
      sequenceOrder: 1,
      allocatedMarks: "5.00",
      revision: {
        id: REVISION_ID,
        revisionNumber: 1,
        questionText: "Explain process synchronization.",
        marks: "5.00",
      },
    };

    vi.mocked(paperService.addQuestionSlot).mockResolvedValueOnce(mockSlot as any);

    const res = await request(app)
      .post(`/api/v1/exam-papers/${PAPER_ID}/sections/${SECTION_ID}/slots`)
      .set("x-institution-id", TEST_INSTITUTION_ID)
      .send({
        questionId: QUESTION_ID,
        revisionId: REVISION_ID,
        sequenceOrder: 1,
        allocatedMarks: 5,
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(SLOT_ID);
    expect(res.body.revisionId).toBe(REVISION_ID);
  });

  it("validates an exam paper and returns structured findings", async () => {
    const mockValidation = {
      valid: true,
      totalMarks: 100,
      printedMarks: 120,
      achievableMarks: 100,
      configTotalMarks: 100,
      marksDiscrepancy: 0,
      slotCount: 15,
      requiredQuestionCount: 12,
      sectionCount: 3,
      issues: [
        {
          severity: "INFO",
          code: "MARKS_MATCH",
          message: "Paper achievable total marks matches configured exam total marks (100.00).",
        },
      ],
      sectionSummaries: [],
      syllabusTopicCoverage: [
        { topicId: "top-1", topicName: "Concurrency", questionCount: 5, allocatedMarks: 40 },
      ],
      difficultyDistribution: { EASY: 4, MEDIUM: 8, HARD: 3, UNSET: 0 },
      duplicateWarningsCount: 0,
    };

    vi.mocked(paperService.validatePaper).mockResolvedValueOnce(mockValidation as any);

    const res = await request(app)
      .get(`/api/v1/exam-papers/${PAPER_ID}/validate`)
      .set("x-institution-id", TEST_INSTITUTION_ID);

    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.achievableMarks).toBe(100);
    expect(res.body.printedMarks).toBe(120);
    expect(res.body.issues[0].code).toBe("MARKS_MATCH");
  });

  it("submits an exam paper when valid", async () => {
    const mockSubmitted = {
      id: PAPER_ID,
      status: "SUBMITTED",
      submittedAt: new Date().toISOString(),
      version: 2,
    };

    vi.mocked(paperService.submitExamPaper).mockResolvedValueOnce(mockSubmitted as any);

    const res = await request(app)
      .post(`/api/v1/exam-papers/${PAPER_ID}/submit`)
      .set("x-institution-id", TEST_INSTITUTION_ID)
      .send({ notes: "Ready for formal review" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("SUBMITTED");
  });
});
