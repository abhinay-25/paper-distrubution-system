import { db, closePrisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/authService.js";
import { createSubject } from "../src/services/subjectService.js";
import { createTopic } from "../src/services/topicService.js";
import { createQuestion } from "../src/services/questionService.js";
import {
  createExamConfig,
  createExamPaper,
  addQuestionSlot,
  submitExamPaper,
} from "../src/services/paperService.js";
import {
  listSubmissions,
  reviewSubmission,
  generateApprovedPaperPdf,
} from "../src/services/paperApprovalService.js";

const DEFAULT_DEV_INSTITUTION_ID = "a0000000-0000-4000-8000-000000000001";
const EXAMINER_ID = "u0000000-0000-4000-8000-000000000001";
const MODERATOR_ID = "u0000000-0000-4000-8000-000000000002";
const COE_ID = "u0000000-0000-4000-8000-000000000003";
const ADMIN_ID = "u0000000-0000-4000-8000-000000000004";
const VIEWER_ID = "u0000000-0000-4000-8000-000000000005";

async function main() {
  if (process.env["NODE_ENV"] === "production" && process.env["ALLOW_PROD_SEED"] !== "true") {
    console.error(
      "❌ Refusing to run development seed script when NODE_ENV=production (set ALLOW_PROD_SEED=true only if intentional).",
    );
    process.exit(1);
  }

  const seedPassword =
    process.env["DEMO_SEED_PASSWORD"] ||
    (process.env["NODE_ENV"] !== "production" ? "CbitDemo@2026!" : "");

  if (!seedPassword || seedPassword.length < 8) {
    console.error(
      "❌ DEMO_SEED_PASSWORD (at least 8 chars) is required when seeding in production.",
    );
    process.exit(1);
  }

  console.log("🌱 Seeding database for Review 2 live demonstration...");

  // 1. Upsert the CBIT dev institution
  const institution = await db.institution.upsert({
    where: { id: DEFAULT_DEV_INSTITUTION_ID },
    update: {
      name: "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)",
      status: "ACTIVE",
    },
    create: {
      id: DEFAULT_DEV_INSTITUTION_ID,
      slug: "cbit-autonomous",
      name: "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)",
      status: "ACTIVE",
    },
  });
  console.log(`✅ Institution ready: ${institution.name} (${institution.id})`);

  // 2. Upsert the institutional role accounts with real bcrypt password hashes
  const hashedSeedPassword = await hashPassword(seedPassword);

  const users = [
    {
      id: ADMIN_ID,
      email: "admin@cbit.ac.in",
      displayName: "Prof. C. V. Narasimhulu (Institution Admin)",
      role: "INSTITUTION_ADMIN" as const,
    },
    {
      id: COE_ID,
      email: "coe@cbit.ac.in",
      displayName: "Dr. P. Ravinder Reddy (Exam Controller)",
      role: "EXAM_CONTROLLER" as const,
    },
    {
      id: EXAMINER_ID,
      email: "examiner@cbit.ac.in",
      displayName: "Dr. R. Srinivas (Faculty / Question Setter)",
      role: "EXAMINER" as const,
    },
    {
      id: MODERATOR_ID,
      email: "moderator@cbit.ac.in",
      displayName: "Prof. K. Madhavi (Reviewer / Approver)",
      role: "MODERATOR" as const,
    },
    {
      id: VIEWER_ID,
      email: "viewer@cbit.ac.in",
      displayName: "Academic Audit Observer (Viewer)",
      role: "VIEWER" as const,
    },
  ];

  for (const u of users) {
    await db.user.upsert({
      where: { id: u.id },
      update: {
        email: u.email,
        displayName: u.displayName,
        hashedPassword: hashedSeedPassword,
        isActive: true,
      },
      create: {
        id: u.id,
        email: u.email,
        hashedPassword: hashedSeedPassword,
        displayName: u.displayName,
        isActive: true,
      },
    });
    await db.institutionMembership.upsert({
      where: {
        institutionId_userId: {
          institutionId: DEFAULT_DEV_INSTITUTION_ID,
          userId: u.id,
        },
      },
      update: { role: u.role, status: "ACTIVE" },
      create: {
        institutionId: DEFAULT_DEV_INSTITUTION_ID,
        userId: u.id,
        role: u.role,
        status: "ACTIVE",
      },
    });
  }
  console.log("✅ Institution Admin, Exam Controller, Faculty Examiner, Moderator, and Viewer accounts seeded.");

  // Check if papers already exist for Subject 22CIE18 so seed is idempotent
  const existingPapersCount = await db.examPaper.count({
    where: { institutionId: DEFAULT_DEV_INSTITUTION_ID },
  });
  if (existingPapersCount > 0) {
    console.log("ℹ️  Demo CBIT Social Engineering data and papers already seeded. Skipping duplicate creation.");
    return;
  }

  // Clean up any partial subject from interrupted seed
  await db.examConfiguration.deleteMany({ where: { institutionId: DEFAULT_DEV_INSTITUTION_ID } });
  await db.question.deleteMany({ where: { institutionId: DEFAULT_DEV_INSTITUTION_ID } });
  await db.topic.deleteMany({ where: { institutionId: DEFAULT_DEV_INSTITUTION_ID } });
  await db.subject.deleteMany({ where: { institutionId: DEFAULT_DEV_INSTITUTION_ID } });

  // 3. Create Subject: 22CIE18 - Social Engineering
  const subject = await createSubject(DEFAULT_DEV_INSTITUTION_ID, {
    code: "22CIE18",
    name: "Social Engineering",
    description:
      "B.E. (CSE-AIML, AIML, AIDS, CET) VII Semester Professional Elective — Psychological manipulation, OSINT, phishing vectors, attack detection, and organizational defense strategies.",
  });

  // 4. Create 5 Syllabus Units/Topics
  const unitData = [
    {
      code: "UNIT-I",
      name: "Unit I: Introduction & Psychology of Social Engineering",
      description: "Threat landscape, cognitive biases, ethical vs unethical social engineering, awareness training.",
    },
    {
      code: "UNIT-II",
      name: "Unit II: Open Source Intelligence (OSINT)",
      description: "OSINT methodologies, organizational OSINT, legal and ethical boundaries, cost reduction in intelligence.",
    },
    {
      code: "UNIT-III",
      name: "Unit III: Technical & Communication Attack Vectors",
      description: "Phishing, spear phishing, P2P file-sharing abuse, scareware, worms vs viruses, email/IM malware links.",
    },
    {
      code: "UNIT-IV",
      name: "Unit IV: Attack Detection, Measurement & Social Media Analysis",
      description: "Early attack detection, incident measurement challenges, OSINT software for social media analysis.",
    },
    {
      code: "UNIT-V",
      name: "Unit V: Defense Strategies & Organizational Hardening",
      description: "Reputation monitoring, VPN security, multi-factor authentication (MFA), software patching & awareness.",
    },
  ];

  const topics = [];
  for (const t of unitData) {
    const created = await createTopic(DEFAULT_DEV_INSTITUTION_ID, subject.id, t);
    topics.push(created);
  }
  console.log(`✅ Created subject ${subject.code} with ${topics.length} syllabus units.`);

  // 5. Create 15 CBIT Social Engineering Questions (5 Part-A 2-mark + 10 Part-B 5-mark)
  const partAData = [
    {
      text: "Explain why social engineering is considered a major security threat.",
      topicIdx: 0,
      difficulty: "EASY" as const,
    },
    {
      text: "Give one major challenge of OSINT.",
      topicIdx: 1,
      difficulty: "EASY" as const,
    },
    {
      text: "Define phishing and distinguish it from spear phishing.",
      topicIdx: 2,
      difficulty: "EASY" as const,
    },
    {
      text: "Define what is meant by measurement in social engineering attack detection.",
      topicIdx: 3,
      difficulty: "MEDIUM" as const,
    },
    {
      text: "What is the purpose of awareness programs in social engineering defense?",
      topicIdx: 4,
      difficulty: "EASY" as const,
    },
  ];

  const partBData = [
    {
      text: "Assess the effectiveness of training programs in reducing social engineering attempts.",
      topicIdx: 0,
      difficulty: "MEDIUM" as const,
    },
    {
      text: "Compare ethical and unethical uses of social engineering in cybersecurity.",
      topicIdx: 0,
      difficulty: "MEDIUM" as const,
    },
    {
      text: "Explain the contribution of organizational OSINT efforts in global security.",
      topicIdx: 1,
      difficulty: "MEDIUM" as const,
    },
    {
      text: "Differentiate between legal and ethical issues in OSINT.",
      topicIdx: 1,
      difficulty: "MEDIUM" as const,
    },
    {
      text: "Explain how attackers misuse file-sharing systems in P2P attacks.",
      topicIdx: 2,
      difficulty: "MEDIUM" as const,
    },
    {
      text: "Explain how scareware manipulates user emotions to compromise endpoint security.",
      topicIdx: 2,
      difficulty: "MEDIUM" as const,
    },
    {
      text: "Explain why early detection of social engineering attacks is important for enterprise incident response.",
      topicIdx: 3,
      difficulty: "HARD" as const,
    },
    {
      text: "Describe how social media platforms can be analyzed using OSINT software.",
      topicIdx: 3,
      difficulty: "HARD" as const,
    },
    {
      text: "Explain how reputation monitoring and multi-factor authentication prevent social engineering account takeovers.",
      topicIdx: 4,
      difficulty: "MEDIUM" as const,
    },
    {
      text: "Explain how using a VPN and keeping software updated contribute to safe network and device security.",
      topicIdx: 4,
      difficulty: "MEDIUM" as const,
    },
  ];

  const partAQuestions = [];
  for (const q of partAData) {
    const created = await createQuestion(DEFAULT_DEV_INSTITUTION_ID, {
      subjectId: subject.id,
      questionText: q.text,
      questionType: "SHORT_ANSWER",
      marks: 2,
      difficulty: q.difficulty,
      explanation: "Model answer key verified against CBIT R22 curriculum.",
      topicIds: [topics[q.topicIdx]!.id],
    });
    partAQuestions.push(created);
  }

  const partBQuestions = [];
  for (const q of partBData) {
    const created = await createQuestion(DEFAULT_DEV_INSTITUTION_ID, {
      subjectId: subject.id,
      questionText: q.text,
      questionType: "LONG_ANSWER",
      marks: 5,
      difficulty: q.difficulty,
      explanation: "Evaluate analytical depth, real-world cybersecurity examples, and structured mitigation steps.",
      topicIds: [topics[q.topicIdx]!.id],
    });
    partBQuestions.push(created);
  }
  console.log(`✅ Created ${partAQuestions.length + partBQuestions.length} CBIT Social Engineering questions.`);

  // 6. Create Examination Configuration (CBIT 60 Marks, 3 Hours)
  const examConfig = await createExamConfig(DEFAULT_DEV_INSTITUTION_ID, {
    subjectId: subject.id,
    name: "B.E. (CET) VII Sem (Main) Examination November 2025",
    description: "CBIT Autonomous R22 End-Semester Examination (Part-A: 10 Marks, Part-B: 50 Marks)",
    durationMinutes: 180,
    totalMarks: 60,
    passingMarks: 24,
    instructions:
      "Answer ALL questions from Part-A and Part-B (including internal choices) at one place and in the same order as in the question paper.",
  });

  // 7. Create Paper 1 — Approved Paper with Generated CBIT PDF
  const approvedPaper = await createExamPaper(DEFAULT_DEV_INSTITUTION_ID, {
    configId: examConfig.id,
    title: "B.E. (CET) VII Sem (Main) — Social Engineering (22CIE18) — Nov 2025",
    notes: "Main Examination Paper (Set-A) following CBIT Autonomous R22 pattern.",
    sections: [
      {
        sectionLabel: "Part - A",
        title: "Short Answer Questions",
        description: "Answer ALL questions (5 × 2 = 10 Marks)",
        sequenceOrder: 1,
        requiredAnswers: 5,
      },
      {
        sectionLabel: "Part - B",
        title: "Descriptive Questions",
        description: "Answer ALL questions (10 × 5 = 50 Marks)",
        sequenceOrder: 2,
        requiredAnswers: 10,
      },
    ],
  });

  const secA1 = approvedPaper.sections[0]!;
  const secB1 = approvedPaper.sections[1]!;

  for (let i = 0; i < partAQuestions.length; i++) {
    const q = partAQuestions[i]!;
    await addQuestionSlot(DEFAULT_DEV_INSTITUTION_ID, approvedPaper.id, secA1.id, {
      questionId: q.id,
      revisionId: q.currentRevision!.id,
      sequenceOrder: i + 1,
      allocatedMarks: 2,
    });
  }

  for (let i = 0; i < partBQuestions.length; i++) {
    const q = partBQuestions[i]!;
    await addQuestionSlot(DEFAULT_DEV_INSTITUTION_ID, approvedPaper.id, secB1.id, {
      questionId: q.id,
      revisionId: q.currentRevision!.id,
      sequenceOrder: i + 1,
      allocatedMarks: 5,
    });
  }

  await submitExamPaper(
    DEFAULT_DEV_INSTITUTION_ID,
    approvedPaper.id,
    "Submitted by Faculty Examiner for November 2025 Main Examination.",
    EXAMINER_ID,
  );

  const subQueue = await listSubmissions(DEFAULT_DEV_INSTITUTION_ID, { page: 1, pageSize: 10 });
  const firstSub = subQueue.data.find((s) => s.paperId === approvedPaper.id);
  if (firstSub) {
    await reviewSubmission(DEFAULT_DEV_INSTITUTION_ID, firstSub.id, MODERATOR_ID, "MODERATOR", {
      decision: "APPROVED",
      comments: "Verified all 5 syllabus units, CO mappings, and mark totals (60M). Approved for printing.",
    });
    const pdfArtifact = await generateApprovedPaperPdf(
      DEFAULT_DEV_INSTITUTION_ID,
      approvedPaper.id,
      MODERATOR_ID,
      { forceRegenerate: true },
    );
    console.log(`✅ Approved Paper & CBIT PDF generated: ${pdfArtifact.fileName} (${pdfArtifact.fileSizeBytes} bytes)`);
  }

  // 8. Create Paper 2 — Submitted Paper in Approval Queue (for live Review 2 Moderator approval demo)
  const pendingPaper = await createExamPaper(DEFAULT_DEV_INSTITUTION_ID, {
    configId: examConfig.id,
    title: "B.E. (CSE-AIML) VII Sem (Suppl) — Social Engineering (22CIE18) — Dec 2025",
    notes: "Supplementary Examination Paper (Set-B) awaiting Independent Moderator review.",
    sections: [
      {
        sectionLabel: "Part - A",
        title: "Short Answer Questions",
        description: "Answer ALL questions (5 × 2 = 10 Marks)",
        sequenceOrder: 1,
        requiredAnswers: 5,
      },
      {
        sectionLabel: "Part - B",
        title: "Descriptive Questions",
        description: "Answer ALL questions (10 × 5 = 50 Marks)",
        sequenceOrder: 2,
        requiredAnswers: 10,
      },
    ],
  });

  const secA2 = pendingPaper.sections[0]!;
  const secB2 = pendingPaper.sections[1]!;

  for (let i = 0; i < partAQuestions.length; i++) {
    const q = partAQuestions[i]!;
    await addQuestionSlot(DEFAULT_DEV_INSTITUTION_ID, pendingPaper.id, secA2.id, {
      questionId: q.id,
      revisionId: q.currentRevision!.id,
      sequenceOrder: i + 1,
      allocatedMarks: 2,
    });
  }

  for (let i = 0; i < partBQuestions.length; i++) {
    const q = partBQuestions[i]!;
    await addQuestionSlot(DEFAULT_DEV_INSTITUTION_ID, pendingPaper.id, secB2.id, {
      questionId: q.id,
      revisionId: q.currentRevision!.id,
      sequenceOrder: i + 1,
      allocatedMarks: 5,
    });
  }

  await submitExamPaper(
    DEFAULT_DEV_INSTITUTION_ID,
    pendingPaper.id,
    "Submitted Set-B paper for Independent Moderator review.",
    EXAMINER_ID,
  );
  console.log(`✅ Pending Paper ready in Approval Queue: ${pendingPaper.title}`);
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await closePrisma();
  });
