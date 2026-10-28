import fs from 'node:fs';
import path from 'node:path';
import { renderCollegeQuestionPaperPdf, type ApprovedPaperSnapshot } from '../src/services/pdfRendererService.js';

async function main() {
  const snapshot: ApprovedPaperSnapshot = {
    id: 'sample-paper-cbit',
    title: 'Social Engineering Examination Paper',
    version: 1,
    institutionName: 'CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)',
    regulationCode: 'R22',
    config: {
      name: 'B.E. (CET) VII Sem (Main) Examination November 2025',
      totalMarks: 60,
      durationMinutes: 180,
      instructions:
        '"Answer ALL questions from Part-A and Part-B (including internal choices) at one place and in the same order as in the question paper."',
      subject: { id: 'sub-1', name: 'Social Engineering', code: '22CIE18' },
    },
    sections: [
      {
        sectionLabel: 'Part - A',
        title: 'Part A',
        requiredAnswers: 5,
        totalSlots: 5,
        sectionMarks: 10,
        questions: [
          { sequenceOrder: 1, questionText: 'Explain why social engineering is considered a major security threat.', marks: 2, bloomsLevel: 'UNDERSTAND', courseOutcome: 1 },
          { sequenceOrder: 2, questionText: 'Give one major challenge of OSINT.', marks: 2, bloomsLevel: 'REMEMBER', courseOutcome: 2 },
          { sequenceOrder: 3, questionText: 'Define phishing.', marks: 2, bloomsLevel: 'REMEMBER', courseOutcome: 3 },
          { sequenceOrder: 4, questionText: 'Define what is meant by measurement in social engineering attack detection.', marks: 2, bloomsLevel: 'REMEMBER', courseOutcome: 4 },
          { sequenceOrder: 5, questionText: 'What is the purpose of awareness programs in social engineering defense?', marks: 2, bloomsLevel: 'REMEMBER', courseOutcome: 5 },
        ],
      },
      {
        sectionLabel: 'Part - B',
        title: 'Part B',
        requiredAnswers: 5,
        totalSlots: 10,
        sectionMarks: 50,
        questions: [
          { sequenceOrder: 1, questionText: 'Assess the effectiveness of training programs in reducing social engineering attempts.', marks: 5, bloomsLevel: 'ANALYZE', courseOutcome: 1, subpartLabel: '(a)' },
          { sequenceOrder: 2, questionText: 'Compare ethical and unethical uses of social engineering in cybersecurity.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 1, subpartLabel: '(b)' },
          { sequenceOrder: 3, questionText: 'Explain the role of cognitive biases in making individuals vulnerable to social engineering.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 1, subpartLabel: '(a)' },
          { sequenceOrder: 4, questionText: 'Discuss the importance of education and awareness in preventing social engineering attacks.', marks: 5, bloomsLevel: 'APPLY', courseOutcome: 1, subpartLabel: '(b)' },
          { sequenceOrder: 5, questionText: 'Explain the contribution of organizational OSINT efforts in global security.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 2, subpartLabel: '(a)' },
          { sequenceOrder: 6, questionText: 'Differentiate between legal and ethical issues in OSINT.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 2, subpartLabel: '(b)' },
          { sequenceOrder: 7, questionText: 'Discuss the significance of different OSINT types in modern cybersecurity.', marks: 5, bloomsLevel: 'APPLY', courseOutcome: 2, subpartLabel: '(a)' },
          { sequenceOrder: 8, questionText: 'Explain how OSINT aids cost reduction in intelligence gathering.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 2, subpartLabel: '(b)' },
          { sequenceOrder: 9, questionText: 'Explain how attackers misuse file-sharing systems in P2P attacks.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 3, subpartLabel: '(a)' },
          { sequenceOrder: 10, questionText: 'Explain how scareware manipulates user emotions.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 3, subpartLabel: '(b)' },
          { sequenceOrder: 11, questionText: 'Explain how worms differ from viruses.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 3, subpartLabel: '(a)' },
          { sequenceOrder: 12, questionText: 'Examine the role of email and instant messaging in spreading malware links.', marks: 5, bloomsLevel: 'ANALYZE', courseOutcome: 3, subpartLabel: '(b)' },
          { sequenceOrder: 13, questionText: 'Explain why early detection of social engineering attacks is important.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 4, subpartLabel: '(a)' },
          { sequenceOrder: 14, questionText: 'Describe how social media platforms can be analyzed using OSINT software.', marks: 5, bloomsLevel: 'APPLY', courseOutcome: 4, subpartLabel: '(b)' },
          { sequenceOrder: 15, questionText: 'Discuss the challenges involved in measuring social engineering attack incidents.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 4, subpartLabel: '(a)' },
          { sequenceOrder: 16, questionText: 'Analyze how OSINT analysis tools contribute to detecting and preventing social engineering attacks.', marks: 5, bloomsLevel: 'ANALYZE', courseOutcome: 4, subpartLabel: '(b)' },
          { sequenceOrder: 17, questionText: 'Explain how reputation monitoring can prevent social engineering attacks.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 5, subpartLabel: '(a)' },
          { sequenceOrder: 18, questionText: 'Explain how using a VPN contributes to safe network use.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 5, subpartLabel: '(b)' },
          { sequenceOrder: 19, questionText: 'Explain the importance of multi-factor authentication in account security.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 5, subpartLabel: '(a)' },
          { sequenceOrder: 20, questionText: 'Explain why keeping software updated is important for device security.', marks: 5, bloomsLevel: 'UNDERSTAND', courseOutcome: 5, subpartLabel: '(b)' },
        ],
      },
    ],
  };

  const result = await renderCollegeQuestionPaperPdf(snapshot);
  const outDir = path.resolve('./storage/pdf-artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'sample_cbit_rendered.pdf');
  fs.writeFileSync(outFile, result.buffer);
  console.log('SUCCESS: Written sample PDF to:', outFile);
  console.log('Page count:', result.pageCount);
  console.log('File size (bytes):', result.buffer.length);
  console.log('SHA-256 Checksum:', result.checksumSha256);
}

main().catch(console.error);

