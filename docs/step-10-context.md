# Step 10 Context & Reference Analysis

**Stage:** Step 10 — Independent Paper Approval and College-Template PDF Generation  
**Date:** October 27, 2026  
**Reference Document:** CBIT Autonomous B.E. Examination Question Paper (November 2025)

---

## 1. Existing System Architecture & State Analysis

From Step 9:
- **Tenant Context (`tenantContext.ts`)**: In dev mode, extracts `x-institution-id`. `userId` is nullable.
- **Academic Domain**:
  - `Subject`, `Topic`, `Question`, and immutable `QuestionRevision`.
  - `QuestionRevision` captures `questionText`, `questionType`, `marks`, `difficulty`, `language`, `explanation`, topic mappings, and AI `QuestionAnalysis` (Bloom's level, duplicate flags).
- **Exam Blueprint**:
  - `ExamConfiguration`: name, totalMarks, durationMinutes, instructions, passingMarks.
  - `ExamPaper`: status (`DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`), concurrencyVersion, createdBy, submittedAt, approvedAt, approvedBy, rejectionReason.
  - `PaperSection`: sectionLabel, title, requiredAnswers, totalSlots, sectionMarks.
  - `QuestionSlot`: references immutable `QuestionRevision`.
  - `PaperVersion`: stores immutable JSON snapshot (`snapshotJson`), versionNumber, changeNote.
- **Validation Engine (`paperService.ts:validatePaper`)**: Checks achievable marks parity, required answers, empty sections, duplicate question IDs, slot zero marks, syllabus coverage, and Bloom's difficulty distributions.

---

## 2. Independent Approval Architecture

1. **Role & Identity Separation**:
   - Roles in schema: `SUPER_ADMIN`, `INSTITUTION_ADMIN`, `MODERATOR`, `EXAMINER`, `VIEWER`.
   - Submitter: `EXAMINER`, `INSTITUTION_ADMIN`, or `SUPER_ADMIN`.
   - Approver: `MODERATOR`, `INSTITUTION_ADMIN`, or `SUPER_ADMIN`.
   - **Independence Invariant**: Submitting user (`submittedBy`) MUST NOT approve their own submission (`decidedBy !== submittedBy`). If self-approval is attempted, backend throws HTTP 403 Forbidden.
   - **Cross-Institution Invariant**: Reviewer must belong to the same institution tenant as the paper.

2. **Immutable Submission Snapshot**:
   - When a paper is submitted:
     - Full validation is run. Blocking `ERROR` issues prohibit submission (HTTP 422).
     - An immutable snapshot is persisted in `PaperVersion`.
     - A `PaperSubmission` record is created linking `paperId`, `paperVersionId`, `submittedBy`, `validationSnapshot`, status `PENDING`.
     - `ExamPaper` status transitions to `SUBMITTED`.
   - When decided:
     - Reviewer acts on the exact `paperVersionId`.
     - On Approval: `PaperSubmission.status = APPROVED`, `ExamPaper.status = APPROVED`.
     - On Rejection: `PaperSubmission.status = REJECTED`, reason is mandatory, `ExamPaper.status = REJECTED`.

---

## 3. Reference College PDF Analysis (CBIT Autonomous Template)

Based on the provided 2-page examination PDF:
- **College/Institution**: `CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)`
- **Regulation Box**: Top-left corner `[x: 44, y: 36]`, rounded rectangle (width 40 pt, height 24 pt, corner radius 4 pt), border stroke 1.2 pt, containing bold text `R22` centered, 11 pt font.
- **Code Number**: Top-right corner `[right margin: 551]`, text `Code No.: <exam_code>` (e.g. `22CIE18`), Times-Bold, 10 pt.
- **Examination Header**:
  - Line 1: `CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)` (Bold 11 pt, uppercase, centered)
  - Line 2: `B.E. (CET) VII Sem (Main) Examination November 2025` (Bold 10 pt, centered)
  - Line 3: `Social Engineering` (Bold 13 pt, centered)
- **Metadata Bar**:
  - `Time: 3 Hours` (Left-aligned, Bold 10 pt)
  - `Max Marks: 60` (Right-aligned, Bold 10 pt)
- **Candidate Instructions**:
  - `Note: "Answer ALL questions from Part-A and Part-B (including internal choices) at one place and in the same order as in the question paper."`
- **Sections & Question Formatting**:
  - `Part - A` (Centered, Bold 10.5 pt)
  - `(5Q X 2M = 10 Marks)` (Centered, Bold 9.5 pt)
  - Right tabular headers: `M` (Marks), `CO` (Course Outcome), `BT` (Bloom's Taxonomy Level)
  - Right columns:
    - `M`: `(2)` or `(5)`
    - `CO`: `1`, `2`, `3`, `4`, `5`
    - `BT`: Bloom's level `1` (Remember), `2` (Understand), `3` (Apply), `4` (Analyze), etc.
  - Internal choices formatted with centered `(OR)` separator between question pairs.
  - Subsequent pages maintain Regulation box and Code No.
  - Exam termination indicated with centered `*****`.
  - Footer: Centered `Page X of Y`.

---

## 4. PDF Storage & Artifact Model

- **Storage Location**: Private local file storage in `storage/pdf-artifacts/` (outside public web root).
- **Integrity**: SHA-256 calculated over the final buffer, persisted in `paper_pdf_artifacts`.
- **Traceability**: Artifact bound to `paperId`, `paperVersionId`, `templateId` ("cbit-autonomous-v1"), `templateVersion` ("1.0.0"), `rendererVersion` ("1.0.0").
- **Access**: Authorized streaming route `GET /api/v1/exam-papers/:paperId/pdf/download` and `GET /api/v1/exam-papers/:paperId/pdf/preview`.

