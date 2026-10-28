# Step 10 Implementation Report — Independent Paper Approval and College-Template PDF Generation

**Project:** AI-Powered Blockchain-Based Secure Examination Infrastructure for Intelligent Question Paper Generation and Distribution  
**Stage:** Step 10 — Independent Paper Approval and College-Template PDF Generation  
**Date:** October 27, 2026  
**Status:** COMPLETE (All 131 backend unit & integration tests passing, frontend production build verified, college reference template matched)

---

## 1. Actual Initial Implementation Status

Prior to Step 10:
- **Steps 1–7:** Core academic entities (`Subject`, `Topic`, `Question`, `QuestionRevision`), AI cognitive classification (Bloom's Taxonomy), difficulty estimation, duplicate candidate evaluation, and bulk question generation.
- **Step 8:** Examination configuration (`ExamConfiguration`), question paper draft builder (`ExamPaper`, `PaperSection`, `QuestionSlot`), standalone paper marks arithmetic, and validation engine (`validatePaper`).
- **Step 9:** Immutable paper snapshot versions (`PaperVersion` table), optimistic locking with `concurrencyVersion`, answer-key protected previews (Faculty vs Candidate mode), and historical side-by-side diff comparison.

However, before Step 10:
1. No independent approval lifecycle existed (`PaperSubmission` table was absent).
2. Authors could theoretically edit or approve their own papers without independent checks.
3. No college question-paper PDF rendering engine existed.
4. Generated artifacts were not cryptographically hashed, version-bound, or stored in private private storage.
5. Approving authorities lacked a dedicated approval queue and immutable review screens.

---

## 2. Approval Workflow and Enforced Permissions

Step 10 establishes a strict four-state approval lifecycle:
`DRAFT` ➔ `SUBMITTED` (Pending Review) ➔ `APPROVED` or `REJECTED` / `CHANGES_REQUESTED`

### Enforced Invariants:
1. **Self-Approval Prohibition:** The author who submits a question paper (`submittedBy`) is strictly prevented from approving or rejecting their own submission (`decidedBy !== submittedBy`). If self-approval is attempted, the backend rejects with HTTP `403 Forbidden` (`Self-approval prohibited: An author cannot approve or reject their own question paper submission`).
2. **Reviewer Role Authorization:** The approving authority must possess `MODERATOR`, `INSTITUTION_ADMIN`, or `SUPER_ADMIN` credentials. Ineligible roles (`VIEWER` or unauthorized users) are rejected with HTTP `403 Forbidden`.
3. **Tenant & Institution Isolation:** Both submitter and reviewer must belong to the same institution tenant as the paper (`institutionId`). Cross-institution reviews return HTTP `404 Not Found`.
4. **Mandatory Rejection Comments:** Reviewers rejecting or requesting changes must supply non-empty review feedback. Rejections lacking comments return HTTP `422 Unprocessable Entity`.
5. **No Mutation of Decided Submissions:** A decided submission cannot be silently overwritten (returns HTTP `409 Conflict`).
6. **Pre-Submission Validation Guard:** A paper with blocking validation errors (`severity: "ERROR"`, such as marks mismatch or unassigned sections) cannot be submitted (returns HTTP `422 Unprocessable Entity`).

---

## 3. Snapshot and Version-Integrity Design

When a paper is submitted for approval:
1. The backend runs `validatePaper(institutionId, paperId)`.
2. An immutable snapshot of the entire paper tree (including section ordering, allocated marks, question revisions, Bloom's cognitive levels, and course outcome numbers) is captured in `PaperVersion` (`snapshotJson`).
3. A `PaperSubmission` row is created, capturing:
   - `paperId`
   - `paperVersionId` (foreign key to the exact version snapshot)
   - `submittedBy` (userId)
   - `validationSnapshot` (full JSON validation findings at submission time)
   - `status: "PENDING"`
4. `ExamPaper` status transitions to `SUBMITTED`, locking draft edits.
5. If changes are requested or the submission is rejected, `ExamPaper` transitions to `REJECTED`, the paper's `concurrencyVersion` increments, and faculty can resume editing in draft mode. Edits create a new sequential version without altering the historical submission snapshot.

---

## 4. Exact Files Created or Modified

### Created Files:
- `backend/prisma/migrations/20261027170000_step10_approval_and_pdf/migration.sql` — Schema migration for `paper_submissions` and `paper_pdf_artifacts`.
- `backend/src/services/pdfRendererService.ts` — Deterministic PDF renderer replicating the CBIT Autonomous examination format using PDFKit.
- `backend/src/services/storageService.ts` — Private local file storage abstraction with atomic persistence and SHA-256 verification.
- `backend/src/services/paperApprovalService.ts` — Core independent approval lifecycle, permission checks, snapshot binding, and PDF orchestration.
- `backend/src/routes/approvals.ts` — Express router for `/api/v1/paper-submissions` (queue listing, snapshot review, approval decision).
- `backend/src/__tests__/paperApproval.test.ts` — 16 unit & integration tests covering authorization, self-approval guards, role enforcement, and PDF generation guards.
- `backend/src/__tests__/pdfRenderer.test.ts` — 4 tests verifying PDF buffer validity, `%PDF` header, CBIT 2-page pagination, formatting helpers, and SHA-256 hash calculation.
- `backend/scripts/generate_sample.ts` — Verification script generating sample CBIT question paper PDF.
- `backend/scripts/render_pages.py` — PyMuPDF visual inspection utility rendering PDF pages to 150 DPI PNGs.
- `frontend/src/pages/ApprovalQueuePage.tsx` — Reviewer approval queue dashboard with status tabs and submission cards.
- `frontend/src/pages/SubmissionReviewPage.tsx` — Reviewer blueprint inspection, validation findings, self-approval guard alert, decision modal, and PDF generation controls.
- `docs/step-10-context.md` — Initial context and reference analysis document.
- `docs/step-10-implementation-report.md` — This comprehensive implementation report.

### Modified Files:
- `backend/prisma/schema.prisma` — Added `PaperSubmissionStatus` enum, `PaperSubmission` model, `PaperPdfArtifact` model, and relations on `ExamPaper` and `PaperVersion`.
- `backend/src/middleware/tenantContext.ts` — Added `userId` and `userRole` parsing from dev headers (`x-user-id`, `x-user-role`).
- `backend/src/schemas/paper.ts` — Added Zod schemas for `reviewDecisionSchema`, `listSubmissionsQuerySchema`, `submissionParamSchema`, and `generatePdfSchema`.
- `backend/src/routes/papers.ts` — Upgraded `/submit` route to use `submitPaperForApproval`; added `/submissions` history route and PDF artifact endpoints (`/pdf/generate`, `/pdf`, `/pdf/download`, `/pdf/preview`).
- `backend/src/routes/index.ts` — Registered `paperSubmissionRouter` under `/v1/paper-submissions`.
- `backend/src/services/paperService.ts` — Linked `submitExamPaper` to `paperApprovalService`.
- `backend/src/__tests__/questionAnalysis.test.ts` — Updated test expectation to match active dev `userId` propagation.
- `frontend/src/types/paper.ts` — Added TypeScript interfaces for `PaperSubmission`, `PaperPdfArtifact`, `ReviewDecisionInput`.
- `frontend/src/lib/api.ts` — Added client methods for approval queue, review decisions, and PDF downloading/generating.
- `frontend/src/config/navigation.ts` — Activated "Approval Queue" navigation route (`/approvals`).
- `frontend/src/app/router.tsx` — Registered routes `/approvals` and `/approvals/:submissionId`.
- `frontend/src/pages/PaperPreviewPage.tsx` — Added "Submit for Approval" action/modal, status badges, rejection banners, and direct PDF download link.
- `frontend/src/components/layout/DevBar.tsx` — Added quick role switcher between "Faculty Submitter" and "Reviewer / Approver".

---

## 5. API Routes and Request/Response Examples

All endpoints operate under `/api/v1` and require `x-institution-id`.

### 1. Submit Paper for Approval (`POST /api/v1/exam-papers/:paperId/submit`)
**Headers:**
```http
x-institution-id: a0000000-0000-4000-8000-000000000001
x-user-id: u0000000-0000-4000-8000-000000000001
x-user-role: EXAMINER
```
**Request Body:**
```json
{
  "notes": "Ready for VII Sem regular examination review. All Part-B choices verified."
}
```
**Response (HTTP 200 OK):**
```json
{
  "id": "s0000000-0000-4000-8000-000000000001",
  "institutionId": "a0000000-0000-4000-8000-000000000001",
  "paperId": "a0000000-0000-4000-8000-000000000010",
  "paperVersionId": "v0000000-0000-4000-8000-000000000020",
  "submittedBy": "u0000000-0000-4000-8000-000000000001",
  "status": "SUBMITTED",
  "submissionStatus": "PENDING",
  "validationSnapshot": {
    "valid": true,
    "totalMarks": 60,
    "achievableMarks": 60,
    "configTotalMarks": 60,
    "marksDiscrepancy": 0,
    "issues": []
  },
  "submittedAt": "2026-10-27T17:40:00.000Z"
}
```

### 2. Record Review Decision (`POST /api/v1/paper-submissions/:submissionId/decision`)
**Headers (Reviewer must be distinct from submitter):**
```http
x-institution-id: a0000000-0000-4000-8000-000000000001
x-user-id: u0000000-0000-4000-8000-000000000002
x-user-role: MODERATOR
```
**Request Body (Approval):**
```json
{
  "decision": "APPROVED",
  "comments": "Paper structure and Bloom's difficulty spread verified against syllabus."
}
```
**Response (HTTP 200 OK):**
```json
{
  "id": "s0000000-0000-4000-8000-000000000001",
  "status": "APPROVED",
  "decidedBy": "u0000000-0000-4000-8000-000000000002",
  "decidedAt": "2026-10-27T17:42:00.000Z",
  "decision": "APPROVED",
  "reviewComments": "Paper structure and Bloom's difficulty spread verified against syllabus."
}
```
*Note: If the submitting user attempts to approve their own paper, HTTP `403 Forbidden` is returned.*

### 3. Generate College PDF (`POST /api/v1/exam-papers/:paperId/pdf/generate`)
**Request Body:**
```json
{
  "forceRegenerate": false
}
```
**Response (HTTP 201 Created):**
```json
{
  "id": "art-0000000-0000-4000-8000-000000000001",
  "institutionId": "a0000000-0000-4000-8000-000000000001",
  "paperId": "a0000000-0000-4000-8000-000000000010",
  "paperVersionId": "v0000000-0000-4000-8000-000000000020",
  "templateId": "cbit-autonomous-v1",
  "templateVersion": "1.0.0",
  "rendererVersion": "1.0.0",
  "fileName": "paper_a0000000-0000-4000-8000-000000000010_v1.pdf",
  "filePath": "C:\\paper-distribution-system\\storage\\pdf-artifacts\\...\\paper.pdf",
  "fileSizeBytes": 4753,
  "checksumSha256": "fd1ce657f12d37ef16a6b4cc485637a73ac7b08741093903d94e9effaa780492",
  "pageCount": 2,
  "createdAt": "2026-10-27T17:45:00.000Z"
}
```

### 4. Retrieve PDF Artifact Details & Verify Integrity (`GET /api/v1/exam-papers/:paperId/pdf`)
**Response (HTTP 200 OK):**
```json
{
  "id": "art-0000000-0000-4000-8000-000000000001",
  "templateId": "cbit-autonomous-v1",
  "fileName": "paper_a0000000-0000-4000-8000-000000000010_v1.pdf",
  "fileSizeBytes": 4753,
  "checksumSha256": "fd1ce657f12d37ef16a6b4cc485637a73ac7b08741093903d94e9effaa780492",
  "pageCount": 2,
  "integrityVerified": true,
  "actualChecksum": "fd1ce657f12d37ef16a6b4cc485637a73ac7b08741093903d94e9effaa780492"
}
```

### 5. Download Private PDF Stream (`GET /api/v1/exam-papers/:paperId/pdf/download`)
Streams binary `application/pdf` with headers:
```http
Content-Type: application/pdf
Content-Disposition: attachment; filename="paper_..._v1.pdf"
Content-Length: 4753
ETag: "fd1ce657f12d37ef16a6b4cc485637a73ac7b08741093903d94e9effaa780492"
```

---

## 6. Database Migrations and Instructions

Migration file: `backend/prisma/migrations/20261027170000_step10_approval_and_pdf/migration.sql`

```sql
DO $$ BEGIN
  CREATE TYPE paper_submission_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS paper_submissions (
  id TEXT NOT NULL PRIMARY KEY,
  institution_id TEXT NOT NULL,
  paper_id TEXT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  paper_version_id TEXT NOT NULL REFERENCES paper_versions(id) ON DELETE RESTRICT,
  submitted_by TEXT NOT NULL,
  submitter_notes TEXT,
  status paper_submission_status NOT NULL DEFAULT 'PENDING',
  validation_snapshot JSONB NOT NULL,
  decided_by TEXT,
  decision TEXT,
  review_comments TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS paper_submissions_institution_id_status_idx ON paper_submissions(institution_id, status);
CREATE INDEX IF NOT EXISTS paper_submissions_paper_id_submitted_at_idx ON paper_submissions(paper_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS paper_pdf_artifacts (
  id TEXT NOT NULL PRIMARY KEY,
  institution_id TEXT NOT NULL,
  paper_id TEXT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  paper_version_id TEXT NOT NULL REFERENCES paper_versions(id) ON DELETE RESTRICT,
  template_id TEXT NOT NULL DEFAULT 'cbit-autonomous-v1',
  template_version TEXT NOT NULL DEFAULT '1.0.0',
  rendererVersion TEXT NOT NULL DEFAULT '1.0.0',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 1,
  generated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS paper_pdf_artifacts_institution_id_paper_id_idx ON paper_pdf_artifacts(institution_id, paper_id);
CREATE INDEX IF NOT EXISTS paper_pdf_artifacts_paper_version_id_idx ON paper_pdf_artifacts(paper_version_id);
```

### Application Command:
```bash
npm --prefix backend run prisma:migrate:deploy
npm --prefix backend run prisma:generate
```

---

## 7. PDF Rendering Library and Design Approach

- **Engine:** `PDFKit` (v0.20.2) pure Node.js vector PDF library.
- **Why PDFKit over Headless Browsers:**
  1. Headless browsers (e.g. Puppeteer) require 200MB+ binaries and can fail in locked-down Linux containers or minimal sandbox environments.
  2. PDFKit provides exact sub-point coordinate placement (`doc.roundedRect`, `doc.text`, `doc.switchToPage`).
  3. PDFKit natively embeds standard Type 1 PostScript fonts (`Times-Roman`, `Times-Bold`, `Times-Italic`), matching standard academic typography without missing-font fallback glitches.
  4. Supports `bufferPages: true`, enabling 2-pass page numbering ("Page X of Y") and running headers on subsequent pages.

---

## 8. College-Template Measurements & Formatting Decisions

Derived directly from the CBIT Autonomous B.E. Question Paper reference:

| Visual Element | Reference Specification | Implementation Coordinate / Value |
|---|---|---|
| **Page Size** | Standard A4 Portrait | `595.28 pt x 841.89 pt` |
| **Margins** | Top: 40pt, Bottom: 45pt, Left: 44pt, Right: 44pt | Usable Content Width = `507.28 pt` |
| **Regulation Box** | Top-left rounded outline rectangle | `x: 44, y: 36, w: 38, h: 22, r: 3.5, stroke: 1.2pt` |
| **Regulation Code** | Centered inside box | `Times-Bold, 11pt`, default `"R22"` |
| **Subject Code** | Top-right header | `x: 551 - textWidth, y: 40, Times-Bold, 10pt`, `"Code No.: 22CIE18"` |
| **Institution Name** | Centered uppercase heading | `y: 52, Times-Bold, 11pt`, full content width |
| **Exam Title** | Centered subtitle | `y: 68, Times-Bold, 10pt` |
| **Course Name** | Centered subject title | `y: 84, Times-Bold, 13pt` |
| **Time & Max Marks** | Left and right aligned row | `Time: 3 Hours` (left), `Max Marks: 60` (right), `Times-Bold, 10pt` |
| **Candidate Note** | Left aligned italicized notice | `Times-Italic, 9pt`, with `"Note: "` bold prefix |
| **Part Header** | Centered section divider | `Part - A`, `Times-Bold, 10.5pt` |
| **Part Subtitle** | Centered arithmetic subtitle | `(5Q X 2M = 10 Marks)`, `Times-Bold, 9.5pt` |
| **Columns (Right)** | `M` (26pt), `CO` (22pt), `BT` (20pt) | Right margin offset, centered headers, `Times-Bold, 9pt` |
| **Questions (Part A)** | No. (22pt), Text (397pt), `(M)`, `CO`, `BT` | Numbers 1–5, `Times-Roman, 9.5pt`, `(2) 1 2` format |
| **Questions (Part B)** | Multi-part subquestions (a)/(b) | Numbers 6–15, subparts `(a)` / `(b)` with 18pt indent |
| **Internal Choice** | Centered separator between pairs | `(OR)`, `Times-Bold, 9.5pt`, centered |
| **Continuation Page** | Page 2+ running header | Regulation box top-left, Code No. top-right, `(OR)` continuing |
| **Terminal Marker** | Centered asterisks | `*****`, `Times-Bold, 10pt`, centered |
| **Page Footer** | Bottom margin centered | `Page X of Y`, `Times-Roman, 9pt`, `y = 785` |

---

## 9. Fonts, Assets, and Substitution Policy

- **Typography:** Times New Roman is the standard for CBIT examination papers.
- **Embedded Fonts Used:** Standard Type 1 `Times-Roman`, `Times-Bold`, and `Times-Italic`.
- **Licensing & Portability:** Type 1 standard core fonts are permanently built into all compliant PDF readers (Adobe Acrobat, Preview, Chrome PDF, Firefox PDF.js). No external copyrighted TTF/OTF font binaries are extracted or bundled, guaranteeing portability across Linux, Windows, and macOS deployment containers.

---

## 10. PDF Storage Configuration and Environment Variables

- **Storage Abstraction:** `backend/src/services/storageService.ts`
- **Root Directory:** Private path outside web server root: `storage/pdf-artifacts/<institutionId>/<paperId>/`
- **Environment Variable:** `PDF_STORAGE_DIR` (defaults to `./storage/pdf-artifacts`)
- **Atomic Persistence:** Bytes are written to a temporary file (`.tmp`) and atomically renamed (`fs.promises.rename`) to avoid partial or corrupt artifacts upon process interruption.
- **Access Control:** Files are strictly non-public; access is mediated through Express streaming handlers verifying tenant membership and approved paper access.

---

## 11. Artifact Hash and Traceability Behavior

- **Cryptographic Hash:** Calculated via Node.js `node:crypto` using `SHA-256` over the final PDF buffer.
- **Immutability:** Once written, `checksumSha256` is stored in the `paper_pdf_artifacts` database row alongside `fileSizeBytes`, `pageCount`, `templateId`, `templateVersion`, and `rendererVersion`.
- **Integrity Verification:** Endpoint `GET /api/v1/exam-papers/:paperId/pdf` reads the file on disk, recomputes the SHA-256 hash in real time, and confirms `integrityVerified: true` if it matches the persisted record.

---

## 12. Test Commands and Actual Outcomes

### 1. Step 10 Dedicated Unit & Integration Tests:
```bash
npm --prefix backend test src/__tests__/paperApproval.test.ts src/__tests__/pdfRenderer.test.ts
```
**Outcome: PASS (20 tests passed, 0 failed, 762ms)**
- Authorization guards & tenant checks: PASS
- Approval queue status filtering: PASS
- Submission snapshot & validation retrieval: PASS
- Self-approval prohibition (403): PASS
- Mandatory rejection reason enforcement (422): PASS
- Repeat decision prevention (409): PASS
- Ineligible role rejection (403): PASS
- Paper decision history retrieval: PASS
- Non-approved paper PDF generation guard (400): PASS
- Approved paper PDF generation & metadata persistence: PASS
- Idempotent artifact retrieval without re-rendering: PASS
- File integrity checksum verification: PASS
- Bloom's cognitive level numeric BT mapping: PASS
- Academic duration formatting: PASS
- Marks decimal arithmetic formatting: PASS
- 2-page CBIT college reference rendering & %PDF header: PASS

### 2. Full Regression Suite (Steps 1–10):
```bash
npm --prefix backend test
```
**Outcome: PASS (All 10 test files, 131 tests passed, 0 failed, 1.71s)**
- `academic.test.ts` (37 tests): PASS
- `paperBuilder.test.ts` (15 tests): PASS
- `paperVersionAndPreview.test.ts` (14 tests): PASS
- `questionAnalysis.test.ts` (13 tests): PASS
- `questionGeneration.test.ts` (10 tests): PASS
- `errorHandler.test.ts` (9 tests): PASS
- `aiClient.test.ts` (7 tests): PASS
- `health.test.ts` (6 tests): PASS
- `paperApproval.test.ts` (16 tests): PASS
- `pdfRenderer.test.ts` (4 tests): PASS

### 3. Frontend Production Build:
```bash
npm --prefix frontend run build
```
**Outcome: PASS (tsc -b && vite build completed with 0 errors)**

---

## 13. Visual Comparison Findings & Unresolved Differences

Visual comparison against the provided CBIT reference PDF was performed by rendering the generated artifact to 150 DPI PNGs (`storage/pdf-artifacts/page_1.png` and `page_2.png`):

### Confirmed Template Matches:
1. **Regulation Box:** Outlined rounded rectangle at top-left containing `"R22"` matches geometry and font weight.
2. **Subject Code:** `"Code No.: 22CIE18"` at top-right aligned to right margin.
3. **Institutional Hierarchy:** All-caps bold `"CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)"`, followed by examination name, subject title, and Time/Max Marks.
4. **Candidate Instructions:** Formatted with bold `"Note: "` prefix and quotation marks.
5. **Part A / Part B Dividers:** Centered with arithmetic subtitles `(5Q X 2M = 10 Marks)` and `(5Q X 10M = 50 Marks)`.
6. **Tabular Headers:** `M`, `CO`, `BT` columns aligned to the right margin.
7. **Pagination & Page Breaks:**
   - Page 1 contains Questions 1–5 (Part A) and Questions 6–12 (Part B) down to the bottom margin.
   - Page 2 starts with running regulation box and code number, followed by centered `(OR)`, Questions 13, 14, 15, and terminal `*****`.
   - Centered footers `"Page 1 of 2"` and `"Page 2 of 2"` at the bottom.

### Differences Documented Honestly:
- **Scan Artifacts:** The original reference document was a physical scan with slight rotation (~0.5° skew), paper texture, handwritten date annotations (`12/11/2025`), and staple marks. The generated PDF is pristine digital vector text.
- **Dynamic Exam Codes:** In our implementation, `Code No.` and `Regulation` are read dynamically from the approved paper's syllabus configuration and subject code rather than hardcoded.

---

## 14. Review 2 Metrics and Traceability

| Metric | Measured Status | Value / Evaluation |
|---|---|---|
| **Approval Turnaround Time** | Tracked | Supported via `submittedAt` and `decidedAt` timestamps on `PaperSubmission` |
| **Submitted Papers Count** | Tracked | Distinct count via `paper_submissions` grouped by `paperId` |
| **Approval / Rejection Rates** | Tracked | `status` enum counts (`APPROVED`, `REJECTED`, `CHANGES_REQUESTED`) |
| **PDF Generation Success Rate** | Tracked | `100%` in automated test suite |
| **PDF Generation Latency** | Measured | **~35ms** (PDFKit in-memory vector pipeline) |
| **Page Count Fidelity** | Measured | **2 Pages** (matches college reference) |
| **SHA-256 Integrity Verification** | Measured | Verified real-time disk hash vs database record |
| **Template & Renderer Traceability** | Tracked | `cbit-autonomous-v1` (v1.0.0), `renderer-v1.0.0` recorded per artifact |
| **Decentralized Blockchain Metrics** | NOT MEASURED | Intentionally deferred to later blockchain anchoring steps |

---

## 15. Known Limitations and Blockers

1. **Development Auth Simulation:** Real JWT session cookies will be finalized in the full authentication step. In this step, dev headers (`x-user-id`, `x-user-role`, `x-institution-id`) and the DevBar role switcher provide tenant and user isolation.
2. **Local Disk Storage:** Artifacts are written to `./storage/pdf-artifacts/`. Cloud object storage (S3/GCS) can be plugged in by updating `storageService.ts` without altering the database schema or PDF renderer.
3. **Mathematical Formulas:** PDFKit renders Unicode and standard text. Complex KaTeX/LaTeX mathematical equations will be supported via vector SVG paths in a future enhancement.

---

## 16. Handoff for Step 11

With Step 10 complete:
- Every approved examination blueprint has an immutable version snapshot.
- An independent authority has formally signed off with timestamps and recorded identity.
- A deterministic, 2-page college question-paper PDF has been produced, verified against the CBIT reference, and hashed with SHA-256.
- The system is now primed for **Step 11 — Blockchain Anchoring and Tamper-Proof Verification**, where the SHA-256 hash of the approved paper snapshot and generated PDF artifact will be committed onto a decentralized ledger.

