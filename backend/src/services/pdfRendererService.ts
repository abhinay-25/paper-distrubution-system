/**
 * College Question Paper PDF Renderer Service — Step 5 & Step 10
 *
 * Implements deterministic PDF generation replicating the CBIT Autonomous
 * Examination Question Paper visual reference (Social_Engineering_22CIE18.pdf).
 *
 * Template ID: "cbit-autonomous-v1"
 * Template Version: "1.0.0"
 * Renderer Version: "1.0.0"
 *
 * Features:
 *  - Strict adherence to verified reference geometry, A4 margins, typography (Times), and line spacing
 *  - Regulation box (e.g., "R22") on page 1 and subsequent page headers
 *  - Subject Code ("Code No.: ...") top-right header
 *  - Optional 10-box Hall Ticket Number candidate-entry grid when requested (includeHallTicketGrid)
 *  - Full institutional header ("CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)"),
 *    exam title, course name, duration ("Time: 3 Hours"), and maximum marks ("Max Marks: 60")
 *  - Mandatory candidate note with hanging-indented continuation lines
 *  - Tabular column alignment: Question number, Subpart, Question text, Marks (M), Course Outcome (CO), Bloom's Level (BT)
 *  - Data-driven internal choices and "(OR)" separators: only rendered when explicitly supported by
 *    section/question choice-group or subpart metadata (never inferred merely from section name "B")
 *  - Multi-page continuation with running headers, safe long-question flow, and "Page X of Y" footers
 *  - Terminal exam indicator "*****"
 *  - SHA-256 cryptographic hash computation
 */

import PDFDocument from "pdfkit";
import crypto from "node:crypto";

export const TEMPLATE_ID = "cbit-autonomous-v1";
export const TEMPLATE_VERSION = "1.0.0";
export const RENDERER_VERSION = "1.0.0";
export const HALL_TICKET_BOX_COUNT = 10;

export interface QuestionData {
  slotId?: string;
  sequenceOrder: number;
  questionText: string;
  marks: number | string;
  bloomsLevel?: string | null;
  courseOutcome?: number | string | null;
  subpartLabel?: string | null; // e.g. "(a)", "(b)"
  choiceGroup?: string | number | null; // explicit alternative-question group ID
  orWithNext?: boolean; // explicit flag indicating "(OR)" separator after this question
}

export interface SectionData {
  id?: string;
  sectionLabel: string; // e.g. "A" or "Part - A"
  title: string;
  description?: string | null;
  requiredAnswers?: number | null;
  totalSlots?: number;
  sectionMarks?: number | string;
  questions: QuestionData[];
  internalChoicePairs?: Array<{
    firstGroup: QuestionData[];
    secondGroup: QuestionData[];
  }>;
}

export interface ApprovedPaperSnapshot {
  id: string;
  title: string;
  version: number;
  config: {
    name: string;
    totalMarks: string | number;
    durationMinutes?: number | null;
    instructions?: string | null;
    subject: {
      id: string;
      name: string;
      code: string;
    };
  };
  institutionName?: string;
  regulationCode?: string;
  examDate?: string | null;
  semester?: string | null;
  includeHallTicketGrid?: boolean;
  sections: SectionData[];
}

export interface RenderedPdfResult {
  buffer: Buffer;
  pageCount: number;
  checksumSha256: string;
  templateId: string;
  templateVersion: string;
  rendererVersion: string;
}

export interface AssembledQuestionGroup {
  mainNum: number;
  subparts: QuestionData[];
  hasExplicitSubparts: boolean;
  orWithNext: boolean;
  choiceGroup?: string | number | null;
}

/**
 * Maps Bloom's taxonomy cognitive levels to numeric BT notation (1-6).
 */
export function mapBloomsToBT(bloomsLevel?: string | null): number {
  if (!bloomsLevel) return 1;
  const normalized = bloomsLevel.trim().toUpperCase();
  if (normalized.includes("REMEMBER") || normalized === "L1" || normalized === "1") return 1;
  if (normalized.includes("UNDERSTAND") || normalized === "L2" || normalized === "2") return 2;
  if (normalized.includes("APPLY") || normalized === "L3" || normalized === "3") return 3;
  if (normalized.includes("ANALYZE") || normalized === "L4" || normalized === "4") return 4;
  if (normalized.includes("EVALUATE") || normalized === "L5" || normalized === "5") return 5;
  if (normalized.includes("CREATE") || normalized === "L6" || normalized === "6") return 6;
  return 2; // sensible default
}

