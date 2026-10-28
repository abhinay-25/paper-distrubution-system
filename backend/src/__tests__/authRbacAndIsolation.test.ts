/**
 * Step 6 — Real Authentication, Role-Based Access Control (RBAC) & Institution Isolation Tests
 *
 * Verifies against the real PostgreSQL database and Express HTTP pipeline:
 *  1. Authentication:
 *     - Login with valid credentials (HttpOnly cookie + profile response)
 *     - Login with invalid password (generic 401 message)
 *     - Login with unknown account (generic 401 message)
 *     - Login brute-force protection (429 after repeated failures)
 *     - Protected endpoints reject unauthenticated requests (even with dev headers)
 *     - Tampered or expired session tokens are rejected (401)
 *     - Logout invalidates session server-side (replaying cookie fails with 401)
 *     - Passwords stored as bcrypt hashes and never leaked in API responses
 *  2. Role-Based Access Control (RBAC):
 *     - Faculty (EXAMINER) can manage questions, run AI generation, promote candidates, and prepare/submit papers
 *     - Faculty (EXAMINER) cannot approve papers (even if spoofing `x-user-role: MODERATOR` header)
 *     - Exam Controller (EXAM_CONTROLLER) can manage exams/papers but cannot approve papers or manage memberships
 *     - Reviewer (MODERATOR) can review and approve/reject papers and generate/download PDFs
 *     - Reviewer (MODERATOR) cannot approve their own submission (403 Self-approval prohibited)
 *     - Reviewer (MODERATOR) and Viewer (VIEWER) cannot create, modify, or submit papers (403)
 *     - Only Institution Admin (INSTITUTION_ADMIN) can invoke `/api/v1/institutions/memberships`
 *  3. Institution Isolation:
 *     - User from Institution A cannot read Institution B's questions
 *     - User from Institution A cannot modify Institution B's paper
 *     - User from Institution A cannot read Institution B's submissions
 *     - User from Institution A cannot download Institution B's PDF
 *     - Changing `x-institution-id` header to Institution B returns 403 Forbidden
 *     - Dashboard metrics never include another institution's data
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import fs from "node:fs/promises";
import { createApp } from "../app.js";
import { db } from "../lib/prisma.js";
import {
  hashPassword,
  createSessionToken,
  resetLoginRateLimiter,
  clearRevokedSessions,
} from "../services/authService.js";
import { aiClient } from "../services/aiClient.js";

const app = createApp();

// Dedicated UUIDs for Step 6 verification
const INST_A_ID = "66666666-6666-4666-8666-666666666101";
const INST_B_ID = "66666666-6666-4666-8666-666666666102";

const ADMIN_A_ID = "66666666-6666-4666-8666-666666666201";
const COE_A_ID = "66666666-6666-4666-8666-666666666202";
const FACULTY_A_ID = "66666666-6666-4666-8666-666666666203";
const REVIEWER_A_ID = "66666666-6666-4666-8666-666666666204";
const VIEWER_A_ID = "66666666-6666-4666-8666-666666666205";
const ADMIN_B_ID = "66666666-6666-4666-8666-666666666206";
const REVIEWER_B_ID = "66666666-6666-4666-8666-666666666207";

const TEST_PASSWORD = "Step6SecurePassword!2026";

let cookieAdminA = "";
let cookieCoeA = "";
let cookieFacultyA = "";
let cookieReviewerA = "";
let cookieViewerA = "";
let cookieAdminB = "";
let cookieReviewerB = "";

let subjectAId = "";
let topicAId = "";
let questionAId = "";
let revisionAId = "";
let configAId = "";
let paperAId = "";
let submissionAId = "";

let subjectBId = "";
let topicBId = "";
let questionBId = "";
let revisionBId = "";
let configBId = "";
let paperBId = "";
let submissionBId = "";
let pdfArtifactBPath = "";

function extractSessionCookie(res: request.Response): string {
  const rawSetCookie = res.headers["set-cookie"];
  const cookies = Array.isArray(rawSetCookie)
    ? rawSetCookie
    : typeof rawSetCookie === "string"
    ? [rawSetCookie]
    : [];
  const match = cookies.find((c) => c.startsWith("pds_session="));
  expect(match).toBeDefined();
  return match!.split(";")[0]!;
}

async function cleanupStep6Data() {
  const instIds = [INST_A_ID, INST_B_ID];
  await db.paperPdfArtifact.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.paperSubmission.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.examPaper.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.examConfiguration.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.questionGenerationJob.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.question.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.topic.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.subject.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.auditLog.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.institutionMembership.deleteMany({ where: { institutionId: { in: instIds } } });
  await db.user.deleteMany({
    where: {
      email: {
        in: [
          "admin.a@step6.test",
          "coe.a@step6.test",
          "faculty.a@step6.test",
          "reviewer.a@step6.test",
          "viewer.a@step6.test",
          "admin.b@step6.test",
          "reviewer.b@step6.test",
          "provisioned.faculty@step6.test",
        ],
      },
    },
  });
  await db.institution.deleteMany({ where: { id: { in: instIds } } });
}

describe("Step 6 — Authentication, RBAC & Institution Isolation Suite", () => {
  beforeAll(async () => {
    await cleanupStep6Data();
    resetLoginRateLimiter();
    clearRevokedSessions();

    const hashedPassword = await hashPassword(TEST_PASSWORD);

    await db.institution.createMany({
      data: [
        {
          id: INST_A_ID,
          slug: "step6-cbit-a",
          name: "CBIT Autonomous Tenant A",
          status: "ACTIVE",
        },
        {
          id: INST_B_ID,
          slug: "step6-other-b",
          name: "Other University Tenant B",
          status: "ACTIVE",
        },
      ],
    });

    await db.user.createMany({
      data: [
        {
          id: ADMIN_A_ID,
          email: "admin.a@step6.test",
          displayName: "Institution Admin A",
          hashedPassword,
          isActive: true,
        },
        {
          id: COE_A_ID,
          email: "coe.a@step6.test",
          displayName: "Exam Controller A",
          hashedPassword,
          isActive: true,
        },
        {
          id: FACULTY_A_ID,
          email: "faculty.a@step6.test",
          displayName: "Faculty Setter A",
          hashedPassword,
          isActive: true,
        },
        {
          id: REVIEWER_A_ID,
          email: "reviewer.a@step6.test",
          displayName: "Independent Reviewer A",
          hashedPassword,
          isActive: true,
        },
        {
          id: VIEWER_A_ID,
          email: "viewer.a@step6.test",
          displayName: "Audit Viewer A",
          hashedPassword,
          isActive: true,
        },
        {
          id: ADMIN_B_ID,
          email: "admin.b@step6.test",
          displayName: "Institution Admin B",
          hashedPassword,
          isActive: true,
        },
        {
          id: REVIEWER_B_ID,
          email: "reviewer.b@step6.test",
          displayName: "Independent Reviewer B",
          hashedPassword,
          isActive: true,
        },
      ],
    });

    await db.institutionMembership.createMany({
      data: [
        { institutionId: INST_A_ID, userId: ADMIN_A_ID, role: "INSTITUTION_ADMIN", status: "ACTIVE" },
        { institutionId: INST_A_ID, userId: COE_A_ID, role: "EXAM_CONTROLLER", status: "ACTIVE" },
        { institutionId: INST_A_ID, userId: FACULTY_A_ID, role: "EXAMINER", status: "ACTIVE" },
        { institutionId: INST_A_ID, userId: REVIEWER_A_ID, role: "MODERATOR", status: "ACTIVE" },
        { institutionId: INST_A_ID, userId: VIEWER_A_ID, role: "VIEWER", status: "ACTIVE" },
        { institutionId: INST_B_ID, userId: ADMIN_B_ID, role: "INSTITUTION_ADMIN", status: "ACTIVE" },
        { institutionId: INST_B_ID, userId: REVIEWER_B_ID, role: "MODERATOR", status: "ACTIVE" },
      ],
    });
  });

  afterAll(async () => {
    if (pdfArtifactBPath) {
      await fs.unlink(pdfArtifactBPath).catch(() => {});
    }
    await cleanupStep6Data();
  });

  beforeEach(() => {
    resetLoginRateLimiter();
  });

  // =========================================================================
  // 1. AUTHENTICATION TESTS
  // =========================================================================
  describe("1. Authentication & Session Lifecycle", () => {
    it("stores passwords as bcrypt hashes and never stores plaintext", async () => {
      const dbUser = await db.user.findUnique({ where: { id: FACULTY_A_ID } });
      expect(dbUser).toBeDefined();
      expect(dbUser!.hashedPassword).not.toBe(TEST_PASSWORD);
      expect(dbUser!.hashedPassword).toMatch(/^\$2[aby]\$\d{2}\$/);
    });

    it("logs in all role personas with valid credentials, sets HttpOnly cookie, and omits sensitive fields", async () => {
      const loginAdminA = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "admin.a@step6.test", password: TEST_PASSWORD });
      expect(loginAdminA.status).toBe(200);
      expect(loginAdminA.headers["set-cookie"]?.[0]).toContain("HttpOnly");
      expect(loginAdminA.headers["set-cookie"]?.[0]).toContain("SameSite=Lax");
      expect(loginAdminA.body.user.email).toBe("admin.a@step6.test");
      expect(loginAdminA.body.user.hashedPassword).toBeUndefined();
      expect(loginAdminA.body.activeMembership.institutionId).toBe(INST_A_ID);
      expect(loginAdminA.body.activeMembership.role).toBe("INSTITUTION_ADMIN");
      expect(loginAdminA.body.permissions).toContain("memberships:manage");
      cookieAdminA = extractSessionCookie(loginAdminA);

      const loginCoeA = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "coe.a@step6.test", password: TEST_PASSWORD });
      expect(loginCoeA.status).toBe(200);
      expect(loginCoeA.body.activeMembership.role).toBe("EXAM_CONTROLLER");
      cookieCoeA = extractSessionCookie(loginCoeA);

      const loginFacultyA = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "faculty.a@step6.test", password: TEST_PASSWORD });
      expect(loginFacultyA.status).toBe(200);
      expect(loginFacultyA.body.activeMembership.role).toBe("EXAMINER");
      cookieFacultyA = extractSessionCookie(loginFacultyA);

      const loginReviewerA = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "reviewer.a@step6.test", password: TEST_PASSWORD });
      expect(loginReviewerA.status).toBe(200);
      expect(loginReviewerA.body.activeMembership.role).toBe("MODERATOR");
      cookieReviewerA = extractSessionCookie(loginReviewerA);

      const loginViewerA = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "viewer.a@step6.test", password: TEST_PASSWORD });
      expect(loginViewerA.status).toBe(200);
      expect(loginViewerA.body.activeMembership.role).toBe("VIEWER");
      cookieViewerA = extractSessionCookie(loginViewerA);

      const loginAdminB = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "admin.b@step6.test", password: TEST_PASSWORD });
      expect(loginAdminB.status).toBe(200);
      expect(loginAdminB.body.activeMembership.institutionId).toBe(INST_B_ID);
      cookieAdminB = extractSessionCookie(loginAdminB);

      const loginReviewerB = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "reviewer.b@step6.test", password: TEST_PASSWORD });
      expect(loginReviewerB.status).toBe(200);
      cookieReviewerB = extractSessionCookie(loginReviewerB);
    });

    it("retrieves current user via GET /api/v1/auth/me without leaking password hashes", async () => {
      const meRes = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", cookieFacultyA);
      expect(meRes.status).toBe(200);
      expect(meRes.body.user.id).toBe(FACULTY_A_ID);
      expect(meRes.body.user.hashedPassword).toBeUndefined();
      expect(meRes.body.activeMembership.institutionId).toBe(INST_A_ID);
      expect(meRes.body.activeMembership.role).toBe("EXAMINER");
    });

    it("rejects login with invalid password or unknown account using identical generic 401 messages", async () => {
      const badPwdRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "faculty.a@step6.test", password: "WrongPassword123!" });
      expect(badPwdRes.status).toBe(401);
      expect(badPwdRes.body.error).toBe("Invalid email or password");

      const unknownAcctRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "nonexistent.user@step6.test", password: TEST_PASSWORD });
      expect(unknownAcctRes.status).toBe(401);
      expect(unknownAcctRes.body.error).toBe("Invalid email or password");
    });

    it("enforces login brute-force rate limiting (429 Too Many Requests)", async () => {
      for (let i = 0; i < 8; i++) {
        const res = await request(app)
          .post("/api/v1/auth/login")
          .send({ email: "ratelimit.target@step6.test", password: "WrongPassword!" });
        expect(res.status).toBe(401);
      }

      const lockedRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "ratelimit.target@step6.test", password: "WrongPassword!" });
      expect(lockedRes.status).toBe(429);
      expect(lockedRes.body.error).toMatch(/too many failed sign-in attempts/i);
    });

    it("rejects protected endpoints without authentication even when legacy dev headers are supplied", async () => {
      const noAuthRes = await request(app).get("/api/v1/subjects");
      expect(noAuthRes.status).toBe(401);

      const spoofedHeadersRes = await request(app)
        .get("/api/v1/subjects")
        .set({
          "x-institution-id": INST_A_ID,
          "x-user-id": ADMIN_A_ID,
          "x-user-role": "INSTITUTION_ADMIN",
        });
      expect(spoofedHeadersRes.status).toBe(401);
    });

    it("rejects tampered and expired session tokens with 401", async () => {
      const tamperedRes = await request(app)
        .get("/api/v1/subjects")
        .set("Cookie", `${cookieFacultyA}tampered`);
      expect(tamperedRes.status).toBe(401);

      const expiredToken = createSessionToken({
        userId: FACULTY_A_ID,
        institutionId: INST_A_ID,
        ttlMs: -5000, // already expired
      }).token;

      const expiredRes = await request(app)
        .get("/api/v1/subjects")
        .set("Authorization", `Bearer ${expiredToken}`);
      expect(expiredRes.status).toBe(401);
    });

    it("invalidates session server-side on logout so replaying the cookie fails with 401", async () => {
        const tempLogin = await request(app)
          .post("/api/v1/auth/login")
          .send({ email: "faculty.a@step6.test", password: TEST_PASSWORD });
        expect(tempLogin.status).toBe(200);
        const tempCookie = extractSessionCookie(tempLogin);

        // Works before logout
        const beforeLogout = await request(app)
          .get("/api/v1/auth/me")
          .set("Cookie", tempCookie);
        expect(beforeLogout.status).toBe(200);

        // Logout
        const logoutRes = await request(app)
          .post("/api/v1/auth/logout")
          .set("Cookie", tempCookie);
        expect(logoutRes.status).toBe(200);

        // Replay old cookie after logout -> 401
        const afterLogout = await request(app)
          .get("/api/v1/auth/me")
          .set("Cookie", tempCookie);
        expect(afterLogout.status).toBe(401);

        const apiAfterLogout = await request(app)
          .get("/api/v1/subjects")
          .set("Cookie", tempCookie);
        expect(apiAfterLogout.status).toBe(401);
      });
  });

  // =========================================================================
  // 2. ROLE-BASED ACCESS CONTROL (RBAC) TESTS
  // =========================================================================
  describe("2. Role-Based Access Control (RBAC)", () => {
    it("allows Faculty (EXAMINER) to create subjects, topics, questions, run AI generation, and promote candidates", async () => {
      const subRes = await request(app)
        .post("/api/v1/subjects")
        .set("Cookie", cookieFacultyA)
        .send({
          name: "Network Security",
          code: "22CSC31",
          description: "CBIT R22 Network Security",
        });
      expect(subRes.status).toBe(201);
      subjectAId = subRes.body.id;

      const topRes = await request(app)
        .post(`/api/v1/subjects/${subjectAId}/topics`)
        .set("Cookie", cookieFacultyA)
        .send({ name: "Unit I: Cryptographic Primitives", code: "CO1", sequenceOrder: 1 });
      expect(topRes.status).toBe(201);
      topicAId = topRes.body.id;

      const qRes = await request(app)
        .post("/api/v1/questions")
        .set("Cookie", cookieFacultyA)
        .send({
          subjectId: subjectAId,
          questionText: "Explain the avalanche effect in block ciphers.",
          questionType: "SHORT_ANSWER",
          marks: 10,
          difficulty: "MEDIUM",
          topicIds: [topicAId],
          lifecycle: "ACTIVE",
        });
      expect(qRes.status).toBe(201);
      questionAId = qRes.body.id;
      revisionAId = qRes.body.currentRevision.id;

      // AI Generation & Candidate Promotion
      const spyGen = vi.spyOn(aiClient, "generateQuestions").mockResolvedValueOnce({
        requestId: "req-step6-gen",
        contractVersion: "1.0",
        operation: "question_generation",
        provider: { name: "gemini", model: "gemini-3.8-flash" },
        durationMs: 140,
        result: {
          questions: [
            {
              questionText: "Compare symmetric and asymmetric key distribution protocols.",
              suggestedAnswer: "Symmetric uses KDC; asymmetric uses PKI.",
              explanation: "Key management scaling.",
              difficulty: "MEDIUM",
              bloomsLevel: "ANALYZE",
              subjectTags: ["cryptography"],
            },
          ],
        },
      } as any);

      const jobRes = await request(app)
        .post("/api/v1/generation-jobs")
        .set("Cookie", cookieFacultyA)
        .send({
          subjectId: subjectAId,
          topicId: topicAId,
          questionType: "SHORT_ANSWER",
          difficulty: "MEDIUM",
          count: 1,
          language: "en",
        });
      expect(jobRes.status).toBe(201);

      const candsRes = await request(app)
        .get(`/api/v1/generation-jobs/${jobRes.body.id}/questions`)
        .set("Cookie", cookieFacultyA);
      expect(candsRes.status).toBe(200);
      const candId = candsRes.body.data[0].id;

      const promoteRes = await request(app)
        .patch(`/api/v1/generation-jobs/${jobRes.body.id}/questions/${candId}/review`)
        .set("Cookie", cookieFacultyA)
        .send({
          reviewAction: "APPROVED",
          subjectId: subjectAId,
          topicIds: [topicAId],
          marks: 10,
        });
      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.promotedQuestionId).toBeTruthy();

      spyGen.mockRestore();
    });

    it("prevents Reviewer (MODERATOR) and Viewer (VIEWER) from creating/editing questions or running AI generation (403)", async () => {
      const modCreateQ = await request(app)
        .post("/api/v1/questions")
        .set("Cookie", cookieReviewerA)
        .send({
          subjectId: subjectAId,
          questionText: "Unauthorized moderator question",
          questionType: "SHORT_ANSWER",
          marks: 5,
        });
      expect(modCreateQ.status).toBe(403);

      const viewerGen = await request(app)
        .post("/api/v1/generation-jobs")
        .set("Cookie", cookieViewerA)
        .send({
          subjectId: subjectAId,
          questionType: "SHORT_ANSWER",
          count: 1,
        });
      expect(viewerGen.status).toBe(403);
    });

    it("allows Exam Controller (EXAM_CONTROLLER) and Faculty (EXAMINER) to prepare and submit papers, while blocking Reviewer (MODERATOR) and Viewer (VIEWER)", async () => {
      const cfgRes = await request(app)
        .post("/api/v1/exam-configs")
        .set("Cookie", cookieCoeA)
        .send({
          subjectId: subjectAId,
          name: "Mid-Semester Examination",
          totalMarks: 10,
          passingMarks: 4,
          durationMinutes: 60,
        });
      expect(cfgRes.status).toBe(201);
      configAId = cfgRes.body.id;

      // Moderator cannot create or modify papers
      const modCreatePaper = await request(app)
        .post("/api/v1/exam-papers")
        .set("Cookie", cookieReviewerA)
        .send({
          configId: configAId,
          title: "Moderator Unauthorized Paper",
          sections: [{ sectionLabel: "A", title: "Part A", sequenceOrder: 1 }],
        });
      expect(modCreatePaper.status).toBe(403);

      // Viewer cannot create or modify papers
      const viewerCreatePaper = await request(app)
        .post("/api/v1/exam-papers")
        .set("Cookie", cookieViewerA)
        .send({
          configId: configAId,
          title: "Viewer Unauthorized Paper",
          sections: [{ sectionLabel: "A", title: "Part A", sequenceOrder: 1 }],
        });
      expect(viewerCreatePaper.status).toBe(403);

      // Faculty creates and submits paper
      const paperRes = await request(app)
        .post("/api/v1/exam-papers")
        .set("Cookie", cookieFacultyA)
        .send({
          configId: configAId,
          title: "Network Security Mid-Sem Paper",
          sections: [{ sectionLabel: "A", title: "Part A", sequenceOrder: 1, requiredAnswers: 1 }],
        });
      expect(paperRes.status).toBe(201);
      paperAId = paperRes.body.id;
      const sectionId = paperRes.body.sections[0].id;

      const slotRes = await request(app)
        .post(`/api/v1/exam-papers/${paperAId}/sections/${sectionId}/slots`)
        .set("Cookie", cookieFacultyA)
        .send({
          questionId: questionAId,
          revisionId: revisionAId,
          sequenceOrder: 1,
          allocatedMarks: 10,
        });
      expect(slotRes.status).toBe(201);

      // Moderator cannot submit the paper
      const modSubmit = await request(app)
        .post(`/api/v1/exam-papers/${paperAId}/submit`)
        .set("Cookie", cookieReviewerA)
        .send({ notes: "Moderator trying to submit" });
      expect(modSubmit.status).toBe(403);

      // Faculty submits paper
      const subRes = await request(app)
        .post(`/api/v1/exam-papers/${paperAId}/submit`)
        .set("Cookie", cookieFacultyA)
        .send({ notes: "Ready for independent moderation" });
      expect(subRes.status).toBe(200);
      submissionAId = subRes.body.id;
    });

    it("prevents Faculty (EXAMINER) and Exam Controller (EXAM_CONTROLLER) from approving papers, even when spoofing x-user-role headers", async () => {
      // Exam Controller (not the submitter) attempts to approve -> 403 Forbidden
      const coeApprove = await request(app)
        .post(`/api/v1/paper-submissions/${submissionAId}/decision`)
        .set("Cookie", cookieCoeA)
        .set("x-user-role", "MODERATOR") // Spoofed header is ignored!
        .send({ decision: "APPROVED", comments: "COE trying to bypass independent review" });
      expect(coeApprove.status).toBe(403);
      expect(coeApprove.body.error).toMatch(/unauthorized|approver role/i);

      // Faculty (submitter) attempts to self-approve -> 403 Self-approval prohibited
      const facultySelfApprove = await request(app)
        .post(`/api/v1/paper-submissions/${submissionAId}/decision`)
        .set("Cookie", cookieFacultyA)
        .set("x-user-role", "INSTITUTION_ADMIN")
        .send({ decision: "APPROVED" });
      expect(facultySelfApprove.status).toBe(403);
      expect(facultySelfApprove.body.error).toMatch(/self-approval/i);
    });

    it("allows Reviewer (MODERATOR) to approve another user's submission, but prevents Reviewer from approving their own submission", async () => {
      // Reviewer A approves Faculty A's submission
      const approveRes = await request(app)
        .post(`/api/v1/paper-submissions/${submissionAId}/decision`)
        .set("Cookie", cookieReviewerA)
        .send({ decision: "APPROVED", comments: "Approved by Independent Reviewer A" });
      expect(approveRes.status).toBe(200);
      expect(approveRes.body.status).toBe("APPROVED");

      // Now Admin A creates & submits a paper, and tries to self-approve it -> 403 Self-approval prohibited
      const adminPaper = await request(app)
        .post("/api/v1/exam-papers")
        .set("Cookie", cookieAdminA)
        .send({
          configId: configAId,
          title: "Admin Authored Paper",
          sections: [{ sectionLabel: "A", title: "Part A", sequenceOrder: 1, requiredAnswers: 1 }],
        });
      expect(adminPaper.status).toBe(201);

      await request(app)
        .post(`/api/v1/exam-papers/${adminPaper.body.id}/sections/${adminPaper.body.sections[0].id}/slots`)
        .set("Cookie", cookieAdminA)
        .send({
          questionId: questionAId,
          revisionId: revisionAId,
          sequenceOrder: 1,
          allocatedMarks: 10,
        });

      const adminSub = await request(app)
        .post(`/api/v1/exam-papers/${adminPaper.body.id}/submit`)
        .set("Cookie", cookieAdminA)
        .send({ notes: "Admin submission" });
      expect(adminSub.status).toBe(200);

      const adminSelfApprove = await request(app)
        .post(`/api/v1/paper-submissions/${adminSub.body.id}/decision`)
        .set("Cookie", cookieAdminA)
        .send({ decision: "APPROVED" });
      expect(adminSelfApprove.status).toBe(403);
      expect(adminSelfApprove.body.error).toMatch(/self-approval/i);
    });

    it("restricts institution membership administration (/api/v1/institutions/memberships) strictly to INSTITUTION_ADMIN", async () => {
      for (const cookie of [cookieFacultyA, cookieCoeA, cookieReviewerA, cookieViewerA]) {
        const listDenied = await request(app)
          .get("/api/v1/institutions/memberships")
          .set("Cookie", cookie);
        expect(listDenied.status).toBe(403);

        const createDenied = await request(app)
          .post("/api/v1/institutions/memberships")
          .set("Cookie", cookie)
          .send({
            email: "blocked@step6.test",
            displayName: "Blocked User",
            password: TEST_PASSWORD,
            role: "EXAMINER",
          });
        expect(createDenied.status).toBe(403);
      }

      // Institution Admin A can list and provision memberships
      const listOk = await request(app)
        .get("/api/v1/institutions/memberships")
        .set("Cookie", cookieAdminA);
      expect(listOk.status).toBe(200);
      expect(listOk.body.data.length).toBeGreaterThanOrEqual(5);
      expect(JSON.stringify(listOk.body)).not.toContain("hashedPassword");

      const provisionOk = await request(app)
        .post("/api/v1/institutions/memberships")
        .set("Cookie", cookieAdminA)
        .send({
          email: "provisioned.faculty@step6.test",
          displayName: "Dr. Newly Provisioned Faculty",
          password: TEST_PASSWORD,
          role: "EXAMINER",
        });
      expect(provisionOk.status).toBe(201);
      expect(provisionOk.body.role).toBe("EXAMINER");
      expect(provisionOk.body.user.hashedPassword).toBeUndefined();
    });
  });

  // =========================================================================
  // 3. INSTITUTION ISOLATION TESTS
  // =========================================================================
  describe("3. Multi-Tenant Institution Isolation", () => {
    beforeAll(async () => {
      // Seed Institution B resources as Admin B & Reviewer B
      const subB = await request(app)
        .post("/api/v1/subjects")
        .set("Cookie", cookieAdminB)
        .send({ name: "Tenant B Cryptography", code: "TB101" });
      subjectBId = subB.body.id;

      const topB = await request(app)
        .post(`/api/v1/subjects/${subjectBId}/topics`)
        .set("Cookie", cookieAdminB)
        .send({ name: "Unit 1", code: "CO1", sequenceOrder: 1 });
      topicBId = topB.body.id;

      const qB = await request(app)
        .post("/api/v1/questions")
        .set("Cookie", cookieAdminB)
        .send({
          subjectId: subjectBId,
          questionText: "Tenant B confidential exam question.",
          questionType: "SHORT_ANSWER",
          marks: 10,
          topicIds: [topicBId],
          lifecycle: "ACTIVE",
        });
      questionBId = qB.body.id;
      revisionBId = qB.body.currentRevision.id;

      const cfgB = await request(app)
        .post("/api/v1/exam-configs")
        .set("Cookie", cookieAdminB)
        .send({
          subjectId: subjectBId,
          name: "Tenant B Exam",
          totalMarks: 10,
          durationMinutes: 60,
        });
      configBId = cfgB.body.id;

      const paperB = await request(app)
        .post("/api/v1/exam-papers")
        .set("Cookie", cookieAdminB)
        .send({
          configId: configBId,
          title: "Tenant B Secret Paper",
          sections: [{ sectionLabel: "A", title: "Part A", sequenceOrder: 1, requiredAnswers: 1 }],
        });
      paperBId = paperB.body.id;

      await request(app)
        .post(`/api/v1/exam-papers/${paperBId}/sections/${paperB.body.sections[0].id}/slots`)
        .set("Cookie", cookieAdminB)
        .send({
          questionId: questionBId,
          revisionId: revisionBId,
          sequenceOrder: 1,
          allocatedMarks: 10,
        });

      const subBRes = await request(app)
        .post(`/api/v1/exam-papers/${paperBId}/submit`)
        .set("Cookie", cookieAdminB)
        .send({ notes: "Tenant B submission" });
      submissionBId = subBRes.body.id;

      await request(app)
        .post(`/api/v1/paper-submissions/${submissionBId}/decision`)
        .set("Cookie", cookieReviewerB)
        .send({ decision: "APPROVED", comments: "Approved in Tenant B" });

      const pdfBRes = await request(app)
        .post(`/api/v1/exam-papers/${paperBId}/pdf/generate`)
        .set("Cookie", cookieReviewerB)
        .send({});
      expect(pdfBRes.status).toBe(201);
      pdfArtifactBPath = pdfBRes.body.filePath;
    });

    it("rejects changing x-institution-id header to another institution (403 Forbidden)", async () => {
      const switchHeaderRes = await request(app)
        .get("/api/v1/questions")
        .set("Cookie", cookieAdminA)
        .set("x-institution-id", INST_B_ID);
      expect(switchHeaderRes.status).toBe(403);
      expect(switchHeaderRes.body.error).toMatch(/access denied|membership/i);

      const switchEndpointRes = await request(app)
        .post("/api/v1/auth/switch-institution")
        .set("Cookie", cookieAdminA)
        .send({ institutionId: INST_B_ID });
      expect(switchEndpointRes.status).toBe(403);
    });

    it("prevents User from Institution A from reading Institution B's questions, modifying Institution B's paper, reading Institution B's submissions, or downloading Institution B's PDF", async () => {
      // 1. Cannot read Institution B's question
      const readQB = await request(app)
        .get(`/api/v1/questions/${questionBId}`)
        .set("Cookie", cookieAdminA);
      expect(readQB.status).toBe(404);

      // 2. Cannot modify Institution B's paper
      const modPaperB = await request(app)
        .patch(`/api/v1/exam-papers/${paperBId}`)
        .set("Cookie", cookieAdminA)
        .send({ title: "Cross-tenant hijack attempt" });
      expect(modPaperB.status).toBe(404);

      // 3. Cannot read Institution B's submission
      const readSubB = await request(app)
        .get(`/api/v1/paper-submissions/${submissionBId}`)
        .set("Cookie", cookieAdminA);
      expect(readSubB.status).toBe(404);

      // 4. Cannot download or view Institution B's PDF
      const metaPdfB = await request(app)
        .get(`/api/v1/exam-papers/${paperBId}/pdf`)
        .set("Cookie", cookieAdminA);
      expect(metaPdfB.status).toBe(404);

      const dlPdfB = await request(app)
        .get(`/api/v1/exam-papers/${paperBId}/pdf/download`)
        .set("Cookie", cookieAdminA);
      expect(dlPdfB.status).toBe(404);
    });

    it("scopes dashboard metrics strictly to the authenticated user's institution", async () => {
      const dashA = await request(app)
        .get("/api/v1/dashboard")
        .set("Cookie", cookieAdminA);
      expect(dashA.status).toBe(200);
      expect(dashA.body.institution.id).toBe(INST_A_ID);
      expect(dashA.body.subjects.total).toBe(1);

      const dashB = await request(app)
        .get("/api/v1/dashboard")
        .set("Cookie", cookieAdminB);
      expect(dashB.status).toBe(200);
      expect(dashB.body.institution.id).toBe(INST_B_ID);
      expect(dashB.body.subjects.total).toBe(1);
    });
  });
});

