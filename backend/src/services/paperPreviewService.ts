/**
 * Paper Preview Service — Step 9
 *
 * Implements:
 *  - Faculty preview mode: full paper details including faculty notes, topic maps, and similarity analyses
 *  - Candidate preview mode: strips answers, explanations, faculty notes, analyses, and author identities
 *
 * Tenant isolation is enforced on every call.
 */

import { getExamPaper } from "./paperService.js";

export async function getPaperPreview(
  institutionId: string,
  paperId: string,
  mode: "faculty" | "candidate" = "faculty",
) {
  const paper = await getExamPaper(institutionId, paperId);

  if (mode === "candidate") {
    // Strip answer keys and internal faculty metadata
    return {
      id: paper.id,
      institutionId: paper.institutionId,
      configId: paper.configId,
      title: paper.title,
      status: paper.status,
      version: paper.version,
      concurrencyVersion: paper.concurrencyVersion,
      notes: null, // Internal paper notes stripped
      createdAt: paper.createdAt,
      updatedAt: paper.updatedAt,
      config: {
        id: paper.config.id,
        name: paper.config.name,
        description: paper.config.description,
        totalMarks: paper.config.totalMarks,
        passingMarks: paper.config.passingMarks,
        durationMinutes: paper.config.durationMinutes,
        instructions: paper.config.instructions,
        subject: paper.config.subject,
      },
      sections: paper.sections.map((section) => ({
        id: section.id,
        paperId: section.paperId,
        sectionLabel: section.sectionLabel,
        title: section.title,
        description: section.description,
        sequenceOrder: section.sequenceOrder,
        totalSlots: section.totalSlots,
        requiredAnswers: section.requiredAnswers,
        sectionMarks: section.sectionMarks,
        slots: section.slots.map((slot) => ({
          id: slot.id,
          sectionId: slot.sectionId,
          questionId: slot.questionId,
          revisionId: slot.revisionId,
          sequenceOrder: slot.sequenceOrder,
          allocatedMarks: slot.allocatedMarks,
          notes: null, // Stripped
          revision: {
            id: slot.revision.id,
            revisionNumber: slot.revision.revisionNumber,
            questionText: slot.revision.questionText,
            questionType: slot.revision.questionType,
            marks: slot.revision.marks,
            language: slot.revision.language,
            difficulty: slot.revision.difficulty,
            // NEVER include: suggestedAnswer, explanation, analyses, authorId
          },
        })),
      })),
    };
  }

  // Faculty mode: return full paper as-is
  return paper;
}