/**
 * Format duration minutes into standard academic string (e.g., 180 -> "3 Hours")
 */
export function formatDuration(minutes?: number | null): string {
  if (!minutes || minutes <= 0) return "3 Hours";
  const hours = minutes / 60;
  if (Number.isInteger(hours)) {
    return `${hours} Hour${hours > 1 ? "s" : ""}`;
  }
  return `${hours.toFixed(1)} Hours`;
}

/**
 * Format numeric or decimal string marks cleanly (e.g. 60.00 -> "60", 2.5 -> "2.5")
 */
export function formatMarks(marks: number | string | null | undefined): string {
  if (marks === null || marks === undefined || marks === "") return "0";
  const num = typeof marks === "string" ? parseFloat(marks) : marks;
  if (Number.isNaN(num)) return "0";
  return Number.isInteger(num) ? `${num}` : `${Number(num.toFixed(2))}`;
}

/**
 * Formats the institutional heading to match the verified CBIT reference:
 * Uppercases the institution name while preserving "(Autonomous)" in mixed case.
 */
export function formatInstitutionHeading(rawName?: string | null): string {
  const fallback = "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)";
  if (!rawName || !rawName.trim()) return fallback;
  return rawName
    .trim()
    .toUpperCase()
    .replace(/\(AUTONOMOUS\)/g, "(Autonomous)");
}

/**
 * Formats a section heading label consistently (e.g., "A" -> "Part - A", "Part - B" -> "Part - B").
 */
export function formatSectionHeading(sectionLabel?: string | null): string {
  const clean = (sectionLabel || "A").trim();
  if (/^(part|section)\b/i.test(clean)) {
    return clean;
  }
  return `Part - ${clean}`;
}

/**
 * Assembles section questions into numbered main questions and determines where "(OR)"
 * separators belong strictly from explicit data relationships (never from section name "B").
 */
