/**
 * Exam Paper Builder Service — Step 8
 *
 * Business logic for:
 *  - ExamConfiguration CRUD
 *  - ExamPaper CRUD (with draft lifecycle management)
 *  - PaperSection CRUD
 *  - QuestionSlot management
 *  - Paper validation (marks totals, syllabus coverage, section rules)
 *
 * Key invariants:
 *  1. Questions assigned to slots via IMMUTABLE revision IDs, not mutable question refs.
 *  2. Papers are only editable while in DRAFT status.
 *  3. Marks are accumulated from slots; totalSlots and sectionMarks are kept in sync.
 *  4. Validation checks configured totalMarks vs. actual slot marks sum.
 *  5. All resources are scoped to institutionId (tenant isolation).
 */

import { db } from "../lib/prisma.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  calculatePaperMarks,
  calculateSectionMarks,
  round2,
  type CalculationSection,
} from "./paperCalculator.js";
import type {
  CreateExamConfigInput,
  UpdateExamConfigInput,
  ListExamConfigsQuery,
  CreateExamPaperInput,
  UpdateExamPaperInput,
  ListExamPapersQuery,
  CreateSectionInput,
  UpdateSectionInput,
  AddQuestionSlotInput,
  UpdateQuestionSlotInput,
  PaperValidationResult,
  PaperValidationIssue,
  TopicCoverageItem,
} from "../schemas/paper.js";
import type { PaginatedResult } from "./subjectService.js";

// ===========================================================================
// ExamConfiguration
// ===========================================================================

/** Verify the subject belongs to the institution. */
async function verifySubjectOwnership(institutionId: string, subjectId: string): Promise<void> {
  const subject = await db.subject.findUnique({ where: { id: subjectId } });
  if (!subject || subject.institutionId !== institutionId) {
    throw new AppError("Subject not found within this institution", 404);
  }
}

export async function createExamConfig(institutionId: string, input: CreateExamConfigInput) {
  await verifySubjectOwnership(institutionId, input.subjectId);

  return db.examConfiguration.create({
    data: {
      institutionId,
      subjectId: input.subjectId,
      name: input.name,
      description: input.description,
      totalMarks: String(input.totalMarks),
      passingMarks: input.passingMarks !== undefined ? String(input.passingMarks) : null,
      durationMinutes: input.durationMinutes,
      instructions: input.instructions,
    },
    include: { subject: { select: { id: true, name: true, code: true } } },
  });
}

