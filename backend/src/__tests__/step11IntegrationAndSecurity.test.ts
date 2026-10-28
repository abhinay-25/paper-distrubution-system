/**
 * Step 11 — Complete Integration, Security, and End-to-End Verification Suite
 *
 * Executes against the real PostgreSQL database, real Express HTTP pipeline,
 * real PDFKit CBIT renderer, and real disk artifact storage.
 *
 * Verifies:
 *  - Workflow A: Academic Subjects, Topics, Question Bank & Immutable Revisions
 *  - Workflow B: AI Question Analysis, Batch Generation, & Faculty Promotion
 *  - Workflow C: Exam Configuration, Paper Builder, Marks Calculation, & Slot Immutability
 *  - Workflow D: Paper Validation, Candidate/Faculty Preview Protection, & Versioning Concurrency
 *  - Workflow E: Independent Approval Lifecycle, Self-Approval Prohibition, Rejection & Re-submission
 *  - Workflow F: College-Template PDF Generation, SHA-256 Checksum Integrity, & Tamper Detection
 *  - Security Controls: Auth/Role Enforcement, Tenant Isolation, & Input Validation
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import { createApp } from "../app.js";
import { db } from "../lib/prisma.js";
import { aiClient, AIClientError } from "../services/aiClient.js";
import { createSessionToken } from "../services/authService.js";

const app = createApp();

// Dedicated UUIDs for Step 11 E2E verification (isolated from other tests)
const INST_A_ID = "11111111-1111-4111-8111-111111111101";
const INST_B_ID = "22222222-2222-4222-8222-222222222202";

const FACULTY_A_ID = "11111111-1111-4111-8111-111111111201";
const MODERATOR_A_ID = "11111111-1111-4111-8111-111111111202";
const VIEWER_A_ID = "11111111-1111-4111-8111-111111111203";
const MODERATOR_B_ID = "22222222-2222-4222-8222-222222222204";

const tokenFacultyA = createSessionToken({ userId: FACULTY_A_ID, institutionId: INST_A_ID }).token;
const tokenModeratorA = createSessionToken({ userId: MODERATOR_A_ID, institutionId: INST_A_ID }).token;
const tokenViewerA = createSessionToken({ userId: VIEWER_A_ID, institutionId: INST_A_ID }).token;
const tokenInstB = createSessionToken({ userId: MODERATOR_B_ID, institutionId: INST_B_ID }).token;

const headersFacultyA = {
  Authorization: `Bearer ${tokenFacultyA}`,
  "x-institution-id": INST_A_ID,
};

const headersModeratorA = {
  Authorization: `Bearer ${tokenModeratorA}`,
  "x-institution-id": INST_A_ID,
};

const headersViewerA = {
  Authorization: `Bearer ${tokenViewerA}`,
  "x-institution-id": INST_A_ID,
};

const headersInstB = {
  Authorization: `Bearer ${tokenInstB}`,
  "x-institution-id": INST_B_ID,
};

// Shared state across sequential workflow steps
let subjectAId = "";
let subjectBId = "";
let topicA1Id = "";
let topicA2Id = "";
let primaryQuestionId = "";
let primaryRev1Id = "";
let primaryRev2Id = "";
let promotedQuestionId = "";
let examConfigId = "";
let examPaperId = "";
let sectionAId = "";
let sectionBId = "";
let firstSubmissionId = "";
let secondSubmissionId = "";
let version1Id = "";
let version2Id = "";
let generatedPdfPath = "";

async function cleanupTestData() {
  // Delete in dependency order for INST_A_ID and INST_B_ID
  const instIds = [INST_A_ID, INST_B_ID];
  await db.paperPdfArtifact.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.paperSubmission.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.examPaper.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.examConfiguration.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.questionGenerationJob.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.question.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.topic.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.subject.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.institutionMembership.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.user.deleteMany({
    where: { id: { in: [FACULTY_A_ID, MODERATOR_A_ID, VIEWER_A_ID, MODERATOR_B_ID] } },
  });
  await db.institution.deleteMany({ where: { id: { in: instIds } } });
}

describe("Step 11 — Complete End-to-End & Security Verification", () => {
  beforeAll(async () => {
    await cleanupTestData();

    // Seed Institution A & Institution B
    await db.institution.createMany({
      data: [
        {
          id: INST_A_ID,
          slug: "step11-cbit-inst-a",
          name: "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)",
          status: "ACTIVE",
        },
        {
          id: INST_B_ID,
          slug: "step11-other-inst-b",
          name: "OTHER UNIVERSITY TENANT B",
          status: "ACTIVE",
        },
      ],
    });

    // Seed Users
    await db.user.createMany({
      data: [
        {
          id: FACULTY_A_ID,
          email: "faculty.a@step11.test",
          hashedPassword: "$2b$10$dummyhashedpasswordforstep11verification00001",
          displayName: "Dr. Faculty Author",
        },
        {
          id: MODERATOR_A_ID,
          email: "moderator.a@step11.test",
          hashedPassword: "$2b$10$dummyhashedpasswordforstep11verification00002",
          displayName: "Prof. Independent Moderator",
        },
        {
          id: VIEWER_A_ID,
          email: "viewer.a@step11.test",
          hashedPassword: "$2b$10$dummyhashedpasswordforstep11verification00003",
          displayName: "Staff Viewer",
        },
        {
          id: MODERATOR_B_ID,
          email: "moderator.b@step11.test",
          hashedPassword: "$2b$10$dummyhashedpasswordforstep11verification00004",
          displayName: "Other Tenant Moderator",
        },
      ],
    });

    // Seed Institution Memberships
    await db.institutionMembership.createMany({
      data: [
        {
          institutionId: INST_A_ID,
          userId: FACULTY_A_ID,
          role: "EXAMINER",
          status: "ACTIVE",
        },
        {
          institutionId: INST_A_ID,
          userId: MODERATOR_A_ID,
          role: "MODERATOR",
          status: "ACTIVE",
        },
        {
          institutionId: INST_A_ID,
          userId: VIEWER_A_ID,
          role: "VIEWER",
          status: "ACTIVE",
        },
        {
          institutionId: INST_B_ID,
          userId: MODERATOR_B_ID,
          role: "INSTITUTION_ADMIN",
          status: "ACTIVE",
        },
      ],
    });
  });

  afterAll(async () => {
    if (generatedPdfPath) {
      await fs.unlink(generatedPdfPath).catch(() => {});
    }
    await cleanupTestData();
  });

  // =========================================================================
  // WORKFLOW A — Question Bank & Immutable Revisions
  // =========================================================================
  describe("Workflow A — Question Bank & Immutable Revisions", () => {
    it("creates subjects and syllabus topics for Institution A and Institution B", async () => {
      const subARes = await request(app)
        .post("/api/v1/subjects")
        .set(headersFacultyA)
        .send({
          name: "Social Engineering",
          code: "22CIE18",
          description: "BE-CSE (CIC) VII Sem Elective",
        });
      expect(subARes.status).toBe(201);
      subjectAId = subARes.body.id;

      const subBRes = await request(app)
        .post("/api/v1/subjects")
        .set(headersInstB)
        .send({
          name: "Quantum Computing",
          code: "QC901",
        });
      expect(subBRes.status).toBe(201);
      subjectBId = subBRes.body.id;

      const top1Res = await request(app)
        .post(`/api/v1/subjects/${subjectAId}/topics`)
        .set(headersFacultyA)
        .send({ name: "CO1: Introduction & Phishing", code: "CO1", sequenceOrder: 1 });
      expect(top1Res.status).toBe(201);
      topicA1Id = top1Res.body.id;

      const top2Res = await request(app)
        .post(`/api/v1/subjects/${subjectAId}/topics`)
        .set(headersFacultyA)
        .send({ name: "CO2: OSINT & Pretexting", code: "CO2", sequenceOrder: 2 });
      expect(top2Res.status).toBe(201);
      topicA2Id = top2Res.body.id;
    });

    it("creates a question (v1), edits it to create v2, and preserves v1 immutably", async () => {
      const createRes = await request(app)
        .post("/api/v1/questions")
        .set(headersFacultyA)
        .send({
          subjectId: subjectAId,
          questionText: "Identify key psychological principles exploited in social engineering v1.",
          questionType: "SHORT_ANSWER",
          marks: 2,
          language: "en",
          difficulty: "EASY",
          explanation: "CONFIDENTIAL ANSWER KEY V1: Authority, urgency, scarcity, familiarity.",
          topicIds: [topicA1Id],
          lifecycle: "ACTIVE",
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.currentRevisionNumber).toBe(1);
      primaryQuestionId = createRes.body.id;
      primaryRev1Id = createRes.body.currentRevision.id;

      // Edit question -> creates revision 2
      const updateRes = await request(app)
        .patch(`/api/v1/questions/${primaryQuestionId}`)
        .set(headersFacultyA)
        .send({
          questionText: "Identify key psychological principles exploited in social engineering attacks.",
          questionType: "SHORT_ANSWER",
          marks: 2,
          language: "en",
          difficulty: "EASY",
          explanation: "CONFIDENTIAL ANSWER KEY V2: Authority, urgency, social proof, scarcity.",
          topicIds: [topicA1Id],
          lifecycle: "ACTIVE",
          expectedRevisionNumber: 1,
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.currentRevisionNumber).toBe(2);
      primaryRev2Id = updateRes.body.currentRevision.id;
      expect(primaryRev2Id).not.toBe(primaryRev1Id);

      // Verify optimistic concurrency lock rejects stale expectedRevisionNumber
      const staleRes = await request(app)
        .patch(`/api/v1/questions/${primaryQuestionId}`)
        .set(headersFacultyA)
        .send({
          questionText: "Stale overwrite attempt",
          questionType: "SHORT_ANSWER",
          marks: 2,
          language: "en",
          topicIds: [topicA1Id],
          expectedRevisionNumber: 1,
        });
      expect(staleRes.status).toBe(409);

      // Verify historical revisions list preserves v1 unchanged
      const revListRes = await request(app)
        .get(`/api/v1/questions/${primaryQuestionId}/revisions`)
        .set(headersFacultyA);
      expect(revListRes.status).toBe(200);
      expect(revListRes.body.data).toHaveLength(2);
      const rev1 = revListRes.body.data.find((r: any) => r.revisionNumber === 1);
      expect(rev1.questionText).toContain("v1");
    });

    it("enforces search, filtering, pagination, and tenant isolation on Question Bank", async () => {
      const listRes = await request(app)
        .get(`/api/v1/questions?subjectId=${subjectAId}&search=psychological&difficulty=EASY`)
        .set(headersFacultyA);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].id).toBe(primaryQuestionId);

      // Institution B cannot see Institution A's question or revisions
      const crossGet = await request(app)
        .get(`/api/v1/questions/${primaryQuestionId}`)
        .set(headersInstB);
      expect(crossGet.status).toBe(404);

      const crossList = await request(app)
        .get(`/api/v1/questions`)
        .set(headersInstB);
      expect(crossList.status).toBe(200);
      expect(crossList.body.data).toHaveLength(0);
    });
  });

  // =========================================================================
  // WORKFLOW B — AI Question Intelligence & Generation
  // =========================================================================
  describe("Workflow B — AI Question Intelligence & Generation", () => {
    it("analyzes a question revision without auto-mutating difficulty and supports faculty review", async () => {
      const spyAnalyze = vi.spyOn(aiClient, "analyzeQuestion").mockResolvedValueOnce({
        requestId: "req-step11-analysis",
        contractVersion: "1.0",
        operation: "question_analysis",
        provider: { name: "gemini", model: "gemini-3.8-flash" },
        durationMs: 120,
        result: {
          revisionId: primaryRev2Id,
          classification: {
            bloomsLevel: "UNDERSTAND",
            bloomsConfidence: 0.92,
            subjectTags: ["social-engineering", "psychology"],
            questionTypeHint: "short_answer",
          },
          difficultyEstimation: {
            suggestedDifficulty: "HARD", // Deliberately different from EASY
            confidence: 0.85,
            rationale: "Requires conceptual synthesis.",
          },
          duplicateCandidates: [],
          nearDuplicateThreshold: 0.9,
          potentialDuplicateThreshold: 0.75,
        },
      } as any);

      const analyzeRes = await request(app)
        .post(`/api/v1/questions/${primaryQuestionId}/analyses`)
        .set(headersFacultyA)
        .send({ revisionId: primaryRev2Id });
      expect([201, 202]).toContain(analyzeRes.status);
      expect(analyzeRes.body.reviewStatus).toBe("PENDING");
      expect(analyzeRes.body.aiBloomsLevel).toBe("UNDERSTAND");

      // Verify QuestionRevision.difficulty remained EASY (not overwritten by AI's HARD suggestion)
      const qCheck = await request(app)
        .get(`/api/v1/questions/${primaryQuestionId}`)
        .set(headersFacultyA);
      expect(qCheck.body.currentRevision.difficulty).toBe("EASY");

      // Faculty reviews and overrides analysis
      const reviewRes = await request(app)
        .patch(`/api/v1/questions/${primaryQuestionId}/analyses/${analyzeRes.body.id}/review`)
        .set(headersFacultyA)
        .send({
          reviewAction: "OVERRIDDEN",
          facultyBloomsLevel: "REMEMBER",
          facultyDifficulty: "EASY",
          facultyNotes: "Introductory 2-mark recall question.",
        });
      expect(reviewRes.status).toBe(200);
      expect(reviewRes.body.reviewStatus).toBe("OVERRIDDEN");

      spyAnalyze.mockRestore();
    });

    it("handles AI generation jobs, provider failures, faculty promotion, and blocks cross-tenant promotion", async () => {
      // 1. Simulate AI provider timeout/error -> job recorded as FAILED (503)
      const spyGenFail = vi
        .spyOn(aiClient, "generateQuestions")
        .mockRejectedValueOnce(new AIClientError("AI provider timed out", "PROVIDER_TIMEOUT", 503));

      const failJobRes = await request(app)
        .post("/api/v1/generation-jobs")
        .set(headersFacultyA)
        .send({
          subjectId: subjectAId,
          topicId: topicA1Id,
          questionType: "SHORT_ANSWER",
          difficulty: "EASY",
          count: 2,
          language: "en",
        });
      expect(failJobRes.status).toBe(503);

      // Verify FAILED job is persisted in history
      const jobsList = await request(app)
        .get("/api/v1/generation-jobs?status=FAILED")
        .set(headersFacultyA);
      expect(jobsList.status).toBe(200);
      expect(jobsList.body.data.length).toBeGreaterThanOrEqual(1);
      spyGenFail.mockRestore();

      // 2. Simulate successful AI generation
      const spyGenOk = vi.spyOn(aiClient, "generateQuestions").mockResolvedValueOnce({
        requestId: "req-step11-gen",
        contractVersion: "1.0",
        operation: "question_generation",
        provider: { name: "gemini", model: "gemini-3.8-flash" },
        durationMs: 210,
        result: {
          questions: [
            {
              questionText: "What is the role of pretexting in social engineering?",
              suggestedAnswer: "CONFIDENTIAL AI KEY: Creating a fabricated scenario to steal data.",
              explanation: "CONFIDENTIAL AI EXPLANATION: Pretexting builds false trust.",
              difficulty: "EASY",
              bloomsLevel: "UNDERSTAND",
              subjectTags: ["pretexting"],
            },
            {
              questionText: "Draft candidate question to be rejected.",
              suggestedAnswer: "N/A",
              explanation: "N/A",
              difficulty: "EASY",
              bloomsLevel: "REMEMBER",
              subjectTags: ["misc"],
            },
          ],
        },
      } as any);

      const okJobRes = await request(app)
        .post("/api/v1/generation-jobs")
        .set(headersFacultyA)
        .send({
          subjectId: subjectAId,
          topicId: topicA2Id,
          questionType: "SHORT_ANSWER",
          difficulty: "EASY",
          count: 2,
          language: "en",
          contextHint: "Focus on pretexting",
        });
      expect(okJobRes.status).toBe(201);
      expect(okJobRes.body.status).toBe("COMPLETED");
      const jobId = okJobRes.body.id;

      // Candidates start as PENDING and are NOT in the question bank yet
      const candRes = await request(app)
        .get(`/api/v1/generation-jobs/${jobId}/questions`)
        .set(headersFacultyA);
      expect(candRes.status).toBe(200);
      expect(candRes.body.data).toHaveLength(2);
      const [cand1, cand2] = candRes.body.data;
      expect(cand1.status).toBe("PENDING");
      expect(cand1.promotedQuestionId).toBeNull();

      // Security check: Attempt to promote candidate into Institution B's subject -> 404
      const crossPromoteRes = await request(app)
        .patch(`/api/v1/generation-jobs/${jobId}/questions/${cand1.id}/review`)
        .set(headersFacultyA)
        .send({
          reviewAction: "APPROVED",
          subjectId: subjectBId, // belongs to Institution B!
          marks: 2,
        });
      expect(crossPromoteRes.status).toBe(404);

      // Legitimate promotion of cand1 into Institution A's subject
      const promoteRes = await request(app)
        .patch(`/api/v1/generation-jobs/${jobId}/questions/${cand1.id}/review`)
        .set(headersFacultyA)
        .send({
          reviewAction: "APPROVED",
          subjectId: subjectAId,
          topicIds: [topicA2Id],
          marks: 2,
          reviewNotes: "Approved for Part A.",
        });
      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.status).toBe("APPROVED");
      expect(promoteRes.body.promotedQuestionId).toBeTruthy();
      promotedQuestionId = promoteRes.body.promotedQuestionId;

      // Reject cand2 -> remains out of question bank
      const rejectCandRes = await request(app)
        .patch(`/api/v1/generation-jobs/${jobId}/questions/${cand2.id}/review`)
        .set(headersFacultyA)
        .send({
          reviewAction: "REJECTED",
          reviewNotes: "Not aligned with unit syllabus.",
        });
      expect(rejectCandRes.status).toBe(200);
      expect(rejectCandRes.body.status).toBe("REJECTED");
      expect(rejectCandRes.body.promotedQuestionId).toBeNull();

      spyGenOk.mockRestore();
    });
  });

  // =========================================================================
  // WORKFLOW C — Exam Configuration & Paper Construction
  // =========================================================================
  describe("Workflow C — Exam Configuration & Paper Construction", () => {
    it("creates an exam configuration, builds a 2-section paper with mandatory & optional-choice rules, and enforces revision immutability", async () => {
      // 1. Create ExamConfiguration (60 achievable marks, 180 mins)
      const cfgRes = await request(app)
        .post("/api/v1/exam-configs")
        .set(headersFacultyA)
        .send({
          subjectId: subjectAId,
          name: "B.E. (CSE-CIC) VII Sem Main Examination",
          description: "End Semester Autonomous Exam",
          totalMarks: 60,
          passingMarks: 24,
          durationMinutes: 180,
          instructions: "Answer all questions from Part-A and any FIVE from Part-B.",
        });
      expect(cfgRes.status).toBe(201);
      examConfigId = cfgRes.body.id;

      // 2. Create ExamPaper with Part A (mandatory, 10x2=20) and Part B (optional: answer 2 of 4, 20 marks each = 40 achievable, 80 printed)
      const paperRes = await request(app)
        .post("/api/v1/exam-papers")
        .set(headersFacultyA)
        .send({
          configId: examConfigId,
          title: "Social Engineering Main Paper Draft",
          notes: "INTERNAL FACULTY NOTE: Do not disclose to students.",
          sections: [
            {
              sectionLabel: "A",
              title: "PART - A (Answer all questions)",
              sequenceOrder: 1,
            },
            {
              sectionLabel: "B",
              title: "PART - B (Answer any TWO questions)",
              sequenceOrder: 2,
              requiredAnswers: 2,
            },
          ],
        });
      expect(paperRes.status).toBe(201);
      examPaperId = paperRes.body.id;
      sectionAId = paperRes.body.sections[0].id;
      sectionBId = paperRes.body.sections[1].id;

      // 3. Add primaryRev2Id and promotedQuestion's revision to Part A (10 marks each -> 20 marks achievable)
      const promotedQ = await request(app)
        .get(`/api/v1/questions/${promotedQuestionId}`)
        .set(headersFacultyA);
      const promotedRevId = promotedQ.body.currentRevision.id;

      const slot1Res = await request(app)
        .post(`/api/v1/exam-papers/${examPaperId}/sections/${sectionAId}/slots`)
        .set(headersFacultyA)
        .send({
          questionId: primaryQuestionId,
          revisionId: primaryRev2Id,
          sequenceOrder: 1,
          allocatedMarks: 10,
          notes: "SLOT INTERNAL NOTE 1",
        });
      expect(slot1Res.status).toBe(201);

      const slot2Res = await request(app)
        .post(`/api/v1/exam-papers/${examPaperId}/sections/${sectionAId}/slots`)
        .set(headersFacultyA)
        .send({
          questionId: promotedQuestionId,
          revisionId: promotedRevId,
          sequenceOrder: 2,
          allocatedMarks: 10,
        });
      expect(slot2Res.status).toBe(201);

      // 4. Create 4 long-answer questions for Part B (20 marks each, requiredAnswers = 2 -> 80 printed, 40 achievable)
      for (let i = 1; i <= 4; i++) {
        const qRes = await request(app)
          .post("/api/v1/questions")
          .set(headersFacultyA)
          .send({
            subjectId: subjectAId,
            questionText: `Part B Question ${i}: Analyze enterprise defense-in-depth controls against social engineering scenario ${i}.`,
            questionType: "LONG_ANSWER",
            marks: 20,
            language: "en",
            difficulty: i % 2 === 0 ? "HARD" : "MEDIUM",
            explanation: `CONFIDENTIAL MARKING SCHEME FOR PART B Q${i}`,
            topicIds: [i <= 2 ? topicA1Id : topicA2Id],
            lifecycle: "ACTIVE",
          });
        expect(qRes.status).toBe(201);

        const sRes = await request(app)
          .post(`/api/v1/exam-papers/${examPaperId}/sections/${sectionBId}/slots`)
          .set(headersFacultyA)
          .send({
            questionId: qRes.body.id,
            revisionId: qRes.body.currentRevision.id,
            sequenceOrder: i,
            allocatedMarks: 20,
          });
        expect(sRes.status).toBe(201);
      }

      // 5. Security check: Reject adding a question from Institution B into Institution A's paper
      const instBQ = await request(app)
        .post("/api/v1/questions")
        .set(headersInstB)
        .send({
          subjectId: subjectBId,
          questionText: "Tenant B confidential question",
          questionType: "SHORT_ANSWER",
          marks: 5,
          language: "en",
        });
      expect(instBQ.status).toBe(201);

      const crossSlotRes = await request(app)
        .post(`/api/v1/exam-papers/${examPaperId}/sections/${sectionAId}/slots`)
        .set(headersFacultyA)
        .send({
          questionId: instBQ.body.id,
          revisionId: instBQ.body.currentRevision.id,
          sequenceOrder: 99,
          allocatedMarks: 5,
        });
      expect(crossSlotRes.status).toBe(404);

      // 6. Edit primaryQuestionId in Question Bank (creating v3) and verify the paper slot still points to v2!
      const editQRes = await request(app)
        .patch(`/api/v1/questions/${primaryQuestionId}`)
        .set(headersFacultyA)
        .send({
          questionText: "MODIFIED IN v3 AFTER PAPER SLOT ASSIGNMENT",
          questionType: "SHORT_ANSWER",
          marks: 2,
          language: "en",
          difficulty: "EASY",
          topicIds: [topicA1Id],
          expectedRevisionNumber: 2,
        });
      expect(editQRes.status).toBe(200);
      expect(editQRes.body.currentRevisionNumber).toBe(3);

      const paperCheck = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}`)
        .set(headersFacultyA);
      const slot1InPaper = paperCheck.body.sections[0].slots[0];
      expect(slot1InPaper.revisionId).toBe(primaryRev2Id);
      expect(slot1InPaper.revision.revisionNumber).toBe(2);
      expect(slot1InPaper.revision.questionText).not.toContain("MODIFIED IN v3");
    });
  });

  // =========================================================================
  // WORKFLOW D — Paper Validation, Preview Protection, & Versioning Concurrency
  // =========================================================================
  describe("Workflow D — Paper Validation, Preview Protection, & Versioning Concurrency", () => {
    it("calculates printed vs achievable marks and validates syllabus coverage", async () => {
      const valRes = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}/validate`)
        .set(headersFacultyA);
      expect(valRes.status).toBe(200);
      expect(valRes.body.valid).toBe(true);
      expect(valRes.body.printedMarks).toBe(100); // 20 + 80
      expect(valRes.body.achievableMarks).toBe(60); // 20 + (2 * 20)
      expect(valRes.body.configTotalMarks).toBe(60);
      expect(valRes.body.marksDiscrepancy).toBe(0);
      expect(valRes.body.syllabusTopicCoverage).toHaveLength(2);
    });

    it("strips answer keys, explanations, and internal notes in candidate preview mode", async () => {
      const candidateRes = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}/preview?mode=candidate`)
        .set(headersFacultyA);
      expect(candidateRes.status).toBe(200);
      expect(candidateRes.body.notes).toBeNull();

      const candidateJsonString = JSON.stringify(candidateRes.body);
      expect(candidateJsonString).not.toContain("CONFIDENTIAL");
      expect(candidateJsonString).not.toContain("INTERNAL FACULTY NOTE");
      expect(candidateJsonString).not.toContain("SLOT INTERNAL NOTE");

      for (const sec of candidateRes.body.sections) {
        for (const slot of sec.slots) {
          expect(slot.notes).toBeNull();
          expect(slot.revision.explanation).toBeUndefined();
          expect(slot.revision.suggestedAnswer).toBeUndefined();
          expect(slot.revision.analyses).toBeUndefined();
        }
      }
    });

    it("creates immutable paper versions and enforces optimistic concurrency control (409)", async () => {
      const paperBefore = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}`)
        .set(headersFacultyA);
      const currentConcurrency = paperBefore.body.concurrencyVersion;

      // Save version 1
      const saveV1 = await request(app)
        .post(`/api/v1/exam-papers/${examPaperId}/versions`)
        .set(headersFacultyA)
        .send({
          changeNote: "Initial complete 60-mark draft",
          concurrencyVersion: currentConcurrency,
        });
      expect(saveV1.status).toBe(201);
      expect(saveV1.body.versionNumber).toBe(1);

      // Stale concurrencyVersion -> 409 Conflict
      const staleSave = await request(app)
        .post(`/api/v1/exam-papers/${examPaperId}/versions`)
        .set(headersFacultyA)
        .send({
          changeNote: "Concurrent stale attempt",
          concurrencyVersion: currentConcurrency, // stale!
        });
      expect(staleSave.status).toBe(409);
    });
  });

  // =========================================================================
  // WORKFLOW E — Independent Approval Lifecycle
  // =========================================================================
  describe("Workflow E — Independent Approval Lifecycle", () => {
    it("blocks submission when validation errors exist (422)", async () => {
      // Create an empty invalid draft paper and try to submit it
      const badPaper = await request(app)
        .post("/api/v1/exam-papers")
        .set(headersFacultyA)
        .send({
          configId: examConfigId,
          title: "Incomplete Empty Draft",
          sections: [],
        });
      expect(badPaper.status).toBe(201);

      const submitBad = await request(app)
        .post(`/api/v1/exam-papers/${badPaper.body.id}/submit`)
        .set(headersFacultyA)
        .send({ notes: "Trying to submit invalid paper" });
      expect(submitBad.status).toBe(422);
      expect(submitBad.body.error).toMatch(/blocking validation error/i);
    });

    it("submits valid paper, blocks self-approval (403), blocks viewer role (403), blocks cross-tenant review (404), and requires rejection comments (422)", async () => {
      // 1. Submit valid paper as Faculty A
      const subRes = await request(app)
        .post(`/api/v1/exam-papers/${examPaperId}/submit`)
        .set(headersFacultyA)
        .send({ notes: "Submitted v1 for moderation" });
      expect(subRes.status).toBe(200);
      expect(subRes.body.status).toBe("SUBMITTED");
      firstSubmissionId = subRes.body.id;
      version1Id = subRes.body.paperVersionId;

      // 2. Editing or saving new version while SUBMITTED is blocked (409)
      const editWhileSubmitted = await request(app)
        .patch(`/api/v1/exam-papers/${examPaperId}`)
        .set(headersFacultyA)
        .send({ title: "Illegal edit while submitted" });
      expect(editWhileSubmitted.status).toBe(409);

      // 3. Self-approval attempt by Faculty A -> 403 Forbidden
      const selfApprove = await request(app)
        .post(`/api/v1/paper-submissions/${firstSubmissionId}/decision`)
        .set({
          ...headersFacultyA,
          "x-user-role": "MODERATOR", // Attempting role spoofing via header is ignored
        })
        .send({ decision: "APPROVED" });
      expect(selfApprove.status).toBe(403);
      expect(selfApprove.body.error).toMatch(/self-approval/i);

      // 4. Unauthorized role attempt (VIEWER) -> 403 Forbidden
      const viewerApprove = await request(app)
        .post(`/api/v1/paper-submissions/${firstSubmissionId}/decision`)
        .set(headersViewerA)
        .send({ decision: "APPROVED" });
      expect(viewerApprove.status).toBe(403);

      // 5. Cross-institution moderator attempt -> 404 Not Found
      const crossApprove = await request(app)
        .post(`/api/v1/paper-submissions/${firstSubmissionId}/decision`)
        .set(headersInstB)
        .send({ decision: "APPROVED" });
      expect(crossApprove.status).toBe(404);

      // 6. Rejection without comments -> 422 Unprocessable Entity
      const emptyReject = await request(app)
        .post(`/api/v1/paper-submissions/${firstSubmissionId}/decision`)
        .set(headersModeratorA)
        .send({ decision: "REJECTED", comments: "   " });
      expect(emptyReject.status).toBe(422);

      // 7. Legitimate rejection with comments by Moderator A
      const rejectRes = await request(app)
        .post(`/api/v1/paper-submissions/${firstSubmissionId}/decision`)
        .set(headersModeratorA)
        .send({
          decision: "REJECTED",
          comments: "Please update paper title to include Regulation R22.",
        });
      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.status).toBe("REJECTED");
    });

    it("allows editing a REJECTED paper, creates a new version snapshot (v2) on re-submission without mutating v1, and approves v2 independently", async () => {
      // 1. Edit the rejected paper -> transitions status back to DRAFT
      const editRes = await request(app)
        .patch(`/api/v1/exam-papers/${examPaperId}`)
        .set(headersFacultyA)
        .send({
          title: "Social Engineering (R22) Main Examination Paper",
        });
      expect(editRes.status).toBe(200);
      expect(editRes.body.status).toBe("DRAFT");

      // 2. Re-submit the revised paper -> automatically creates v2 snapshot!
      const resubRes = await request(app)
        .post(`/api/v1/exam-papers/${examPaperId}/submit`)
        .set(headersFacultyA)
        .send({ notes: "Updated title with R22 as requested" });
      expect(resubRes.status).toBe(200);
      secondSubmissionId = resubRes.body.id;
      version2Id = resubRes.body.paperVersionId;
      expect(secondSubmissionId).not.toBe(firstSubmissionId);
      expect(version2Id).not.toBe(version1Id);
      expect(resubRes.body.version.versionNumber).toBe(2);

      // 3. Verify v1 snapshot is preserved unchanged and side-by-side comparison works
      const compareRes = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}/versions/compare?versionA=1&versionB=2`)
        .set(headersFacultyA);
      expect(compareRes.status).toBe(200);
      expect(compareRes.body.versionA.title).toBe("Social Engineering Main Paper Draft");
      expect(compareRes.body.versionB.title).toBe(
        "Social Engineering (R22) Main Examination Paper",
      );

      // 4. Independent Moderator A approves Submission #2
      const approveRes = await request(app)
        .post(`/api/v1/paper-submissions/${secondSubmissionId}/decision`)
        .set(headersModeratorA)
        .send({
          decision: "APPROVED",
          comments: "Verified R22 header and CO coverage. Approved for printing.",
        });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe("APPROVED");

      // 5. Repeat decision on already decided submission -> 409 Conflict
      const repeatDecision = await request(app)
        .post(`/api/v1/paper-submissions/${secondSubmissionId}/decision`)
        .set(headersModeratorA)
        .send({ decision: "APPROVED" });
      expect(repeatDecision.status).toBe(409);
    });
  });

  // =========================================================================
  // WORKFLOW F — PDF Generation, Template Integrity, & Tamper Detection
  // =========================================================================
  describe("Workflow F — PDF Generation, Template Integrity, & Tamper Detection", () => {
    it("generates the CBIT college-template PDF for the approved paper, verifies SHA-256 integrity, and detects disk tampering", async () => {
      // 1. Generate PDF for the APPROVED paper
      const genPdfRes = await request(app)
        .post(`/api/v1/exam-papers/${examPaperId}/pdf/generate`)
        .set(headersModeratorA)
        .send({});
      expect(genPdfRes.status).toBe(201);
      expect(genPdfRes.body.paperVersionId).toBe(version2Id);
      expect(genPdfRes.body.templateId).toBe("cbit-autonomous-v1");
      expect(genPdfRes.body.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(genPdfRes.body.fileSizeBytes).toBeGreaterThan(1000);
      generatedPdfPath = genPdfRes.body.filePath;

      // 2. Idempotency: calling generate again without forceRegenerate returns the exact same artifact
      const idemRes = await request(app)
        .post(`/api/v1/exam-papers/${examPaperId}/pdf/generate`)
        .set(headersModeratorA)
        .send({ forceRegenerate: false });
      expect(idemRes.status).toBe(201);
      expect(idemRes.body.id).toBe(genPdfRes.body.id);

      // 3. Verify artifact metadata & SHA-256 integrity check (integrityVerified === true)
      const metaRes = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}/pdf`)
        .set(headersFacultyA);
      expect(metaRes.status).toBe(200);
      expect(metaRes.body.integrityVerified).toBe(true);
      expect(metaRes.body.actualChecksum).toBe(genPdfRes.body.checksumSha256);

      // 4. Download PDF and verify valid %PDF header
      const dlRes = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}/pdf/download`)
        .set(headersFacultyA)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => callback(null, Buffer.concat(chunks)));
        });
      expect(dlRes.status).toBe(200);
      expect(dlRes.headers["content-type"]).toContain("application/pdf");
      const pdfBytes = dlRes.body as Buffer;
      expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(pdfBytes.length).toBe(genPdfRes.body.fileSizeBytes);

      // 5. Simulate disk tampering -> verify integrityVerified becomes false
      const originalBytes = await fs.readFile(generatedPdfPath);
      await fs.writeFile(generatedPdfPath, Buffer.concat([originalBytes, Buffer.from("\n%TAMPER")]));

      const tamperedMetaRes = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}/pdf`)
        .set(headersFacultyA);
      expect(tamperedMetaRes.status).toBe(200);
      expect(tamperedMetaRes.body.integrityVerified).toBe(false);
      expect(tamperedMetaRes.body.actualChecksum).not.toBe(genPdfRes.body.checksumSha256);

      // Restore original bytes and confirm integrityVerified is true again
      await fs.writeFile(generatedPdfPath, originalBytes);
      const restoredMetaRes = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}/pdf`)
        .set(headersFacultyA);
      expect(restoredMetaRes.body.integrityVerified).toBe(true);

      // 6. Cross-institution PDF access is blocked (404)
      const crossPdfMeta = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}/pdf`)
        .set(headersInstB);
      expect(crossPdfMeta.status).toBe(404);

      const crossPdfDl = await request(app)
        .get(`/api/v1/exam-papers/${examPaperId}/pdf/download`)
        .set(headersInstB);
      expect(crossPdfDl.status).toBe(404);
    });
  });

  // =========================================================================
  // SECURITY C & A — Input Validation, Malformed Payloads, & Production Guard
  // =========================================================================
  describe("Security Verification — Input Validation & Auth Guards", () => {
    it("rejects missing or invalid x-institution-id header with 401", async () => {
      const noHeader = await request(app).get("/api/v1/subjects");
      expect(noHeader.status).toBe(401);

      const badUuidHeader = await request(app)
        .get("/api/v1/subjects")
        .set("x-institution-id", "not-a-valid-uuid");
      expect(badUuidHeader.status).toBe(401);
    });

    it("rejects invalid UUID params, negative/excessive marks, invalid enums, and oversized inputs with 400", async () => {
      // Invalid UUID route param
      const badParam = await request(app)
        .get("/api/v1/exam-papers/invalid-uuid-param")
        .set(headersFacultyA);
      expect(badParam.status).toBe(400);

      // Negative marks
      const negMarks = await request(app)
        .post("/api/v1/questions")
        .set(headersFacultyA)
        .send({
          subjectId: subjectAId,
          questionText: "Negative marks test",
          questionType: "SHORT_ANSWER",
          marks: -5,
          language: "en",
        });
      expect(negMarks.status).toBe(400);

      // Excessive marks (> 999.99)
      const hugeMarks = await request(app)
        .post("/api/v1/questions")
        .set(headersFacultyA)
        .send({
          subjectId: subjectAId,
          questionText: "Excessive marks test",
          questionType: "SHORT_ANSWER",
          marks: 50000,
          language: "en",
        });
      expect(hugeMarks.status).toBe(400);

      // Invalid enum value
      const badEnum = await request(app)
        .post("/api/v1/questions")
        .set(headersFacultyA)
        .send({
          subjectId: subjectAId,
          questionText: "Invalid enum test",
          questionType: "INVALID_TYPE",
          marks: 5,
          language: "en",
        });
      expect(badEnum.status).toBe(400);

      // Oversized string (> 10000 chars)
      const oversized = await request(app)
        .post("/api/v1/questions")
        .set(headersFacultyA)
        .send({
          subjectId: subjectAId,
          questionText: "X".repeat(10050),
          questionType: "SHORT_ANSWER",
          marks: 5,
          language: "en",
        });
      expect(oversized.status).toBe(400);
    });

    it("blocks dev header authentication when NODE_ENV is production (401)", async () => {
      const originalNodeEnv = process.env["NODE_ENV"];
      try {
        process.env["NODE_ENV"] = "production";
        const prodRes = await request(app)
          .get("/api/v1/subjects")
          .set({
            "x-institution-id": INST_A_ID,
            "x-user-id": FACULTY_A_ID,
            "x-user-role": "EXAMINER",
          });
        expect(prodRes.status).toBe(401);
        expect(prodRes.body.error).toMatch(/unavailable in production/i);
      } finally {
        process.env["NODE_ENV"] = originalNodeEnv;
      }
    });
  });
});
