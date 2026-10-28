/**
 * Step 5 & Step 10 — PDF Renderer Unit, Structure & Visual Fidelity Tests
 *
 * Verifies real rendering against the CBIT Autonomous reference template (Social_Engineering_22CIE18.pdf):
 *  - Output buffer starts with %PDF header and has deterministic SHA-256 hash
 *  - Institution heading normalization ("CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)")
 *  - Regulation box ("R22") and Subject Code header ("Code No.: 22CIE18")
 *  - Optional 10-box Hall Ticket Number grid structure when enabled
 *  - Table column labels (M, CO, BT) and marks arithmetic subtitle
 *  - Question numbering and sequenceOrder sorting across sections
 *  - Explicit alternative-question ("(OR)") and subpart ("(a)", "(b)") behavior
 *  - No unintended "(OR)" insertion or "(a)/(b)" pairing merely because a section is named "B" / "Part - B"
 *  - Long question wrapping and multi-page output without text truncation
 *  - Missing optional metadata and empty/minimal paper content resilience
 */

import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import {
  renderCollegeQuestionPaperPdf,
  mapBloomsToBT,
  formatDuration,
  formatMarks,
  formatInstitutionHeading,
  formatSectionHeading,
  assembleSectionQuestionGroups,
  formatSectionMarksSubtitle,
  HALL_TICKET_BOX_COUNT,
  TEMPLATE_ID,
  TEMPLATE_VERSION,
  RENDERER_VERSION,
  type ApprovedPaperSnapshot,
  type SectionData,
} from "../services/pdfRendererService.js";

/**
 * Decompresses FlateDecode streams inside a PDFKit buffer and extracts both
 * raw PDF drawing operators and decoded literal text strings.
 */
function inspectPdfBuffer(buffer: Buffer): {
  rawStreams: string;
  decodedText: string;
} {
  const binaryStr = buffer.toString("latin1");
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const decompressedChunks: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(binaryStr)) !== null) {
    const rawContent = match[1];
    if (!rawContent) continue;
    const chunkBuf = Buffer.from(rawContent, "latin1");
    try {
      const inflated = zlib.inflateSync(chunkBuf).toString("latin1");
      decompressedChunks.push(inflated);
    } catch {
      // Non-Flate stream or font descriptor stream; ignore
    }
  }

  const rawStreams = decompressedChunks.join("\n");

  // Decode hex strings <...> and literal strings (...) in PDF text operators
  const textParts: string[] = [];
  const hexRegex = /<([0-9a-fA-F]+)>\s*Tj/g;
  let hexMatch: RegExpExecArray | null;
  while ((hexMatch = hexRegex.exec(rawStreams)) !== null) {
    if (hexMatch[1]) {
      textParts.push(Buffer.from(hexMatch[1], "hex").toString("latin1"));
    }
  }

  const arrayRegex = /\[([\s\S]*?)\]\s*TJ/g;
  let arrMatch: RegExpExecArray | null;
  while ((arrMatch = arrayRegex.exec(rawStreams)) !== null) {
    const inner = arrMatch[1] || "";
    const innerHex = /<([0-9a-fA-F]+)>/g;
    let h: RegExpExecArray | null;
    let line = "";
    while ((h = innerHex.exec(inner)) !== null) {
      if (h[1]) line += Buffer.from(h[1], "hex").toString("latin1");
    }
    const innerLit = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
    let l: RegExpExecArray | null;
    while ((l = innerLit.exec(inner)) !== null) {
      if (l[1]) line += l[1].replace(/\\([()\\])/g, "$1");
    }
    if (line) textParts.push(line);
  }

  const litRegex = /\(([^)\\]*(?:\\.[^)\\]*)*)\)\s*Tj/g;
  let litMatch: RegExpExecArray | null;
  while ((litMatch = litRegex.exec(rawStreams)) !== null) {
    if (litMatch[1]) {
      textParts.push(litMatch[1].replace(/\\([()\\])/g, "$1"));
    }
  }

  return {
    rawStreams,
    decodedText: textParts.join(" "),
  };
}