export async function listExamConfigs(
  institutionId: string,
  query: ListExamConfigsQuery,
): Promise<PaginatedResult<unknown>> {
  const where: Record<string, unknown> = { institutionId };
  if (query.subjectId) where["subjectId"] = query.subjectId;
  if (query.isActive !== undefined) where["isActive"] = query.isActive;

  const [total, data] = await Promise.all([
    db.examConfiguration.count({ where }),
    db.examConfiguration.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true, code: true } },
        _count: { select: { papers: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    data,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

export async function getExamConfig(institutionId: string, configId: string) {
  const config = await db.examConfiguration.findUnique({
    where: { id: configId },
    include: {
      subject: { select: { id: true, name: true, code: true } },
      _count: { select: { papers: true } },
    },
  });
  if (!config || config.institutionId !== institutionId) {
    throw new AppError("Exam configuration not found", 404);
  }
  return config;
}

export async function updateExamConfig(
  institutionId: string,
  configId: string,
  input: UpdateExamConfigInput,
) {
  await getExamConfig(institutionId, configId); // ownership check

  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData["name"] = input.name;
  if (input.description !== undefined) updateData["description"] = input.description;
  if (input.totalMarks !== undefined) updateData["totalMarks"] = String(input.totalMarks);
  if (input.passingMarks !== undefined)
    updateData["passingMarks"] = input.passingMarks !== null ? String(input.passingMarks) : null;
  if (input.durationMinutes !== undefined) updateData["durationMinutes"] = input.durationMinutes;
  if (input.instructions !== undefined) updateData["instructions"] = input.instructions;
  if (input.isActive !== undefined) updateData["isActive"] = input.isActive;

  return db.examConfiguration.update({
    where: { id: configId },
    data: updateData,
    include: { subject: { select: { id: true, name: true, code: true } } },
  });
}

// ===========================================================================
// ExamPaper
// ===========================================================================

/** Verify paper belongs to institution and is in an editable state (DRAFT or REJECTED). */
async function getPaperForEdit(institutionId: string, paperId: string) {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    include: { config: true },
  });
  if (!paper || paper.institutionId !== institutionId) {
    throw new AppError("Exam paper not found", 404);
  }
  if (paper.status !== "DRAFT" && paper.status !== "REJECTED") {
    throw new AppError("Paper can only be modified while in DRAFT or REJECTED status", 409);
  }
  if (paper.status === "REJECTED") {
    await db.examPaper.update({
      where: { id: paperId },
      data: { status: "DRAFT" },
    });
    paper.status = "DRAFT";
  }
  return paper;
}

export async function createExamPaper(institutionId: string, input: CreateExamPaperInput) {
  // Verify config belongs to this institution
  const config = await db.examConfiguration.findUnique({ where: { id: input.configId } });
  if (!config || config.institutionId !== institutionId) {
    throw new AppError("Exam configuration not found within this institution", 404);
  }

  return db.examPaper.create({
    data: {
      institutionId,
      configId: input.configId,
      title: input.title,
      notes: input.notes,
      sections: {
        create: input.sections.map((s) => ({
          sectionLabel: s.sectionLabel,
          title: s.title,
          description: s.description,
          sequenceOrder: s.sequenceOrder,
          requiredAnswers: s.requiredAnswers,
        })),
      },
    },
    include: {
      config: { include: { subject: { select: { id: true, name: true, code: true } } } },
      sections: { include: { slots: true }, orderBy: { sequenceOrder: "asc" } },
    },
  });
}

export async function listExamPapers(
  institutionId: string,
  query: ListExamPapersQuery,
): Promise<PaginatedResult<unknown>> {
  const where: Record<string, unknown> = { institutionId };
  if (query.configId) where["configId"] = query.configId;
  if (query.status) where["status"] = query.status;

  const [total, data] = await Promise.all([
    db.examPaper.count({ where }),
    db.examPaper.findMany({
      where,
      include: {
        config: { include: { subject: { select: { id: true, name: true, code: true } } } },
        _count: { select: { sections: true } },
      },
      orderBy: { updatedAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    data,
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize) || 1,
  };
}

export async function getExamPaper(institutionId: string, paperId: string) {
  const paper = await db.examPaper.findUnique({
    where: { id: paperId },
    include: {
      config: { include: { subject: { select: { id: true, name: true, code: true } } } },
      sections: {
        orderBy: { sequenceOrder: "asc" },
        include: {
          slots: {
            orderBy: { sequenceOrder: "asc" },
            include: {
              revision: {
                select: {
                  id: true,
                  revisionNumber: true,
                  questionText: true,
                  questionType: true,
                  marks: true,
                  difficulty: true,
                  language: true,
                  analyses: {
                    orderBy: { createdAt: "desc" },
                    select: {
                      aiBloomsLevel: true,
                      facultyBloomsLevel: true,
                      reviewStatus: true,
                      hasPotentialDuplicates: true,
                      hasNearDuplicates: true,
                    },
                  },
                  questionTopicMaps: {
                    include: {
                      topic: {
                        select: { id: true, name: true, code: true, sequenceOrder: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!paper || paper.institutionId !== institutionId) {
    throw new AppError("Exam paper not found", 404);
  }
  return paper;
}

export async function updateExamPaper(
  institutionId: string,
  paperId: string,
  input: UpdateExamPaperInput,
) {
  await getPaperForEdit(institutionId, paperId);

  return db.examPaper.update({
    where: { id: paperId },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.notes !== undefined && { notes: input.notes }),
      version: { increment: 1 },
    },
    include: {
      config: { include: { subject: { select: { id: true, name: true, code: true } } } },
      sections: { orderBy: { sequenceOrder: "asc" }, include: { slots: true } },
    },
  });
}

export async function submitExamPaper(
  institutionId: string,
  paperId: string,
  notes?: string,
  userId?: string,
) {
  const { submitPaperForApproval } = await import("./paperApprovalService.js");
  return submitPaperForApproval(
    institutionId,
    paperId,
    userId || "u0000000-0000-4000-8000-000000000001",
    { notes },
  );
}

// ===========================================================================
// PaperSection
// ===========================================================================

export async function addSection(
  institutionId: string,
  paperId: string,
  input: CreateSectionInput,
) {
  await getPaperForEdit(institutionId, paperId);

  return db.paperSection.create({
    data: {
      paperId,
      sectionLabel: input.sectionLabel,
      title: input.title,
      description: input.description,
      sequenceOrder: input.sequenceOrder,
      requiredAnswers: input.requiredAnswers,
    },
    include: { slots: true },
  });
}

export async function updateSection(
  institutionId: string,
  paperId: string,
  sectionId: string,
  input: UpdateSectionInput,
) {
  await getPaperForEdit(institutionId, paperId);

  const section = await db.paperSection.findUnique({ where: { id: sectionId } });
  if (!section || section.paperId !== paperId) {
    throw new AppError("Section not found in this paper", 404);
  }

  const updated = await db.paperSection.update({
    where: { id: sectionId },
    data: {
      ...(input.sectionLabel !== undefined && { sectionLabel: input.sectionLabel }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.sequenceOrder !== undefined && { sequenceOrder: input.sequenceOrder }),
      ...(input.requiredAnswers !== undefined && { requiredAnswers: input.requiredAnswers }),
    },
    include: { slots: true },
  });

  await recalcPaperSectionMarks(paperId);
  return updated;
}

export async function deleteSection(
  institutionId: string,
  paperId: string,
  sectionId: string,
) {
  await getPaperForEdit(institutionId, paperId);

  const section = await db.paperSection.findUnique({ where: { id: sectionId } });
  if (!section || section.paperId !== paperId) {
    throw new AppError("Section not found in this paper", 404);
  }

  await db.paperSection.delete({ where: { id: sectionId } });
  await recalcPaperSectionMarks(paperId);
}

// ===========================================================================
// QuestionSlot
// ===========================================================================

/** Recalculate sectionMarks and totalSlots for all sections of a paper */
async function recalcPaperSectionMarks(paperId: string): Promise<void> {
  const sections = await db.paperSection.findMany({
    where: { paperId },
    include: { slots: true },
  });

  await Promise.all(
    sections.map((sec) => {
      const summary = calculateSectionMarks({
        id: sec.id,
        sectionLabel: sec.sectionLabel,
        title: sec.title,
        requiredAnswers: sec.requiredAnswers,
        slots: sec.slots.map((s) => ({
          id: s.id,
          allocatedMarks: Number(s.allocatedMarks),
        })),
      });

      return db.paperSection.update({
        where: { id: sec.id },
        data: {
          totalSlots: summary.slotCount,
          sectionMarks: String(summary.printedMarks),
        },
      });
    }),
  );
}

export async function addQuestionSlot(
  institutionId: string,
  paperId: string,
  sectionId: string,
  input: AddQuestionSlotInput,
) {
  await getPaperForEdit(institutionId, paperId);

  const section = await db.paperSection.findUnique({ where: { id: sectionId } });
  if (!section || section.paperId !== paperId) {
    throw new AppError("Section not found in this paper", 404);
  }

  // Verify revision belongs to this institution
  const revision = await db.questionRevision.findUnique({
    where: { id: input.revisionId },
    include: { question: true },
  });
  if (!revision || revision.question.institutionId !== institutionId) {
    throw new AppError("Question revision not found within this institution", 404);
  }
  if (revision.questionId !== input.questionId) {
    throw new AppError("revisionId does not belong to the specified questionId", 400);
  }

  // Check for duplicate slot (same revision already in section)
  const existing = await db.questionSlot.findFirst({
    where: { sectionId, revisionId: input.revisionId },
  });
  if (existing) {
    throw new AppError("This question revision is already in this section", 409);
  }

  const slot = await db.questionSlot.create({
    data: {
      sectionId,
      questionId: input.questionId,
      revisionId: input.revisionId,
      sequenceOrder: input.sequenceOrder,
      allocatedMarks: String(input.allocatedMarks),
      notes: input.notes,
    },
    include: {
      revision: {
        select: {
          id: true,
          revisionNumber: true,
          questionText: true,
          questionType: true,
          marks: true,
          difficulty: true,
          questionTopicMaps: { include: { topic: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  await recalcPaperSectionMarks(paperId);
  return slot;
}

export async function updateQuestionSlot(
  institutionId: string,
  paperId: string,
  sectionId: string,
  slotId: string,
  input: UpdateQuestionSlotInput,
) {
  await getPaperForEdit(institutionId, paperId);

  const slot = await db.questionSlot.findUnique({ where: { id: slotId } });
  if (!slot || slot.sectionId !== sectionId) {
    throw new AppError("Question slot not found", 404);
  }

  const updated = await db.questionSlot.update({
    where: { id: slotId },
    data: {
      ...(input.sequenceOrder !== undefined && { sequenceOrder: input.sequenceOrder }),
      ...(input.allocatedMarks !== undefined && { allocatedMarks: String(input.allocatedMarks) }),
      ...(input.notes !== undefined && { notes: input.notes }),
    },
    include: {
      revision: {
        select: {
          id: true,
          revisionNumber: true,
          questionText: true,
          questionType: true,
          marks: true,
        },
      },
    },
  });

  await recalcPaperSectionMarks(paperId);
  return updated;
}

export async function removeQuestionSlot(
  institutionId: string,
  paperId: string,
  sectionId: string,
  slotId: string,
) {
  await getPaperForEdit(institutionId, paperId);

  const slot = await db.questionSlot.findUnique({ where: { id: slotId } });
  if (!slot || slot.sectionId !== sectionId) {
    throw new AppError("Question slot not found", 404);
  }

  await db.questionSlot.delete({ where: { id: slotId } });
  await recalcPaperSectionMarks(paperId);
}

// ===========================================================================
// Paper Validation
// ===========================================================================

export async function validatePaper(
  institutionId: string,
  paperId: string,
): Promise<PaperValidationResult> {
  const paper = await getExamPaper(institutionId, paperId);
  const config = paper.config;
  const issues: PaperValidationIssue[] = [];

  const calculationSections: CalculationSection[] = paper.sections.map((sec) => ({
    id: sec.id,
    sectionLabel: sec.sectionLabel,
    title: sec.title,
    requiredAnswers: sec.requiredAnswers,
    slots: sec.slots.map((s) => ({
      id: s.id,
      sequenceOrder: s.sequenceOrder,
      allocatedMarks: Number(s.allocatedMarks),
    })),
  }));

  const calcResult = calculatePaperMarks(calculationSections, Number(config.totalMarks));

  // Syllabus coverage & difficulty mapping
  const topicMap = new Map<string, TopicCoverageItem>();
  const difficultyCounts: Record<string, number> = {
    EASY: 0,
    MEDIUM: 0,
    HARD: 0,
    UNSET: 0,
  };
  const seenQuestionIds = new Set<string>();
  let duplicateWarningCount = 0;

  for (const section of paper.sections) {
    for (const slot of section.slots) {
      const marks = Number(slot.allocatedMarks);

      // Track duplicate question IDs across sections
      if (seenQuestionIds.has(slot.questionId)) {
        duplicateWarningCount++;
        issues.push({
          severity: "WARNING",
          code: "DUPLICATE_QUESTION_IN_PAPER",
          message: `Question is included more than once in this question paper.`,
          context: { questionId: slot.questionId, slotId: slot.id },
        });
      } else {
        seenQuestionIds.add(slot.questionId);
      }

      // Check AI duplicate warnings on revision
      const hasDuplicateFlags = slot.revision.analyses?.some(
        (a) => a.hasPotentialDuplicates || a.hasNearDuplicates,
      );
      if (hasDuplicateFlags) {
        duplicateWarningCount++;
        issues.push({
          severity: "WARNING",
          code: "QUESTION_SIMILARITY_FLAG",
          message: `Question has potential or near duplicate candidates flagged in question bank.`,
          context: { questionId: slot.questionId, revisionId: slot.revision.id },
        });
      }

      // Difficulty distribution
      const diff = slot.revision.difficulty;
      if (diff === "EASY" || diff === "MEDIUM" || diff === "HARD") {
        difficultyCounts[diff] = (difficultyCounts[diff] || 0) + 1;
      } else {
        difficultyCounts["UNSET"] = (difficultyCounts["UNSET"] || 0) + 1;
      }

      // Collect topic coverage from revision's topic maps
      for (const qtm of slot.revision.questionTopicMaps) {
        const topic = qtm.topic;
        const existing = topicMap.get(topic.id);
        if (existing) {
          existing.questionCount++;
          existing.allocatedMarks = round2(existing.allocatedMarks + marks);
        } else {
          topicMap.set(topic.id, {
            topicId: topic.id,
            topicName: topic.name,
            questionCount: 1,
            allocatedMarks: round2(marks),
          });
        }
      }

      // Marks per slot sanity check
      if (marks <= 0) {
        issues.push({
          severity: "ERROR",
          code: "SLOT_ZERO_MARKS",
          message: `A question slot in section "${section.title}" has zero or negative marks`,
          context: { sectionId: section.id, slotId: slot.id },
        });
      }
    }

    // Optional-choice rule validation
    if (section.requiredAnswers !== null && section.requiredAnswers !== undefined) {
      if (section.requiredAnswers > section.totalSlots) {
        issues.push({
          severity: "ERROR",
          code: "SECTION_REQUIRED_EXCEEDS_SLOTS",
          message: `Section "${section.title}": requiredAnswers (${section.requiredAnswers}) exceeds totalSlots (${section.totalSlots})`,
          context: { sectionId: section.id },
        });
      }
    }

    // Sections with no slots
    if (section.slots.length === 0) {
      issues.push({
        severity: "WARNING",
        code: "SECTION_EMPTY",
        message: `Section "${section.title}" has no question slots`,
        context: { sectionId: section.id },
      });
    }
  }

  // Check section calculation ambiguities
  for (const sSummary of calcResult.sectionSummaries) {
    if (sSummary.isChoiceAmbiguous && sSummary.ambiguityReason) {
      issues.push({
        severity: "WARNING",
        code: "SECTION_AMBIGUOUS_CHOICE",
        message: sSummary.ambiguityReason,
        context: { sectionId: sSummary.sectionId },
      });
    }
  }

  // Validate achievable marks vs exam configuration
  if (!calcResult.isMarksMatch) {
    issues.push({
      severity: "ERROR",
      code: "MARKS_MISMATCH",
      message: `Paper achievable total marks (${calcResult.totalAchievableMarks.toFixed(2)}) does not match configured exam total marks (${calcResult.configTotalMarks.toFixed(2)}). Discrepancy: ${calcResult.marksDiscrepancy.toFixed(2)} marks.`,
      context: {
        printedMarks: calcResult.totalPrintedMarks,
        achievableMarks: calcResult.totalAchievableMarks,
        configTotalMarks: calcResult.configTotalMarks,
        discrepancy: calcResult.marksDiscrepancy,
      },
    });
  } else {
    issues.push({
      severity: "INFO",
      code: "MARKS_MATCH",
      message: `Paper achievable total marks matches configured exam total marks (${calcResult.totalAchievableMarks.toFixed(2)}).`,
    });
  }

  // Paper with no sections
  if (paper.sections.length === 0) {
    issues.push({
      severity: "ERROR",
      code: "PAPER_NO_SECTIONS",
      message: "Paper has no sections",
    });
  }

  // Paper with no questions at all
  if (calcResult.totalSlots === 0) {
    issues.push({
      severity: "ERROR",
      code: "PAPER_NO_QUESTIONS",
      message: "Paper has no question slots",
    });
  }

  // Topic concentration warning
  const topicCoverageList = Array.from(topicMap.values());
  if (topicCoverageList.length > 1 && calcResult.totalAchievableMarks > 0) {
    for (const t of topicCoverageList) {
      const topicRatio = t.allocatedMarks / calcResult.totalAchievableMarks;
      if (topicRatio > 0.75) {
        issues.push({
          severity: "WARNING",
          code: "TOPIC_CONCENTRATION",
          message: `Topic "${t.topicName}" accounts for ${(topicRatio * 100).toFixed(0)}% of the paper marks.`,
          context: { topicId: t.topicId, topicName: t.topicName, ratio: topicRatio },
        });
      }
    }
  }

  const hasErrors = issues.some((i) => i.severity === "ERROR");

  return {
    valid: !hasErrors,
    totalMarks: calcResult.totalAchievableMarks,
    printedMarks: calcResult.totalPrintedMarks,
    achievableMarks: calcResult.totalAchievableMarks,
    configTotalMarks: calcResult.configTotalMarks,
    marksDiscrepancy: calcResult.marksDiscrepancy,
    slotCount: calcResult.totalSlots,
    requiredQuestionCount: calcResult.totalRequiredQuestions,
    sectionCount: paper.sections.length,
    issues,
    sectionSummaries: calcResult.sectionSummaries,
    syllabusTopicCoverage: topicCoverageList,
    difficultyDistribution: difficultyCounts,
    duplicateWarningsCount: duplicateWarningCount,
  };
}

export { getPaperPreview } from "./paperPreviewService.js";

