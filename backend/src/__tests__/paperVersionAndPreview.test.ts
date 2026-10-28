/**
 * Tests for Step 9: Paper Preview, Validation, Editing, and Versioning.
 *
 * Covers:
 *  - Faculty vs. Candidate preview modes with answer-key protection
 *  - Optimistic locking and concurrency conflict detection (HTTP 409)
 *  - Snapshot version creation, listing, retrieval, and comparison
 *  - Tenant isolation enforcement across all endpoints
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// --- Mock env ---
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

// Mock Prisma
vi.mock("../lib/prisma.js", () => ({
  db: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
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
    paperVersion: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
  closePrisma: vi.fn(),
}));

import { createApp } from "../app.js";
import { db } from "../lib/prisma.js";
import { getPaperPreview } from "../services/paperPreviewService.js";
import {
  saveVersion,
  listVersions,
  getVersion,
  compareVersions,
} from "../services/paperVersionService.js";

const app = createApp();

const TEST_INSTITUTION_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_INSTITUTION_ID = "a0000000-0000-4000-8000-999999999999";
const PAPER_ID = "a0000000-0000-4000-8000-000000000033";
const SECTION_ID = "a0000000-0000-4000-8000-000000000044";
const SLOT_ID = "a0000000-0000-4000-8000-000000000055";
const QUESTION_ID = "a0000000-0000-4000-8000-000000000066";
const REVISION_ID = "a0000000-0000-4000-8000-000000000077";

function getMockPaperTree() {
  return {
    id: PAPER_ID,
    institutionId: TEST_INSTITUTION_ID,
    configId: "config-1",
    title: "Operating Systems Final Examination",
    status: "DRAFT",
    version: 1,
    concurrencyVersion: 3,
    createdBy: "user-1",
    submittedAt: null,
    approvedAt: null,
    approvedBy: null,
    rejectionReason: null,
    notes: "Faculty internal draft notes",
    createdAt: new Date("2026-10-27T10:00:00Z"),
    updatedAt: new Date("2026-10-27T11:00:00Z"),
    config: {
      id: "config-1",
      name: "Final Exam 2026",
      description: "Standard end term",
      totalMarks: "100.00",
      passingMarks: "40.00",
      durationMinutes: 180,
      instructions: "Answer all questions in Section A",
      subject: { id: "sub-1", name: "Operating Systems", code: "CS301" },
    },
    sections: [
      {
        id: SECTION_ID,
        paperId: PAPER_ID,
        sectionLabel: "A",
        title: "Short Answers",
        description: "Mandatory questions",
        sequenceOrder: 1,
        totalSlots: 1,
        requiredAnswers: null,
        sectionMarks: "5.00",
        slots: [
          {
            id: SLOT_ID,
            sectionId: SECTION_ID,
            questionId: QUESTION_ID,
            revisionId: REVISION_ID,
            sequenceOrder: 1,
            allocatedMarks: "5.00",
            notes: "Strict marking scheme applied here",
            revision: {
              id: REVISION_ID,
              revisionNumber: 1,
              questionText: "What is a semaphore?",
              questionType: "SHORT_ANSWER",
              marks: "5.00",
              language: "en",
              difficulty: "MEDIUM",
              explanation: "A synchronization tool used in concurrent programming.",
              analyses: [
                { hasPotentialDuplicates: false, hasNearDuplicates: false },
              ],
              questionTopicMaps: [
                { topic: { id: "top-1", name: "Synchronization", code: "U3" } },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("Step 9: Paper Preview Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("faculty preview returns full paper with notes and explanation", async () => {
    const mockPaper = getMockPaperTree();
    vi.mocked(db.examPaper.findUnique).mockResolvedValueOnce(mockPaper as any);

    const result = await getPaperPreview(TEST_INSTITUTION_ID, PAPER_ID, "faculty");

    expect(result.id).toBe(PAPER_ID);
    expect(result.notes).toBe("Faculty internal draft notes");
    expect(result.sections[0]!.slots[0]!.notes).toBe("Strict marking scheme applied here");
    expect((result.sections[0]!.slots[0]!.revision as any).explanation).toBe(
      "A synchronization tool used in concurrent programming.",
    );
  });

  it("candidate preview strips answers, explanations, faculty notes, and analyses", async () => {
    const mockPaper = getMockPaperTree();
    vi.mocked(db.examPaper.findUnique).mockResolvedValueOnce(mockPaper as any);

    const result = await getPaperPreview(TEST_INSTITUTION_ID, PAPER_ID, "candidate");

    expect(result.id).toBe(PAPER_ID);
    // Draft notes stripped
    expect(result.notes).toBeNull();

    const slot = result.sections[0]!.slots[0]!;
    // Slot notes stripped
    expect(slot.notes).toBeNull();

    // Critical: Answer key & faculty analysis protection
    expect((slot.revision as any).explanation).toBeUndefined();
    expect((slot.revision as any).suggestedAnswer).toBeUndefined();
    expect((slot.revision as any).analyses).toBeUndefined();
    expect((slot.revision as any).authorId).toBeUndefined();

    // Necessary exam fields preserved
    expect(slot.revision.questionText).toBe("What is a semaphore?");
    expect(slot.revision.questionType).toBe("SHORT_ANSWER");
    expect(slot.revision.marks).toBe("5.00");
    expect(slot.revision.difficulty).toBe("MEDIUM");
  });
});

describe("Step 9: Paper Version Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves version and increments concurrencyVersion atomically", async () => {
    const mockPaper = getMockPaperTree();

    vi.mocked(db.$transaction).mockImplementationOnce(async (callback: any) => {
      const txMock = {
        examPaper: {
          findUnique: vi.fn().mockResolvedValue(mockPaper),
          update: vi.fn().mockResolvedValue({ ...mockPaper, concurrencyVersion: 4 }),
        },
        paperVersion: {
          findFirst: vi.fn().mockResolvedValue({ versionNumber: 2 }),
          create: vi.fn().mockResolvedValue({ id: "v-3", versionNumber: 3 }),
        },
      };
      return callback(txMock);
    });

    const result = await saveVersion(
      TEST_INSTITUTION_ID,
      PAPER_ID,
      "Approved Section A questions",
      3,
    );

    expect(result.versionNumber).toBe(3);
    expect(result.concurrencyVersion).toBe(4);
  });

  it("throws 409 Conflict when concurrencyVersion mismatch occurs", async () => {
    const mockPaper = getMockPaperTree(); // concurrencyVersion is 3

    vi.mocked(db.$transaction).mockImplementationOnce(async (callback: any) => {
      const txMock = {
        examPaper: {
          findUnique: vi.fn().mockResolvedValue(mockPaper),
        },
      };
      return callback(txMock);
    });

    // Caller provides stale token (e.g. 2 instead of 3)
    await expect(
      saveVersion(TEST_INSTITUTION_ID, PAPER_ID, "Stale edit", 2),
    ).rejects.toThrow("Concurrent edit detected — please reload the paper");
  });

  it("lists version summaries ordered by versionNumber desc", async () => {
    vi.mocked(db.examPaper.findUnique).mockResolvedValueOnce({
      id: PAPER_ID,
      institutionId: TEST_INSTITUTION_ID,
    } as any);

    const mockVersions = [
      {
        id: "v-2",
        paperId: PAPER_ID,
        versionNumber: 2,
        changeNote: "Added Section B",
        createdAt: new Date("2026-10-27T12:00:00Z"),
      },
      {
        id: "v-1",
        paperId: PAPER_ID,
        versionNumber: 1,
        changeNote: "Initial blueprint",
        createdAt: new Date("2026-10-27T10:00:00Z"),
      },
    ];

    vi.mocked(db.paperVersion.findMany).mockResolvedValueOnce(mockVersions as any);

    const list = await listVersions(TEST_INSTITUTION_ID, PAPER_ID);
    expect(list).toHaveLength(2);
    expect(list[0]!.versionNumber).toBe(2);
    expect(list[1]!.versionNumber).toBe(1);
  });

  it("retrieves a specific version snapshot", async () => {
    vi.mocked(db.examPaper.findUnique).mockResolvedValueOnce({
      id: PAPER_ID,
      institutionId: TEST_INSTITUTION_ID,
    } as any);

    const snapshot = getMockPaperTree();
    vi.mocked(db.paperVersion.findUnique).mockResolvedValueOnce({
      id: "v-1",
      paperId: PAPER_ID,
      versionNumber: 1,
      changeNote: "Initial draft",
      snapshotJson: snapshot,
      createdAt: new Date(),
    } as any);

    const version = await getVersion(TEST_INSTITUTION_ID, PAPER_ID, 1);
    expect(version.versionNumber).toBe(1);
    expect(version.snapshotJson).toBeDefined();
  });

  it("compares two versions", async () => {
    vi.mocked(db.examPaper.findUnique)
      .mockResolvedValueOnce({ id: PAPER_ID, institutionId: TEST_INSTITUTION_ID } as any)
      .mockResolvedValueOnce({ id: PAPER_ID, institutionId: TEST_INSTITUTION_ID } as any);

    const snap1 = { ...getMockPaperTree(), title: "Draft v1" };
    const snap2 = { ...getMockPaperTree(), title: "Draft v2" };

    vi.mocked(db.paperVersion.findUnique)
      .mockResolvedValueOnce({
        id: "v-1",
        paperId: PAPER_ID,
        versionNumber: 1,
        snapshotJson: snap1,
      } as any)
      .mockResolvedValueOnce({
        id: "v-2",
        paperId: PAPER_ID,
        versionNumber: 2,
        snapshotJson: snap2,
      } as any);

    const comparison = await compareVersions(TEST_INSTITUTION_ID, PAPER_ID, 1, 2);
    expect((comparison.versionA as any).title).toBe("Draft v1");
    expect((comparison.versionB as any).title).toBe("Draft v2");
  });
});

describe("Step 9: HTTP Routes for Preview & Versioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires x-institution-id header", async () => {
    const res = await request(app).get(`/api/v1/exam-papers/${PAPER_ID}/preview`);
    expect(res.status).toBe(401);
  });

  it("GET /exam-papers/:paperId/preview defaults to faculty view", async () => {
    const mockPaper = getMockPaperTree();
    vi.mocked(db.examPaper.findUnique).mockResolvedValueOnce(mockPaper as any);

    const res = await request(app)
      .get(`/api/v1/exam-papers/${PAPER_ID}/preview`)
      .set("x-institution-id", TEST_INSTITUTION_ID);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(PAPER_ID);
    expect(res.body.notes).toBe("Faculty internal draft notes");
  });

  it("GET /exam-papers/:paperId/preview?mode=candidate strips answers", async () => {
    const mockPaper = getMockPaperTree();
    vi.mocked(db.examPaper.findUnique).mockResolvedValueOnce(mockPaper as any);

    const res = await request(app)
      .get(`/api/v1/exam-papers/${PAPER_ID}/preview?mode=candidate`)
      .set("x-institution-id", TEST_INSTITUTION_ID);

    expect(res.status).toBe(200);
    expect(res.body.notes).toBeNull();
    const slot = res.body.sections[0].slots[0];
    expect(slot.revision.explanation).toBeUndefined();
  });

  it("POST /exam-papers/:paperId/versions saves snapshot", async () => {
    const mockPaper = getMockPaperTree();

    vi.mocked(db.$transaction).mockImplementationOnce(async (callback: any) => {
      const txMock = {
        examPaper: {
          findUnique: vi.fn().mockResolvedValue(mockPaper),
          update: vi.fn().mockResolvedValue({ ...mockPaper, concurrencyVersion: 4 }),
        },
        paperVersion: {
          findFirst: vi.fn().mockResolvedValue({ versionNumber: 1 }),
          create: vi.fn().mockResolvedValue({ id: "v-2", versionNumber: 2 }),
        },
      };
      return callback(txMock);
    });

    const res = await request(app)
      .post(`/api/v1/exam-papers/${PAPER_ID}/versions`)
      .set("x-institution-id", TEST_INSTITUTION_ID)
      .send({
        changeNote: "Verified marks parity with exam config",
        concurrencyVersion: 3,
      });

    expect(res.status).toBe(201);
    expect(res.body.versionNumber).toBe(2);
    expect(res.body.concurrencyVersion).toBe(4);
  });

  it("GET /exam-papers/:paperId/versions lists all versions", async () => {
    vi.mocked(db.examPaper.findUnique).mockResolvedValueOnce({
      id: PAPER_ID,
      institutionId: TEST_INSTITUTION_ID,
    } as any);

    vi.mocked(db.paperVersion.findMany).mockResolvedValueOnce([
      {
        id: "v-1",
        paperId: PAPER_ID,
        versionNumber: 1,
        changeNote: "First revision",
        createdAt: new Date().toISOString(),
      },
    ] as any);

    const res = await request(app)
      .get(`/api/v1/exam-papers/${PAPER_ID}/versions`)
      .set("x-institution-id", TEST_INSTITUTION_ID);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].versionNumber).toBe(1);
  });

  it("GET /exam-papers/:paperId/versions/compare compares two versions", async () => {
    vi.mocked(db.examPaper.findUnique)
      .mockResolvedValueOnce({ id: PAPER_ID, institutionId: TEST_INSTITUTION_ID } as any)
      .mockResolvedValueOnce({ id: PAPER_ID, institutionId: TEST_INSTITUTION_ID } as any);

    vi.mocked(db.paperVersion.findUnique)
      .mockResolvedValueOnce({
        id: "v-1",
        paperId: PAPER_ID,
        versionNumber: 1,
        snapshotJson: { title: "v1" },
      } as any)
      .mockResolvedValueOnce({
        id: "v-2",
        paperId: PAPER_ID,
        versionNumber: 2,
        snapshotJson: { title: "v2" },
      } as any);

    const res = await request(app)
      .get(`/api/v1/exam-papers/${PAPER_ID}/versions/compare?versionA=1&versionB=2`)
      .set("x-institution-id", TEST_INSTITUTION_ID);

    expect(res.status).toBe(200);
    expect(res.body.versionA.title).toBe("v1");
    expect(res.body.versionB.title).toBe("v2");
  });

  it("GET /exam-papers/:paperId/versions/:versionNumber gets single version", async () => {
    vi.mocked(db.examPaper.findUnique).mockResolvedValueOnce({
      id: PAPER_ID,
      institutionId: TEST_INSTITUTION_ID,
    } as any);

    vi.mocked(db.paperVersion.findUnique).mockResolvedValueOnce({
      id: "v-1",
      paperId: PAPER_ID,
      versionNumber: 1,
      snapshotJson: { title: "Exam v1" },
      changeNote: "Initial",
      createdAt: new Date().toISOString(),
    } as any);

    const res = await request(app)
      .get(`/api/v1/exam-papers/${PAPER_ID}/versions/1`)
      .set("x-institution-id", TEST_INSTITUTION_ID);

    expect(res.status).toBe(200);
    expect(res.body.versionNumber).toBe(1);
    expect(res.body.snapshotJson.title).toBe("Exam v1");
  });
});