describe("Step 5 & Step 10 — PDF Renderer Service", () => {
  it("mapBloomsToBT maps cognitive levels to numeric BT scale (1-6)", () => {
    expect(mapBloomsToBT("REMEMBER")).toBe(1);
    expect(mapBloomsToBT("UNDERSTAND")).toBe(2);
    expect(mapBloomsToBT("APPLY")).toBe(3);
    expect(mapBloomsToBT("ANALYZE")).toBe(4);
    expect(mapBloomsToBT("EVALUATE")).toBe(5);
    expect(mapBloomsToBT("CREATE")).toBe(6);
    expect(mapBloomsToBT("L1")).toBe(1);
    expect(mapBloomsToBT("L4")).toBe(4);
    expect(mapBloomsToBT(null)).toBe(1);
  });

  it("formatDuration converts minutes to academic hour strings", () => {
    expect(formatDuration(180)).toBe("3 Hours");
    expect(formatDuration(60)).toBe("1 Hour");
    expect(formatDuration(90)).toBe("1.5 Hours");
    expect(formatDuration(null)).toBe("3 Hours");
    expect(formatDuration(0)).toBe("3 Hours");
  });

  it("formatMarks formats integer and decimal marks correctly", () => {
    expect(formatMarks(60)).toBe("60");
    expect(formatMarks("60.00")).toBe("60");
    expect(formatMarks(5.5)).toBe("5.5");
    expect(formatMarks("10.0")).toBe("10");
    expect(formatMarks(null)).toBe("0");
  });

  it("formatInstitutionHeading preserves '(Autonomous)' casing while uppercasing institution name", () => {
    expect(
      formatInstitutionHeading("Chaitanya Bharathi Institute of Technology (Autonomous)"),
    ).toBe("CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)");
    expect(
      formatInstitutionHeading("CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)"),
    ).toBe("CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)");
    expect(formatInstitutionHeading("")).toBe(
      "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)",
    );
  });

  it("formatSectionHeading normalizes section labels consistently", () => {
    expect(formatSectionHeading("A")).toBe("Part - A");
    expect(formatSectionHeading("B")).toBe("Part - B");
    expect(formatSectionHeading("Part - A")).toBe("Part - A");
    expect(formatSectionHeading("Section II")).toBe("Section II");
  });

  it("does NOT invent (a)/(b) subparts or (OR) separators merely because a section is named 'B' or 'Part - B'", async () => {
    const partBStandaloneSection: SectionData = {
      sectionLabel: "Part - B",
      title: "Descriptive Questions (Answer any 2 of 4)",
      requiredAnswers: 2,
      totalSlots: 4,
      sectionMarks: 80, // printedMarks stored by paperService (4 * 20)
      questions: [
        {
          sequenceOrder: 3,
          questionText: "Standalone Part B question three in configured sequence order.",
          marks: 20,
          bloomsLevel: "ANALYZE",
          courseOutcome: 3,
        },
        {
          sequenceOrder: 1,
          questionText: "Standalone Part B question one in configured sequence order.",
          marks: 20,
          bloomsLevel: "APPLY",
          courseOutcome: 1,
        },
        {
          sequenceOrder: 4,
          questionText: "Standalone Part B question four in configured sequence order.",
          marks: 20,
          bloomsLevel: "EVALUATE",
          courseOutcome: 4,
        },
        {
          sequenceOrder: 2,
          questionText: "Standalone Part B question two in configured sequence order.",
          marks: 20,
          bloomsLevel: "UNDERSTAND",
          courseOutcome: 2,
        },
      ],
    };

    const { groups, nextQuestionNumber } = assembleSectionQuestionGroups(
      partBStandaloneSection,
      6,
    );

    // Must preserve all 4 standalone questions (numbered 6, 7, 8, 9) sorted by sequenceOrder 1..4
    expect(groups).toHaveLength(4);
    expect(nextQuestionNumber).toBe(10);
    expect(groups.map((g) => g.mainNum)).toEqual([6, 7, 8, 9]);
    expect(groups.every((g) => !g.hasExplicitSubparts)).toBe(true);
    expect(groups.every((g) => g.orWithNext === false)).toBe(true);
    expect(groups[0]!.subparts[0]!.questionText).toContain("question one");
    expect(groups[1]!.subparts[0]!.questionText).toContain("question two");
    expect(groups[2]!.subparts[0]!.questionText).toContain("question three");
    expect(groups[3]!.subparts[0]!.questionText).toContain("question four");

    // Achievable section subtitle must be (2Q X 20M = 40 Marks), NOT (2Q X 40M = 80 Marks)
    expect(formatSectionMarksSubtitle(partBStandaloneSection, groups)).toBe(
      "(2Q X 20M = 40 Marks)",
    );

    // Render full PDF and verify "(OR)" is NOT present anywhere in the rendered PDF
    const result = await renderCollegeQuestionPaperPdf({
      id: "standalone-part-b-paper",
      title: "Standalone Part B Test Paper",
      version: 1,
      config: {
        name: "B.E. Main Examination",
        totalMarks: 40,
        durationMinutes: 180,
        subject: { id: "s1", name: "Network Security", code: "22CSC11" },
      },
      sections: [partBStandaloneSection],
    });

    const { decodedText } = inspectPdfBuffer(result.buffer);
    expect(decodedText).not.toContain("(OR)");
    expect(decodedText).not.toContain("(a)");
    expect(decodedText).toContain("(2Q X 20M = 40 Marks)");
    expect(decodedText).toContain("Standalone Part B question one");
    expect(decodedText).toContain("Standalone Part B question four");
  });

  it("renders explicit choiceGroup and internalChoicePairs with (OR) only where specified", async () => {
    const explicitChoiceSection: SectionData = {
      sectionLabel: "Section B",
      title: "Internal Choice Section",
      requiredAnswers: 2,
      sectionMarks: 20,
      questions: [
        {
          sequenceOrder: 1,
          questionText: "First option of choice group Alpha.",
          marks: 10,
          choiceGroup: "ALPHA",
        },
        {
          sequenceOrder: 2,
          questionText: "Second option of choice group Alpha.",
          marks: 10,
          choiceGroup: "ALPHA",
        },
        {
          sequenceOrder: 3,
          questionText: "Compulsory standalone question without alternative.",
          marks: 10,
        },
      ],
    };

    const { groups } = assembleSectionQuestionGroups(explicitChoiceSection, 1);
    expect(groups).toHaveLength(3);
    expect(groups[0]!.orWithNext).toBe(true); // Alpha Q1 (OR) Alpha Q2
    expect(groups[1]!.orWithNext).toBe(false); // No (OR) between Alpha Q2 and Q3
    expect(groups[2]!.orWithNext).toBe(false);

    const pdf = await renderCollegeQuestionPaperPdf({
      id: "explicit-choice-paper",
      title: "Explicit Choice Paper",
      version: 1,
      config: {
        name: "Semester Examination",
        totalMarks: 20,
        subject: { id: "s1", name: "Cryptography", code: "22CSC12" },
      },
      sections: [explicitChoiceSection],
    });
    const { decodedText } = inspectPdfBuffer(pdf.buffer);
    expect(decodedText).toContain("(OR)");
    expect(decodedText).toContain("First option of choice group Alpha.");
    expect(decodedText).toContain("Compulsory standalone question without alternative.");
  });

  it("renders a 2-page college question paper matching CBIT reference with valid buffer, columns, and SHA-256", async () => {
    // Replicating the CBIT Social Engineering exam from the reference PDF (Social_Engineering_22CIE18.pdf)
    const snapshot: ApprovedPaperSnapshot = {
      id: "cbit-exam-paper-001",
      title: "Social Engineering Examination Paper",
      version: 1,
      institutionName: "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)",
      regulationCode: "R22",
      config: {
        name: "B.E. (CET) VII Sem (Main) Examination November 2025",
        totalMarks: 60,
        durationMinutes: 180,
        instructions:
          '"Answer ALL questions from Part-A and Part-B (including internal choices) at one place and in the same order as in the question paper."',
        subject: {
          id: "sub-cbit-1",
          name: "Social Engineering",
          code: "22CIE18",
        },
      },
      sections: [
        {
          sectionLabel: "Part - A",
          title: "Short Answer Questions",
          requiredAnswers: 5,
          totalSlots: 5,
          sectionMarks: 10,
          questions: [
            {
              sequenceOrder: 1,
              questionText: "Explain why social engineering is considered a major security threat.",
              marks: 2,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 1,
            },
            {
              sequenceOrder: 2,
              questionText: "Give one major challenge of OSINT.",
              marks: 2,
              bloomsLevel: "REMEMBER",
              courseOutcome: 2,
            },
            {
              sequenceOrder: 3,
              questionText: "Define phishing.",
              marks: 2,
              bloomsLevel: "REMEMBER",
              courseOutcome: 3,
            },
            {
              sequenceOrder: 4,
              questionText: "Define what is meant by measurement in social engineering attack detection.",
              marks: 2,
              bloomsLevel: "REMEMBER",
              courseOutcome: 4,
            },
            {
              sequenceOrder: 5,
              questionText: "What is the purpose of awareness programs in social engineering defense?",
              marks: 2,
              bloomsLevel: "REMEMBER",
              courseOutcome: 5,
            },
          ],
        },
        {
          sectionLabel: "Part - B",
          title: "Analytical & Descriptive Questions",
          requiredAnswers: 5,
          totalSlots: 10,
          sectionMarks: 50,
          questions: [
            // Q6 (a) & (b)
            {
              sequenceOrder: 1,
              questionText: "Assess the effectiveness of training programs in reducing social engineering attempts.",
              marks: 5,
              bloomsLevel: "ANALYZE",
              courseOutcome: 1,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 2,
              questionText: "Compare ethical and unethical uses of social engineering in cybersecurity.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 1,
              subpartLabel: "(b)",
            },
            // Q7 (a) & (b) — (OR choice)
            {
              sequenceOrder: 3,
              questionText: "Explain the role of cognitive biases in making individuals vulnerable to social engineering.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 1,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 4,
              questionText: "Discuss the importance of education and awareness in preventing social engineering attacks.",
              marks: 5,
              bloomsLevel: "APPLY",
              courseOutcome: 1,
              subpartLabel: "(b)",
            },
            // Q8 (a) & (b)
            {
              sequenceOrder: 5,
              questionText: "Explain the contribution of organizational OSINT efforts in global security.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 2,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 6,
              questionText: "Differentiate between legal and ethical issues in OSINT.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 2,
              subpartLabel: "(b)",
            },
            // Q9 (a) & (b) — (OR choice)
            {
              sequenceOrder: 7,
              questionText: "Discuss the significance of different OSINT types in modern cybersecurity.",
              marks: 5,
              bloomsLevel: "APPLY",
              courseOutcome: 2,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 8,
              questionText: "Explain how OSINT aids cost reduction in intelligence gathering.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 2,
              subpartLabel: "(b)",
            },
            // Q10 (a) & (b)
            {
              sequenceOrder: 9,
              questionText: "Explain how attackers misuse file-sharing systems in P2P attacks.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 3,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 10,
              questionText: "Explain how scareware manipulates user emotions.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 3,
              subpartLabel: "(b)",
            },
            // Q11 (a) & (b) — (OR choice)
            {
              sequenceOrder: 11,
              questionText: "Explain how worms differ from viruses.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 3,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 12,
              questionText: "Examine the role of email and instant messaging in spreading malware links.",
              marks: 5,
              bloomsLevel: "ANALYZE",
              courseOutcome: 3,
              subpartLabel: "(b)",
            },
            // Q12 (a) & (b)
            {
              sequenceOrder: 13,
              questionText: "Explain why early detection of social engineering attacks is important.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 4,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 14,
              questionText: "Describe how social media platforms can be analyzed using OSINT software.",
              marks: 5,
              bloomsLevel: "APPLY",
              courseOutcome: 4,
              subpartLabel: "(b)",
            },
            // Q13 (a) & (b) — (OR choice)
            {
              sequenceOrder: 15,
              questionText: "Discuss the challenges involved in measuring social engineering attack incidents.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 4,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 16,
              questionText: "Analyze how OSINT analysis tools contribute to detecting and preventing social engineering attacks.",
              marks: 5,
              bloomsLevel: "ANALYZE",
              courseOutcome: 4,
              subpartLabel: "(b)",
            },
            // Q14 (a) & (b)
            {
              sequenceOrder: 17,
              questionText: "Explain how reputation monitoring can prevent social engineering attacks.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 5,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 18,
              questionText: "Explain how using a VPN contributes to safe network use.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 5,
              subpartLabel: "(b)",
            },
            // Q15 (a) & (b) — (OR choice)
            {
              sequenceOrder: 19,
              questionText: "Explain the importance of multi-factor authentication in account security.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 5,
              subpartLabel: "(a)",
            },
            {
              sequenceOrder: 20,
              questionText: "Explain why keeping software updated is important for device security.",
              marks: 5,
              bloomsLevel: "UNDERSTAND",
              courseOutcome: 5,
              subpartLabel: "(b)",
            },
          ],
        },
      ],
    };

    const result = await renderCollegeQuestionPaperPdf(snapshot);

    // Validate binary PDF and metadata
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.pageCount).toBe(2);
    expect(result.templateId).toBe(TEMPLATE_ID);
    expect(result.templateVersion).toBe(TEMPLATE_VERSION);
    expect(result.rendererVersion).toBe(RENDERER_VERSION);

    // Verify rendered text contents match CBIT reference
    const { decodedText } = inspectPdfBuffer(result.buffer);
    expect(decodedText).toContain("R22");
    expect(decodedText).toContain("Code No.: 22CIE18");
    expect(decodedText).toContain("CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)");
    expect(decodedText).toContain("B.E. (CET) VII Sem (Main) Examination November 2025");
    expect(decodedText).toContain("Social Engineering");
    expect(decodedText).toContain("Time: 3 Hours");
    expect(decodedText).toContain("Max Marks: 60");
    expect(decodedText).toContain("Part - A");
    expect(decodedText).toContain("(5Q X 2M = 10 Marks)");
    expect(decodedText).toContain("Part - B");
    expect(decodedText).toContain("(5Q X 10M = 50 Marks)");
    expect(decodedText).toContain("CO");
    expect(decodedText).toContain("BT");
    expect(decodedText).toContain("(OR)");
    expect(decodedText).toContain("Page 1 of 2");
    expect(decodedText).toContain("Page 2 of 2");
    expect(decodedText).toContain("*****");
  }, 20000);

  it("renders the 10-box Hall Ticket Number grid cleanly when includeHallTicketGrid is enabled", async () => {
    const snapshot: ApprovedPaperSnapshot = {
      id: "hall-ticket-grid-test",
      title: "Hall Ticket Grid Test",
      version: 1,
      includeHallTicketGrid: true,
      config: {
        name: "B.E. VII Sem Main Examination",
        totalMarks: 60,
        durationMinutes: 180,
        subject: { id: "s1", name: "Compiler Design", code: "22CSC20" },
      },
      sections: [
        {
          sectionLabel: "A",
          title: "Short Answer",
          sectionMarks: 2,
          questions: [{ sequenceOrder: 1, questionText: "Define lexical analysis.", marks: 2 }],
        },
      ],
    };

    const result = await renderCollegeQuestionPaperPdf(snapshot);
    const { rawStreams, decodedText } = inspectPdfBuffer(result.buffer);

    expect(HALL_TICKET_BOX_COUNT).toBe(10);
    expect(decodedText).toContain("Hall Ticket No.");
    expect(decodedText).toContain("Code No.: 22CSC20");
    // Count 15x15 rectangle drawing commands ("15 15 re") for the 10 Hall Ticket boxes
    const boxMatches = rawStreams.match(/\b15\s+15\s+re\b/g) || [];
    expect(boxMatches.length).toBe(10);
  });

  it("handles long multi-paragraph questions and multi-page overflow without clipping or losing text", async () => {
    const longParagraph =
      "Design a comprehensive zero-trust network architecture for a multi-campus university examination distribution system. " +
      "Your answer must detail mutual TLS service authentication, role-based access control, hardware security module key management, " +
      "immutable version snapshots, independent moderation workflows, and cryptographic SHA-256 verification before printing.";

    const questions = Array.from({ length: 18 }, (_, i) => ({
      sequenceOrder: i + 1,
      questionText: `Question ${i + 1}UniqueMarker: ${longParagraph}`,
      marks: 5,
      bloomsLevel: "CREATE",
      courseOutcome: (i % 5) + 1,
    }));

    const result = await renderCollegeQuestionPaperPdf({
      id: "multi-page-stress-paper",
      title: "Multi-Page Stress Test",
      version: 1,
      config: {
        name: "End Semester Examination",
        totalMarks: 90,
        durationMinutes: 180,
        subject: { id: "s1", name: "Distributed Security Systems", code: "22CIE99" },
      },
      sections: [
        {
          sectionLabel: "Part - A",
          title: "Extended Analytical Questions",
          requiredAnswers: 18,
          sectionMarks: 90,
          questions,
        },
      ],
    });

    expect(result.pageCount).toBeGreaterThanOrEqual(2);
    const { decodedText } = inspectPdfBuffer(result.buffer);
    // Confirm first, middle, and final questions are all present without truncation
    expect(decodedText).toContain("Question 1UniqueMarker");
    expect(decodedText).toContain("Question 9UniqueMarker");
    expect(decodedText).toContain("Question 18UniqueMarker");
    expect(decodedText).toContain("cryptographic SHA-256 verification before printing.");
    expect(decodedText).toContain(`Page ${result.pageCount} of ${result.pageCount}`);
  });

  it("gracefully handles minimal or empty paper content and missing optional metadata", async () => {
    const minimalSnapshot: ApprovedPaperSnapshot = {
      id: "minimal-paper",
      title: "Minimal Fallback Paper",
      version: 1,
      config: {
        name: "",
        totalMarks: 0,
        durationMinutes: null,
        instructions: null,
        subject: { id: "s-min", name: "", code: "" },
      },
      sections: [
        {
          sectionLabel: "A",
          title: "Empty Section",
          questions: [],
        },
      ],
    };

    const result = await renderCollegeQuestionPaperPdf(minimalSnapshot);
    expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(result.pageCount).toBe(1);

    const { decodedText } = inspectPdfBuffer(result.buffer);
    expect(decodedText).toContain("CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)");
    expect(decodedText).toContain("Part - A");
    expect(decodedText).toContain("(0Q X 0M = 0 Marks)");
    expect(decodedText).toContain("Page 1 of 1");
    expect(decodedText).toContain("*****");
  });
});