export function assembleSectionQuestionGroups(
  section: SectionData,
  startingQuestionNumber: number,
): { groups: AssembledQuestionGroup[]; nextQuestionNumber: number } {
  let currentMainNum = startingQuestionNumber;
  const groups: AssembledQuestionGroup[] = [];

  // 1. Explicit internalChoicePairs on SectionData take highest priority
  if (Array.isArray(section.internalChoicePairs) && section.internalChoicePairs.length > 0) {
    for (const pair of section.internalChoicePairs) {
      if (pair.firstGroup && pair.firstGroup.length > 0) {
        groups.push({
          mainNum: currentMainNum++,
          subparts: pair.firstGroup,
          hasExplicitSubparts:
            pair.firstGroup.length > 1 || pair.firstGroup.some((q) => Boolean(q.subpartLabel)),
          orWithNext: Boolean(pair.secondGroup && pair.secondGroup.length > 0),
        });
      }
      if (pair.secondGroup && pair.secondGroup.length > 0) {
        groups.push({
          mainNum: currentMainNum++,
          subparts: pair.secondGroup,
          hasExplicitSubparts:
            pair.secondGroup.length > 1 || pair.secondGroup.some((q) => Boolean(q.subpartLabel)),
          orWithNext: false,
        });
      }
    }
    return { groups, nextQuestionNumber: currentMainNum };
  }

  // Sort questions deterministically by sequenceOrder while preserving original order on ties
  const sortedQuestions = [...(section.questions || [])]
    .map((q, idx) => ({ q, idx }))
    .sort((a, b) => {
      const orderA = a.q.sequenceOrder ?? a.idx + 1;
      const orderB = b.q.sequenceOrder ?? b.idx + 1;
      return orderA !== orderB ? orderA - orderB : a.idx - b.idx;
    })
    .map((entry) => entry.q);

  if (sortedQuestions.length === 0) {
    return { groups: [], nextQuestionNumber: currentMainNum };
  }

  // 2. Check if questions explicitly define subparts (e.g. "(a)", "(b)")
  const hasAnySubpartLabel = sortedQuestions.some(
    (q) => typeof q.subpartLabel === "string" && q.subpartLabel.trim().length > 0,
  );

  if (!hasAnySubpartLabel) {
    // Standard standalone questions: preserve configured order 1-to-1 without inventing subparts
    for (let i = 0; i < sortedQuestions.length; i++) {
      const q = sortedQuestions[i]!;
      const nextQ = sortedQuestions[i + 1];
      const hasExplicitOr =
        q.orWithNext === true ||
        (q.choiceGroup !== undefined &&
          q.choiceGroup !== null &&
          q.choiceGroup !== "" &&
          nextQ?.choiceGroup === q.choiceGroup);

      groups.push({
        mainNum: currentMainNum++,
        subparts: [q],
        hasExplicitSubparts: false,
        orWithNext: hasExplicitOr,
        choiceGroup: q.choiceGroup ?? null,
      });
    }
    return { groups, nextQuestionNumber: currentMainNum };
  }

  // 3. Questions carry explicit subpartLabel metadata: group consecutive subparts into main questions
  let currentSubparts: QuestionData[] = [];

  const flushCurrentGroup = () => {
    if (currentSubparts.length === 0) return;
    const explicitOr = currentSubparts.some((s) => s.orWithNext === true);
    const groupChoiceId =
      currentSubparts.find((s) => s.choiceGroup !== undefined && s.choiceGroup !== null)
        ?.choiceGroup ?? null;

    groups.push({
      mainNum: currentMainNum++,
      subparts: [...currentSubparts],
      hasExplicitSubparts:
        currentSubparts.length > 1 ||
        currentSubparts.some((s) => Boolean(s.subpartLabel?.trim())),
      orWithNext: explicitOr,
      choiceGroup: groupChoiceId,
    });
    currentSubparts = [];
  };

  for (let i = 0; i < sortedQuestions.length; i++) {
    const item = sortedQuestions[i]!;
    const rawSub = item.subpartLabel?.trim().toLowerCase() || "";

    if (!rawSub) {
      flushCurrentGroup();
      currentSubparts.push(item);
      flushCurrentGroup();
      continue;
    }

    // If a new "(a)" subpart begins and we already have subparts in the current buffer, flush first
    if ((rawSub === "(a)" || rawSub === "a" || rawSub === "a)") && currentSubparts.length > 0) {
      flushCurrentGroup();
    }

    currentSubparts.push(item);

    // If this subpart closes a standard (a)/(b) pair and the next item is not (c)/(d), flush
    const nextRawSub = sortedQuestions[i + 1]?.subpartLabel?.trim().toLowerCase() || "";
    const nextContinuesSameQuestion =
      nextRawSub === "(c)" ||
      nextRawSub === "c" ||
      nextRawSub === "(d)" ||
      nextRawSub === "d";

    if (
      (rawSub === "(b)" || rawSub === "b" || rawSub === "b)") &&
      !nextContinuesSameQuestion
    ) {
      flushCurrentGroup();
    }
  }
  flushCurrentGroup();

  // Determine "(OR)" relationships between grouped multi-part questions:
  // A) Explicit choiceGroup matching between consecutive groups
  // B) Explicit orWithNext flag on a group
  // C) Exact 1-of-2 internal-choice pairing where all questions have explicit subparts and
  //    the number of assembled main questions equals 2 * section.requiredAnswers (e.g., 10 main
  //    questions Q6..Q15 for requiredAnswers = 5 in the CBIT Social Engineering reference).
  const hasExplicitGroupOrFlags = groups.some(
    (g, idx) =>
      g.orWithNext ||
      (g.choiceGroup !== null &&
        g.choiceGroup !== undefined &&
        groups[idx + 1]?.choiceGroup === g.choiceGroup),
  );

  const isExactInternalChoicePairing =
    !hasExplicitGroupOrFlags &&
    typeof section.requiredAnswers === "number" &&
    section.requiredAnswers > 0 &&
    groups.length === section.requiredAnswers * 2 &&
    groups.every((g) => g.hasExplicitSubparts);

  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    const grp = groups[gIdx]!;
    const nextGrp = groups[gIdx + 1];
    if (!nextGrp) {
      grp.orWithNext = false;
      continue;
    }

    if (
      grp.orWithNext ||
      (grp.choiceGroup !== null &&
        grp.choiceGroup !== undefined &&
        nextGrp.choiceGroup === grp.choiceGroup)
    ) {
      grp.orWithNext = true;
    } else if (isExactInternalChoicePairing && gIdx % 2 === 0) {
      grp.orWithNext = true;
    } else {
      grp.orWithNext = false;
    }
  }

  return { groups, nextQuestionNumber: currentMainNum };
}

