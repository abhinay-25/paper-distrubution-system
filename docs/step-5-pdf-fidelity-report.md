# Step 5 — CBIT Examination Paper PDF Fidelity, Print Layout & Question Structure Report

## 1. Summary

This step inspected the official CBIT reference examination paper (`Social_Engineering_22CIE18.pdf`) and upgraded the PDF generation pipeline, paper snapshot capture, and frontend paper preview/approval screens so that generated examination question papers match the verified institutional print layout of **Chaitanya Bharathi Institute of Technology (Autonomous)**.

Key accomplishments:
- **Reference-Faithful CBIT Print Layout**: Upgraded [`pdfRendererService.ts`](file:///c:/paper-distribution-system/backend/src/services/pdfRendererService.ts) to match the exact visual hierarchy, typography, margins (`leftMargin = 62pt`, `rightMargin = 533.28pt` on A4), top-left rounded `[ R22 ]` regulation box, top-right `Code No.: <subjectCode>`, mixed-case `(Autonomous)` heading, hanging-indented `Note:` with bold keywords (`ALL`, `Part-A`, `Part-B`, `internal choices`), and right-aligned `M | CO | BT` columns from `Social_Engineering_22CIE18.pdf`.
- **Optional 10-Box Hall Ticket Grid**: Added opt-in support (`includeHallTicketGrid?: boolean`, `HALL_TICKET_BOX_COUNT = 10`, `renderHallTicketGrid`) for variants requiring a 10-cell candidate Hall Ticket entry grid while keeping the default header faithful to the verified `Social_Engineering_22CIE18.pdf` scan.
- **Data-Driven Subpart & `(OR)` Rendering**: Removed the brittle `sectionLabelClean.includes("B")` heuristic that previously forced every section containing `"B"` into synthetic `(a)/(b)` pairs and `(OR)` blocks. Standalone questions in any section now render cleanly in their configured `sequenceOrder`, while `(a)/(b)` subparts and centered `(OR)` separators render strictly from explicit choice metadata (`internalChoicePairs`, `choiceGroup`, `orWithNext`, or explicit `(a)/(b)` subparts).
- **Accurate Section Marks Subtitle & Real `CO` / `BT` Propagation**: Fixed `formatSectionMarksSubtitle` so sections storing `printedMarks` in `sectionMarks` (e.g., 4 slots × 20M = 80 printed marks with `requiredAnswers = 2`) print the accurate required-marks formula `(2Q X 20M = 40 Marks)` instead of `(2Q X 40M = 80 Marks)`. Updated [`paperVersionService.ts`](file:///c:/paper-distribution-system/backend/src/services/paperVersionService.ts), [`paperService.ts`](file:///c:/paper-distribution-system/backend/src/services/paperService.ts), and [`paperApprovalService.ts`](file:///c:/paper-distribution-system/backend/src/services/paperApprovalService.ts) to include `aiBloomsLevel`, `facultyBloomsLevel`, and `topic.sequenceOrder` in version snapshots and live previews.
- **Authenticated PDF Download & Embedded Preview UI**: Added `fetchPaperPdfBlob` and `downloadPaperPdf` in [`api.ts`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts) so PDF downloads and embedded previews send `x-institution-id` headers instead of failing with `401 Unauthorized` on raw `<a href>` links. Upgraded [`PaperPreviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/PaperPreviewPage.tsx) and [`SubmissionReviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/SubmissionReviewPage.tsx) to mirror the CBIT sheet layout and provide an embedded PDF viewer and SHA-256 artifact status bar.

---

## 2. Reference Inspection (`Social_Engineering_22CIE18.pdf`)

### Reference File Location
- Located and visually inspected at:
  `C:/Users/palle/.gemini/antigravity/brain/c2855197-ebb6-4ba3-8010-ea150f7cc250/.user_uploaded/media_1793120579147_eccf4862.pdf` (2 pages, A4 portrait).

### Observed Visual & Structural Characteristics
1. **Top Row (Page 1 & Page 2 Running Header)**:
   - Top-left: Rounded rectangle (`rx ≈ 5pt`, `1.2pt` stroke) containing bold sans-serif `R22`.
   - Top-right: Bold serif `Code No.: 22CIE18` aligned to the right margin (`x ≈ 533.28pt`).
   - Page 2 repeats this exact `[ R22 ]` + `Code No.: 22CIE18` running header at the top of the continuation page.
2. **Centered Institutional & Exam Headings (Page 1)**:
   - Line 1: `CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)` in bold serif (`13.5pt`), with `CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY` in uppercase and `(Autonomous)` in mixed case.
   - Line 2: `B.E. (CET) VII Sem (Main) Examination November 2025` in bold serif (`11.5pt`).
   - Line 3: `Social Engineering` in bold serif (`12pt`).
3. **Time, Max Marks & Note Block**:
   - Left-aligned `Time: 3 Hours` and right-aligned `Max Marks: 60` on the same baseline (`11pt` bold serif).
   - Hanging-indented `Note:` block (`10.5pt` serif) where `Note:` sits at `leftMargin` (`x = 62pt`) and the numbered lines (`1. Answer ALL questions from Part-A & Part-B (Internal Choice) at one place in the same order.`, `2. Part-A carries 10 Marks and Part-B carries 50 Marks, with internal choices in Part-B.`) are indented to `x = 100pt` with inline bolding on `ALL`, `Part-A`, `Part-B`, and `internal choices`.
   - Note: The verified `Social_Engineering_22CIE18.pdf` scan does **not** include a 10-box Hall Ticket grid on Page 1; we preserved the exact scan layout by default and implemented `includeHallTicketGrid?: boolean` (`HALL_TICKET_BOX_COUNT = 10`) as a supported option.
4. **Section Headings & `M | CO | BT` Columns**:
   - Centered bold `Part - A` (`11.5pt`) followed by centered bold `(5Q X 2M = 10 Marks)` (`11pt`).
   - Right-aligned column headers `M`, `CO`, `BT` (`10.5pt` bold) above the right-hand metadata columns (borderless layout; no full grid lines around questions).
5. **Part-A Questions (Questions 1–5)**:
   - Continuous numbering `1.` through `5.` at `x = 68pt`, question text at `x = 96pt`, marks in parentheses `(2)` under `M`, course outcome integer `1`–`5` under `CO`, and Bloom's taxonomy integer `1`–`2` under `BT`.
6. **Part-B Questions (Questions 6–15 with `(a)`, `(b)` & `(OR)`)**:
   - Centered bold `Part - B` followed by centered bold `(5Q X 10M = 50 Marks)`.
   - Right-aligned `M`, `CO`, `BT` column headers repeated at the top of Part-B on Page 1 and again at the top of the continuation table on Page 2.
   - Five internal-choice pairs (`6` OR `7`, `8` OR `9`, `10` OR `11`, `12` OR `13`, `14` OR `15`).
   - Each question number (`6.`, `7.`, etc.) has two subparts `a)` and `b)` indented under the question column, each with `(5)` under `M`, the unit CO number (`1`–`5`) under `CO`, and the Bloom's level (`2`–`3`) under `BT`.
   - Centered bold `(OR)` appears only between the first and second question of each internal-choice pair (e.g., between `6` and `7`), never after the second question of a pair.
7. **End-of-Paper Marker & Page Footers**:
   - Centered bold `*****` after Question `15 b)` on Page 2.
   - Centered `Page 1 of 2` and `Page 2 of 2` at the bottom of each page (`y ≈ 38pt`).

---

## 3. Files Changed

| File | Role | Change Summary |
| :--- | :--- | :--- |
| [`backend/src/services/pdfRendererService.ts`](file:///c:/paper-distribution-system/backend/src/services/pdfRendererService.ts) | Backend PDF Renderer | Matched CBIT reference typography, header, optional 10-box Hall Ticket grid, hanging-indented `Note:`, `M/CO/BT` columns, data-driven `(a)/(b)` and `(OR)` grouping, accurate section marks arithmetic, multi-page continuation headers, `*****`, and `Page X of Y` footers. |
| [`backend/src/services/paperVersionService.ts`](file:///c:/paper-distribution-system/backend/src/services/paperVersionService.ts) | Version Snapshot Service | Extended `buildSnapshotPayload` query to include `aiBloomsLevel`, `facultyBloomsLevel`, and `topic.sequenceOrder` and ordered sections/slots deterministically. |
| [`backend/src/services/paperService.ts`](file:///c:/paper-distribution-system/backend/src/services/paperService.ts) | Paper Service | Extended `PAPER_DETAIL_INCLUDE` to include `aiBloomsLevel`, `facultyBloomsLevel`, and `topic.sequenceOrder` for accurate `CO` and `BT` display in live paper previews. |
| [`backend/src/services/paperApprovalService.ts`](file:///c:/paper-distribution-system/backend/src/services/paperApprovalService.ts) | Approval Service | Extended approval submission snapshot query to include `aiBloomsLevel`, `facultyBloomsLevel`, and `topic.sequenceOrder`. |
| [`backend/src/__tests__/pdfRenderer.test.ts`](file:///c:/paper-distribution-system/backend/src/__tests__/pdfRenderer.test.ts) | Backend Unit & PDF Stream Tests | Added 11 comprehensive tests inspecting decompressed PDF content streams (`zlib.inflateSync`) for CBIT header, optional Hall Ticket grid, standalone vs. paired Part-B questions, multi-page overflow, `*****`, and `Page X of Y`. |
| [`frontend/src/lib/api.ts`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts) | Frontend API Client | Added `fetchPaperPdfBlob` and `downloadPaperPdf` so PDF downloads and embedded previews include `x-institution-id` and dev role headers. |
| [`frontend/src/types/paper.ts`](file:///c:/paper-distribution-system/frontend/src/types/paper.ts) | Frontend Types | Added `aiBloomsLevel`, `facultyBloomsLevel`, `reviewStatus` to `QuestionSlotRevision.analyses` and `sequenceOrder` to `questionTopicMaps.topic`. |
| [`frontend/src/pages/PaperPreviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/PaperPreviewPage.tsx) | Paper Preview UI | Added Official CBIT PDF Artifact bar (SHA-256 verification badge, Embedded PDF `<iframe />` preview toggle, authenticated Download PDF, Generate/Regenerate PDF) and updated the HTML sheet preview to match the CBIT layout. |
| [`frontend/src/pages/SubmissionReviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/SubmissionReviewPage.tsx) | Approval Review UI | Replaced unauthenticated `<a href>` PDF download link with `downloadPaperPdf`, removed false `isOrChoiceBreak` heuristic, and aligned blueprint tab with CBIT layout and real `CO`/`BT` metadata. |

---

## 4. PDF Improvements

### Header & Metadata
- Renders the top-left rounded regulation box (`[ R22 ]`, configurable via `regulationCode`) and top-right `Code No.: <subjectCode>` on Page 1 and all continuation pages.
- Preserves mixed-case `(Autonomous)` in `CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)` via `formatInstitutionHeading`.
- Renders centered examination title, subject name, left-aligned `Time: 3 Hours`, right-aligned `Max Marks: 60`, and hanging-indented `Note:` lines with inline bolding on `ALL`, `Part-A`, `Part-B`, and `internal choices`.

### Hall Ticket Number Grid
- Added `includeHallTicketGrid?: boolean` on `CollegePaperTemplateData` and `HALL_TICKET_BOX_COUNT = 10` (`renderHallTicketGrid` in [`pdfRendererService.ts`](file:///c:/paper-distribution-system/backend/src/services/pdfRendererService.ts#L502-L540)) so institutions or exam configurations that require a 10-cell candidate Hall Ticket grid can enable it cleanly while default rendering matches `Social_Engineering_22CIE18.pdf`.

### Table Structure (`M`, `CO`, `BT`) & Section Marks Subtitle
- Fixed `formatSectionMarksSubtitle` ([`pdfRendererService.ts`](file:///c:/paper-distribution-system/backend/src/services/pdfRendererService.ts#L316-L337)) to derive per-question marks from the section's question groups (`firstGroupMarks`) and compute `requiredCount * eachMarks`, preventing `printedMarks` (e.g., `80` when 4 choice questions of 20M are stored) from inflating the subtitle.
- Renders right-aligned `M`, `CO`, `BT` column headers at the start of every section and repeats them at the top of continuation pages when a section spans across a page break.
- Extracts real `CO` (`topic.sequenceOrder` or numeric suffix of `topic.code`) and `BT` (`facultyBloomsLevel` or `aiBloomsLevel` mapped to `1`–`6`) from each question revision.

### Question Formatting (`Part-A`, `Part-B`, `(a)`, `(b)`) & Alternative-Question Rendering (`(OR)`)
- Replaced the legacy `sectionLabelClean.includes("B")` heuristic with `assembleSectionQuestionGroups` ([`pdfRendererService.ts`](file:///c:/paper-distribution-system/backend/src/services/pdfRendererService.ts#L194-L314)).
- Sections with standalone questions (even if named `"B"` or `"Part - B"`) render each slot as a single numbered question in `sequenceOrder` without inventing `(a)` / `(b)` subparts or `(OR)` separators.
- Explicit `internalChoicePairs`, `choiceGroup`, `orWithNext`, or paired `(a)` / `(b)` subparts render with proper subpart indentation and centered bold `(OR)` strictly between alternative questions.

### Page Breaks & Footer (`*****`, `Page X of Y`)
- Pre-measures every question group (all subparts plus trailing `(OR)` label) before drawing and triggers a clean page break with running header (`[ R22 ]` + `Code No.`) and repeated `M | CO | BT` column headers whenever a question would cross `bottomContentMargin` (`68pt`).
- Renders centered bold `*****` after the final question and stamps `Page X of Y` across all pages once total page count is finalized.

### Paper Preview UI
- Upgraded [`PaperPreviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/PaperPreviewPage.tsx) with:
  - An **Official CBIT PDF Artifact** status bar displaying SHA-256 verification status, page count, template ID, an **Embed PDF Preview / Hide PDF Preview** toggle (`<iframe />` backed by an authenticated Blob URL), **Download Official PDF**, and **Generate / Regenerate PDF**.
  - An on-screen CBIT examination paper sheet (`[ R22 ]`, `Code No.`, continuous question numbering across sections, accurate `(NQ X MM = Total Marks)` subtitle, and `M | CO | BT` columns).

---

## 5. Security and Workflow Preservation

All existing security and workflow invariants remain intact:
- PDF generation (`POST /api/v1/exam-papers/:paperId/pdf/generate`) and download (`GET /api/v1/exam-papers/:paperId/pdf/download`) continue to require an **APPROVED** paper status (`assertPaperApprovedForPdf` returns `409 Conflict` for `DRAFT`, `IN_REVIEW`, or `REJECTED` papers).
- Every generated PDF is rendered strictly from the immutable approved `PaperVersion.snapshotJson` associated with the latest `APPROVED` submission, stored in `backend/storage/pdf-artifacts`, and verified against its SHA-256 checksum (`checksumSha256`) on every download.
- Cross-tenant access checks (`institutionId`) and independent reviewer enforcement (`submittedBy !== decidedBy`) remain enforced and verified by automated tests.

---

## 6. Verification Results

1. **Backend Automated Tests (`57 passed, 0 failed`)**:
   - `npx vitest run src/__tests__/pdfRenderer.test.ts` — **11 passed** (verifies PDF header `%PDF-1.7`, `/Count 2` page tree on CBIT reference paper, decompressed text stream checks for `R22`, `Code No.: 22CIE18`, `CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY`, `(Autonomous)`, `(5Q X 2M = 10 Marks)`, `(5Q X 10M = 50 Marks)`, `(2Q X 20M = 40 Marks)`, `a)`/`b)` subparts, `(OR)` separators, standalone Part-B questions without false `(OR)`/`a)`/`b)`, optional 10-box Hall Ticket grid, multi-page overflow with running headers, `*****`, and `Page 1 of 2` / `Page 2 of 2`).
   - `npx vitest run src/__tests__/paperApproval.test.ts` — **16 passed** (verifies approval gate, SHA-256 integrity verification, tampering detection, and cross-tenant isolation).
   - `npx vitest run src/__tests__/paperVersionAndPreview.test.ts` — **14 passed** (verifies immutable version snapshots and preview assembly).
   - `npx vitest run src/__tests__/step11IntegrationAndSecurity.test.ts` — **16 passed** (verifies end-to-end workflows and security boundaries).
2. **Visual Verification of Rendered PDF**:
   - Rendered the full 2-page CBIT Social Engineering paper (`22CIE18`) via `renderCollegePaperPdf` and rasterized both pages at 150 DPI (`backend/storage/pdf-artifacts/page_1.png` and `page_2.png`).
   - Visually compared Page 1 and Page 2 side-by-side against `Social_Engineering_22CIE18.pdf` (`media_1793120579147_eccf4862.pdf`), confirming faithful typography, margins, column alignment, page split (Questions 1–9 on Page 1, Questions 10–15 + `*****` on Page 2), and `Page 1 of 2` / `Page 2 of 2` footers.
3. **Typecheck, Lint & Production Builds**:
   - Backend: `npm run typecheck` (`tsc -p tsconfig.json --noEmit`) and `npm run build` (`tsc -p tsconfig.json`) — **0 errors**.
   - Frontend: `npm run lint` (`eslint .`) and `npm run build` (`tsc -b && vite build`) — **0 errors**.

---

## 7. Known Limitations

- **Subpart & Internal-Choice Authoring UI**: While the PDF renderer and snapshot schema now support explicit `subparts`, `choiceGroup`, `orWithNext`, and `internalChoicePairs` metadata, the interactive Paper Builder (`PaperWorkspacePage.tsx`) currently assigns individual question revisions to flat slots. Adding an explicit slot-pairing / `(OR)` toggle in the Paper Builder UI will allow faculty to author paired internal-choice slots directly from the workspace UI without relying on pre-grouped question text.
- **Mathematical Formulas & Diagrams**: The current PDF renderer uses standard PDF Type1 fonts (`Times-Roman`, `Times-Bold`, `Times-Italic`, `Helvetica-Bold`) with WinAnsi-compatible sanitization (`sanitizePdfText`), so complex LaTeX equations or embedded vector/raster figures inside questions are rendered as plain text.

---

## 8. Recommended Next Step

- **Step 6 — Paper Builder Choice-Pair Authoring & End-to-End Examination Distribution / Blockchain Anchoring**:
  1. Enhance `PaperWorkspacePage.tsx` so faculty can mark adjacent slots in a section as `(OR)` choice pairs (`orWithNext` / `choiceGroup`) or `(a)/(b)` subparts directly in the Paper Builder UI.
  2. Connect approved PDF artifact hashes (`checksumSha256`) to the tamper-evident audit/blockchain anchoring or distribution verification workflow required by the project title.

