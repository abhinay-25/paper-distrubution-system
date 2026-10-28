/**
 * Paper Calculator Module — Step 8
 *
 * Dedicated, pure arithmetic module for calculating:
 *  - Individual question marks
 *  - Section printed totals vs. student achievable marks
 *  - Optional-choice rule calculations (e.g. Answer 3 of 5)
 *  - Overall paper printed marks vs. achievable marks
 *  - Discrepancy against configured examination total marks
 *
 * All arithmetic uses rounded two-decimal precision to avoid floating-point errors.
 */

export interface CalculationSlot {
  id: string;
  sequenceOrder?: number;
  allocatedMarks: number | string;
}

export interface CalculationSection {
  id: string;
  sectionLabel: string;
  title: string;
  requiredAnswers?: number | null;
  slots: CalculationSlot[];
}

export interface SectionCalculationSummary {
  sectionId: string;
  sectionLabel: string;
  title: string;
  slotCount: number;
  requiredAnswers: number | null;
  printedMarks: number;
  achievableMarks: number;
  isOptionalChoice: boolean;
  isChoiceAmbiguous: boolean;
  ambiguityReason?: string;
}

export interface PaperCalculationResult {
  totalPrintedMarks: number;
  totalAchievableMarks: number;
  configTotalMarks: number;
  marksDiscrepancy: number;
  isMarksMatch: boolean;
  totalSlots: number;
  totalRequiredQuestions: number;
  sectionSummaries: SectionCalculationSummary[];
}

/**
 * Rounds a number to two decimal places.
 */
export function round2(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * Calculates printed and achievable marks for a single section.
 */
export function calculateSectionMarks(section: CalculationSection): SectionCalculationSummary {
  const slotCount = section.slots.length;
  const marksList = section.slots.map((s) => round2(Number(s.allocatedMarks) || 0));
  const printedMarks = round2(marksList.reduce((sum, m) => sum + m, 0));

  const required = section.requiredAnswers;

  // Case 1: Invalid choice configuration where requiredAnswers > slotCount
  if (typeof required === "number" && required > slotCount) {
    return {
      sectionId: section.id,
      sectionLabel: section.sectionLabel,
      title: section.title,
      slotCount,
      requiredAnswers: required,
      printedMarks,
      achievableMarks: printedMarks,
      isOptionalChoice: true,
      isChoiceAmbiguous: true,
      ambiguityReason: `Required answers (${required}) exceeds available question slots (${slotCount})`,
    };
  }

  const isOptionalChoice = typeof required === "number" && required > 0 && required < slotCount;

  // Case 2: Simple mandatory section (required is null, undefined, or equals slotCount)
  if (!isOptionalChoice) {
    return {
      sectionId: section.id,
      sectionLabel: section.sectionLabel,
      title: section.title,
      slotCount,
      requiredAnswers: required ?? null,
      printedMarks,
      achievableMarks: printedMarks,
      isOptionalChoice: false,
      isChoiceAmbiguous: false,
    };
  }

  // Case 3: Optional section (required < slotCount)
  // Check if all question slots have identical marks
  const firstMark = marksList[0] ?? 0;
  const allUniform = marksList.every((m) => Math.abs(m - firstMark) < 0.001);

  if (allUniform) {
    // If all questions are worth M marks and students answer K questions, achievable = K * M
    const achievable = round2(required! * firstMark);
    return {
      sectionId: section.id,
      sectionLabel: section.sectionLabel,
      title: section.title,
      slotCount,
      requiredAnswers: required!,
      printedMarks,
      achievableMarks: achievable,
      isOptionalChoice: true,
      isChoiceAmbiguous: false,
    };
  }

  // If questions have non-uniform marks, student achievable score depends on which questions they choose.
  // We compute the achievable marks assuming standard maximum score (sum of top K marks),
  // but explicitly flag as ambiguous so faculty can review or standardize slot marks.
  const sortedDesc = [...marksList].sort((a, b) => b - a);
  const maxPossibleAchievable = round2(
    sortedDesc.slice(0, required!).reduce((sum, m) => sum + m, 0),
  );

  return {
    sectionId: section.id,
    sectionLabel: section.sectionLabel,
    title: section.title,
    slotCount,
    requiredAnswers: required!,
    printedMarks,
    achievableMarks: maxPossibleAchievable,
    isOptionalChoice: true,
    isChoiceAmbiguous: true,
    ambiguityReason: `Optional section has non-uniform slot marks (${marksList.join(", ")}). Achievable marks (${maxPossibleAchievable}) assumes highest-value questions chosen.`,
  };
}

/**
 * Calculates whole paper totals against the exam configuration totalMarks.
 */
export function calculatePaperMarks(
  sections: CalculationSection[],
  configTotalMarks: number,
): PaperCalculationResult {
  const roundedConfigMarks = round2(configTotalMarks);
  let totalPrinted = 0;
  let totalAchievable = 0;
  let totalSlots = 0;
  let totalRequiredQuestions = 0;

  const sectionSummaries: SectionCalculationSummary[] = [];

  for (const section of sections) {
    const summary = calculateSectionMarks(section);
    sectionSummaries.push(summary);

    totalPrinted += summary.printedMarks;
    totalAchievable += summary.achievableMarks;
    totalSlots += summary.slotCount;
    totalRequiredQuestions += summary.requiredAnswers ?? summary.slotCount;
  }

  const roundedPrinted = round2(totalPrinted);
  const roundedAchievable = round2(totalAchievable);
  const marksDiscrepancy = round2(Math.abs(roundedAchievable - roundedConfigMarks));
  const isMarksMatch = marksDiscrepancy <= 0.01;

  return {
    totalPrintedMarks: roundedPrinted,
    totalAchievableMarks: roundedAchievable,
    configTotalMarks: roundedConfigMarks,
    marksDiscrepancy,
    isMarksMatch,
    totalSlots,
    totalRequiredQuestions,
    sectionSummaries,
  };
}