/**
 * Computes the section marks subtitle, e.g. "(5Q X 2M = 10 Marks)" or "(5Q X 10M = 50 Marks)".
 */
export function formatSectionMarksSubtitle(
  section: SectionData,
  groups: AssembledQuestionGroup[],
): string {
  const mainCount = groups.length;
  if (mainCount === 0) {
    const fallbackMarks = formatMarks(section.sectionMarks ?? 0);
    return `(0Q X 0M = ${fallbackMarks} Marks)`;
  }

  const answerCount =
    typeof section.requiredAnswers === "number" && section.requiredAnswers > 0
      ? section.requiredAnswers
      : mainCount;

  // Calculate total marks per assembled main question (summing subparts if multi-part)
  const mainQuestionMarks = groups.map((g) =>
    g.subparts.reduce((sum, s) => sum + ( parseFloat(String(s.marks)) || 0 ), 0),
  );

  const firstMainMark = mainQuestionMarks[0] ?? 0;
  const isUniformMainMarks = mainQuestionMarks.every(
    (m) => Math.abs(m - firstMainMark) < 0.01,
  );

  if (isUniformMainMarks && firstMainMark > 0) {
    const achievableSectionMarks = answerCount * firstMainMark;
    return `(${answerCount}Q X ${formatMarks(firstMainMark)}M = ${formatMarks(achievableSectionMarks)} Marks)`;
  }

  const rawSecMarks = Number(section.sectionMarks ?? 0);
  const totalSecMarks =
    rawSecMarks > 0
      ? rawSecMarks
      : mainQuestionMarks.slice(0, answerCount).reduce((sum, m) => sum + m, 0);
  const avgMarksPerQ = answerCount > 0 ? totalSecMarks / answerCount : 0;

  return `(${answerCount}Q X ${formatMarks(avgMarksPerQ)}M = ${formatMarks(totalSecMarks)} Marks)`;
}

/**
 * Renders the 10-box Hall Ticket Number candidate-entry grid in the top-right header area
 * when enabled via `includeHallTicketGrid: true`.
 */
export function renderHallTicketGrid(
  doc: PDFKit.PDFDocument,
  rightMargin: number,
  topY: number,
): number {
  const boxSize = 15;
  const totalGridWidth = HALL_TICKET_BOX_COUNT * boxSize; // 150 pt
  const labelText = "Hall Ticket No.";

  doc.font("Times-Bold").fontSize(9);
  const labelWidth = doc.widthOfString(labelText);
  const gridStartX = rightMargin - totalGridWidth;
  const labelX = gridStartX - labelWidth - 6;

  doc.text(labelText, labelX, topY + 3, { lineBreak: false });

  doc.lineWidth(0.9);
  for (let i = 0; i < HALL_TICKET_BOX_COUNT; i++) {
    const boxX = gridStartX + i * boxSize;
    doc.rect(boxX, topY, boxSize, boxSize).stroke();
  }

  return topY + boxSize + 6;
}

/**
 * Renders an approved question paper snapshot to PDF replicating the CBIT Autonomous reference.
 */
export async function renderCollegeQuestionPaperPdf(
  paper: ApprovedPaperSnapshot,
): Promise<RenderedPdfResult> {
  return new Promise((resolve, reject) => {
    try {
      const leftMargin = 62;
      const rightMargin = 533.28; // 595.28 - 62
      const contentWidth = rightMargin - leftMargin; // 471.28 pt
      const pageBottomLimit = 738;
      const continuationTopY = 74;

      const doc = new PDFDocument({
        size: "A4", // 595.28 x 841.89 points
        margins: { top: 36, bottom: 55, left: leftMargin, right: 62 },
        bufferPages: true,
        autoFirstPage: true,
      });

      const chunks: Buffer[] = [];
      let finalPageCount = 1;

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("error", (err: Error) => reject(err));
      doc.on("end", () => {
        const buffer = Buffer.concat(chunks);
        const checksumSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
        resolve({
          buffer,
          pageCount: finalPageCount,
          checksumSha256,
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
          rendererVersion: RENDERER_VERSION,
        });
      });

      // Metadata derivations with safe fallbacks
      const institutionName = formatInstitutionHeading(paper.institutionName);
      const regulation = (paper.regulationCode || "R22").trim();
      const subjectCode = (paper.config?.subject?.code || "22CIE18").trim();
      const subjectName = (paper.config?.subject?.name || paper.title || "Examination Paper").trim();
      const examNameBase = (
        paper.config?.name || "B.E. (CET) VII Sem (Main) Examination November 2025"
      ).trim();
      const examNameParts = [examNameBase];
      if (paper.semester && !examNameBase.toLowerCase().includes(paper.semester.toLowerCase())) {
        examNameParts.push(paper.semester.trim());
      }
      if (paper.examDate && !examNameBase.toLowerCase().includes(paper.examDate.toLowerCase())) {
        examNameParts.push(paper.examDate.trim());
      }
      const examName = examNameParts.join(" — ");

      const durationStr = formatDuration(paper.config?.durationMinutes);
      const totalMarksStr = formatMarks(paper.config?.totalMarks ?? 60);

      // --- PAGE 1 HEADER ---

      // 1. Regulation Box (top left, matching reference R22 rounded box)
      renderRegulationBox(doc, regulation, leftMargin, 28);

      // 2. Optional 10-box Hall Ticket Number grid & Code No. (top right)
      let headerStartY = 58;
      if (paper.includeHallTicketGrid) {
        const afterGridY = renderHallTicketGrid(doc, rightMargin, 28);
        doc.font("Times-Bold").fontSize(11);
        const codeText = `Code No.: ${subjectCode}`;
        const codeWidth = doc.widthOfString(codeText);
        doc.text(codeText, rightMargin - codeWidth, afterGridY, { lineBreak: false });
        headerStartY = afterGridY + 16;
      } else {
        doc.font("Times-Bold").fontSize(11);
        const codeText = `Code No.: ${subjectCode}`;
        const codeWidth = doc.widthOfString(codeText);
        doc.text(codeText, rightMargin - codeWidth, 42, { lineBreak: false });
      }

      // 3. Institution Title (centered)
      doc.y = headerStartY;
      doc.font("Times-Bold").fontSize(12);
      doc.text(institutionName, leftMargin, doc.y, {
        width: contentWidth,
        align: "center",
      });

      // 4. Examination Name / Semester (centered)
      doc.moveDown(0.15);
      doc.font("Times-Bold").fontSize(11);
      doc.text(examName, leftMargin, doc.y, {
        width: contentWidth,
        align: "center",
      });

      // 5. Subject Name (centered, prominent)
      doc.moveDown(0.2);
      doc.font("Times-Bold").fontSize(14);
      doc.text(subjectName, leftMargin, doc.y, {
        width: contentWidth,
        align: "center",
      });

      // 6. Time and Max Marks row
      doc.moveDown(0.25);
      const metaY = doc.y;
      doc.font("Times-Bold").fontSize(10.5);
      doc.text(`Time: ${durationStr}`, leftMargin, metaY, { lineBreak: false });
      doc.text(`Max Marks: ${totalMarksStr}`, rightMargin - 120, metaY, {
        width: 120,
        align: "right",
        lineBreak: false,
      });

      // 7. Candidate Instructions / Note (with hanging indent matching CBIT reference)
      const noteY = metaY + 14;
      doc.font("Times-BoldItalic").fontSize(10.5);
      doc.text("Note:", leftMargin, noteY, { lineBreak: false });

      const noteIndent = 32;
      const noteTextX = leftMargin + noteIndent;
      const noteTextWidth = contentWidth - noteIndent;
      const defaultNoteText =
        '"Answer ALL questions from Part-A and Part-B (including internal choices) at one place and in the same order as in the question paper."';
      const rawInstructions = paper.config?.instructions?.trim();
      const noteText = rawInstructions || defaultNoteText;

      if (noteText === defaultNoteText) {
        doc.font("Times-Roman").fontSize(10.5);
        doc.text('"Answer ', noteTextX, noteY, { width: noteTextWidth, continued: true, lineGap: 1 });
        doc.font("Times-Bold").text("ALL", { continued: true });
        doc.font("Times-Roman").text(" questions from ", { continued: true });
        doc.font("Times-Bold").text("Part-A", { continued: true });
        doc.font("Times-Roman").text(" and ", { continued: true });
        doc.font("Times-Bold").text("Part-B", { continued: true });
        doc.font("Times-Roman").text(" (including ", { continued: true });
        doc.font("Times-Bold").text("internal choices", { continued: true });
        doc.font("Times-Roman").text(') at one place and in the same order as in the question paper."', {
          continued: false,
        });
      } else {
        doc.font("Times-Roman").fontSize(10.5);
        doc.text(noteText, noteTextX, noteY, {
          width: noteTextWidth,
          align: "left",
          lineGap: 1,
        });
      }

      doc.moveDown(0.25);

      // Keep top margin on subsequent pages below running header
      doc.page.margins.top = continuationTopY;

      // Column coordinates for tabular question layout (matching CBIT reference M | CO | BT)
      const colBTWidth = 22;
      const colCOWidth = 26;
      const colMWidth = 28;
      const rightColsTotalWidth = colMWidth + colCOWidth + colBTWidth; // 76 pt
      const textToMarksGap = 12;

      const colNumWidth = 21;
      const colSubWidth = 21;

      const colNumX = leftMargin;
      const colTextX = colNumX + colNumWidth;
      const colTextWidth = contentWidth - colNumWidth - rightColsTotalWidth - textToMarksGap; // ~362 pt

      const colSubX = colTextX;
      const colSubTextX = colSubX + colSubWidth;
      const colSubTextWidth = colTextWidth - colSubWidth; // ~341 pt

      const colMX = rightMargin - rightColsTotalWidth;
      const colCOX = colMX + colMWidth;
      const colBTX = colCOX + colCOWidth;

      let globalQuestionIndex = 1;

      const addContinuationPage = () => {
        doc.addPage({
          size: "A4",
          margins: { top: continuationTopY, bottom: 55, left: leftMargin, right: 62 },
        });
        doc.y = continuationTopY;
      };

      const ensureSpace = (requiredHeight: number) => {
        const maxSinglePageHeight = pageBottomLimit - continuationTopY;
        // If element fits on a single page but exceeds remaining space on current page, break now
        if (requiredHeight <= maxSinglePageHeight) {
          if (doc.y + requiredHeight > pageBottomLimit) {
            addContinuationPage();
          }
        } else if (doc.y > 240) {
          // For an extraordinarily tall question (> 1 page), start on a fresh page if not near top
          addContinuationPage();
        }
      };

      const renderColumnHeaders = () => {
        const headerY = doc.y;
        doc.font("Times-Bold").fontSize(10.5);
        doc.text("M", colMX, headerY, { width: colMWidth, align: "center", lineBreak: false });
        doc.text("CO", colCOX, headerY, { width: colCOWidth, align: "center", lineBreak: false });
        doc.text("BT", colBTX, headerY, { width: colBTWidth, align: "center", lineBreak: false });
        doc.y = headerY + 14;
      };

      // Iterate through sections
      const sections = paper.sections || [];
      for (const section of sections) {
        const { groups: questionGroups, nextQuestionNumber } = assembleSectionQuestionGroups(
          section,
          globalQuestionIndex,
        );
        globalQuestionIndex = nextQuestionNumber;

        // Ensure section header + column headers + first question don't orphan at page bottom
        ensureSpace(75);

        const sectionHeading = formatSectionHeading(section.sectionLabel);
        doc.moveDown(0.2);
        doc.font("Times-Bold").fontSize(10.5);
        doc.text(sectionHeading, leftMargin, doc.y, {
          width: contentWidth,
          align: "center",
        });

        const subtitle = formatSectionMarksSubtitle(section, questionGroups);
        doc.font("Times-Bold").fontSize(10.5);
        doc.text(subtitle, leftMargin, doc.y + 1, {
          width: contentWidth,
          align: "center",
        });

        doc.moveDown(0.15);
        renderColumnHeaders();

        // Render assembled question groups
        for (let gIdx = 0; gIdx < questionGroups.length; gIdx++) {
          const group = questionGroups[gIdx]!;

          if (!group.hasExplicitSubparts && group.subparts.length === 1) {
            // Standalone question (e.g. Part - A or standalone Part - B questions)
            const q = group.subparts[0]!;
            const qNum = `${group.mainNum}`;
            const qText = (q.questionText || "").trim();
            const mText = `(${formatMarks(q.marks)})`;
            const coText = String(q.courseOutcome ?? Math.min(5, gIdx + 1));
            const btText = String(mapBloomsToBT(q.bloomsLevel));

            doc.font("Times-Roman").fontSize(10.5);
            const textHeight = Math.max(
              doc.heightOfString(qText, { width: colTextWidth, lineGap: 1 }),
              13,
            );
            ensureSpace(textHeight + 4);

            const qY = doc.y;
            const startPageCount = doc.bufferedPageRange().count;

            doc.font("Times-Roman").fontSize(10.5);
            doc.text(qNum, colNumX, qY, { width: colNumWidth, lineBreak: false });
            doc.text(mText, colMX, qY, { width: colMWidth, align: "center", lineBreak: false });
            doc.text(coText, colCOX, qY, { width: colCOWidth, align: "center", lineBreak: false });
            doc.text(btText, colBTX, qY, { width: colBTWidth, align: "center", lineBreak: false });

            doc.text(qText, colTextX, qY, {
              width: colTextWidth,
              align: "left",
              lineGap: 1,
            });

            const endPageCount = doc.bufferedPageRange().count;
            if (endPageCount > startPageCount) {
              doc.y = doc.y + 4;
            } else {
              doc.y = qY + textHeight + 4;
            }
          } else {
            // Multi-part question (e.g. 6 (a), (b))
            doc.font("Times-Roman").fontSize(10.5);
            const subpartHeights = group.subparts.map((sub) =>
              Math.max(
                doc.heightOfString((sub.questionText || "").trim(), {
                  width: colSubTextWidth,
                  lineGap: 1,
                }),
                13,
              ),
            );
            const totalGroupHeight =
              subpartHeights.reduce((sum, h) => sum + h + 3, 0);

            // Keep (a) and (b) of the same question on the same page when practical
            if (totalGroupHeight <= 160) {
              ensureSpace(totalGroupHeight);
            }

            for (let sIdx = 0; sIdx < group.subparts.length; sIdx++) {
              const sub = group.subparts[sIdx]!;
              const rawLabel = sub.subpartLabel?.trim();
              const subLabel = rawLabel
                ? rawLabel.startsWith("(")
                  ? rawLabel
                  : `(${rawLabel.replace(/\)$/, "")})`
                : `(${String.fromCharCode(97 + sIdx)})`;
              const subText = (sub.questionText || "").trim();
              const mText = `(${formatMarks(sub.marks)})`;
              const defaultCo = Math.min(5, Math.floor(gIdx / 2) + 1);
              const coText = String(sub.courseOutcome ?? defaultCo);
              const btText = String(mapBloomsToBT(sub.bloomsLevel));

              doc.font("Times-Roman").fontSize(10.5);
              const textHeight = subpartHeights[sIdx] ?? 13;
              ensureSpace(textHeight + 3);

              const qY = doc.y;
              const startPageCount = doc.bufferedPageRange().count;

              if (sIdx === 0) {
                doc.font("Times-Roman").fontSize(10.5);
                doc.text(String(group.mainNum), colNumX, qY, {
                  width: colNumWidth,
                  lineBreak: false,
                });
              }

              doc.font("Times-Roman").fontSize(10.5);
              doc.text(subLabel, colSubX, qY, { width: colSubWidth, lineBreak: false });
              doc.text(mText, colMX, qY, { width: colMWidth, align: "center", lineBreak: false });
              doc.text(coText, colCOX, qY, { width: colCOWidth, align: "center", lineBreak: false });
              doc.text(btText, colBTX, qY, { width: colBTWidth, align: "center", lineBreak: false });

              doc.text(subText, colSubTextX, qY, {
                width: colSubTextWidth,
                align: "justify",
                lineGap: 1,
              });

              const endPageCount = doc.bufferedPageRange().count;
              if (endPageCount > startPageCount) {
                doc.y = doc.y + 3;
              } else {
                doc.y = qY + textHeight + 3;
              }
            }
          }

          // Render "(OR)" separator only when group.orWithNext is true
          if (group.orWithNext && gIdx < questionGroups.length - 1) {
            // Ensure (OR) and at least the first subpart of the alternative question fit,
            // or break before (OR) so (OR) appears cleanly at the top of the next page
            // (matching Page 2 of Social_Engineering_22CIE18.pdf).
            ensureSpace(78);
            doc.y += 1;
            doc.font("Times-Bold").fontSize(10.5);
            doc.text("(OR)", leftMargin, doc.y, {
              width: contentWidth,
              align: "center",
            });
            doc.y += 2;
          } else if (gIdx < questionGroups.length - 1) {
            // Distinct visual separation between independent question pairs/items
            doc.y += group.hasExplicitSubparts ? 10 : 2;
          }
        }
      }

      // Terminal exam marker *****
      ensureSpace(28);
      doc.moveDown(0.6);
      doc.font("Times-Bold").fontSize(10.5);
      doc.text("*****", leftMargin, doc.y, {
        width: contentWidth,
        align: "center",
      });

      // --- RUNNING HEADERS (PAGE 2+) & FOOTERS (ALL BUFFERED PAGES) ---
      const totalPages = doc.bufferedPageRange().count;
      finalPageCount = totalPages;
      for (let i = 0; i < totalPages; i++) {
        doc.switchToPage(i);
        const savedBottomMargin = doc.page.margins.bottom;
        const savedTopMargin = doc.page.margins.top;
        doc.page.margins.bottom = 0;
        doc.page.margins.top = 0;

        if (i >= 1) {
          renderRunningHeader(doc, regulation, subjectCode, leftMargin, rightMargin);
        }

        // Page Number at bottom margin ("Page X of Y")
        doc.font("Times-Bold").fontSize(9.5);
        doc.text(`Page ${i + 1} of ${totalPages}`, leftMargin, 785, {
          width: contentWidth,
          align: "center",
          lineBreak: false,
        });

        doc.page.margins.bottom = savedBottomMargin;
        doc.page.margins.top = savedTopMargin;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Renders the rounded regulation box (e.g. "R22") in the top-left corner.
 */
function renderRegulationBox(
  doc: PDFKit.PDFDocument,
  regulation: string,
  x: number,
  y: number,
) {
  const regBoxWidth = 42;
  const regBoxHeight = 24;
  doc.save();
  doc.lineWidth(1.8);
  doc.roundedRect(x, y, regBoxWidth, regBoxHeight, 4).stroke();
  doc.font("Helvetica-Bold").fontSize(12.5);
  doc.text(regulation, x, y + 5.5, {
    width: regBoxWidth,
    align: "center",
    lineBreak: false,
  });
  doc.restore();
}

/**
 * Renders the top regulation box and code number on continuation pages (Page 2+).
 */
function renderRunningHeader(
  doc: PDFKit.PDFDocument,
  regulation: string,
  subjectCode: string,
  leftMargin: number,
  rightMargin: number,
) {
  renderRegulationBox(doc, regulation, leftMargin, 28);

  doc.font("Times-Bold").fontSize(11);
  const codeText = `Code No.: ${subjectCode}`;
  const codeWidth = doc.widthOfString(codeText);
  doc.text(codeText, rightMargin - codeWidth, 42, { lineBreak: false });
}
