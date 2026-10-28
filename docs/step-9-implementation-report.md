# Step 9 Implementation Report — Paper Validation, Preview, Editing, and Versioning

**Project:** AI-Powered Blockchain-Based Secure Examination Infrastructure for Intelligent Question Paper Generation and Distribution  
**Stage:** Step 9 — Paper Validation, Preview, Editing, and Versioning  
**Date:** October 27, 2026  
**Status:** COMPLETE (All tests passing, frontend & backend builds verified, AI service regression verified)

---

## 1. Actual Initial State of the Implementation

Prior to Step 9:
- **Steps 1–4:** Established academic data management (`Subject`, `Topic`, `Question`, and immutable `QuestionRevision` models) and tenant isolation via `x-institution-id` development context middleware.
- **Steps 5–6:** Deployed internal Python FastAPI AI microservice with semantic duplicate evaluation, Bloom's Taxonomy cognitive level classification, and AI difficulty estimation.
- **Step 7:** Implemented AI-powered batch question generation with faculty review workflows (`QuestionGenerationJob`, `GeneratedQuestion`).
- **Step 8:** Implemented examination configuration (`ExamConfiguration`), question paper draft blueprints (`ExamPaper`, `PaperSection`, `QuestionSlot`), standalone paper marks arithmetic (`paperCalculator.ts`), and structural/quality validation (`validatePaper`).

However, before Step 9:
- There was no paper snapshot versioning model (`PaperVersion` did not exist).
- There was no optimistic locking or concurrency conflict detection mechanism on `ExamPaper` (`concurrencyVersion` was absent).
- There were no preview capabilities distinguishing candidate vs. faculty views, nor answer-key stripping.
- There was no version comparison capability to view side-by-side diffs between saved milestones of a paper.

---

## 2. Features Implemented

1. **Immutable Paper Versioning (`PaperVersion` & `paperVersionService.ts`)**:
   - Implemented dedicated snapshot versioning table `paper_versions` storing full paper JSON snapshots (`snapshotJson`), sequential version numbers (`versionNumber`), and optional faculty change notes (`changeNote`).
   - Atomic snapshot persistence in Prisma transactions that increments the paper's concurrency token.
   - Fast metadata-only listing (`listVersions`) preventing unnecessary JSON payload overhead when viewing history.
   - Snapshot retrieval (`getVersion`) and side-by-side comparison (`compareVersions`).

2. **Optimistic Concurrency Control**:
   - Added integer column `concurrencyVersion` on `ExamPaper`.
   - On saving a version, verified expected token against database. In case of token mismatch, transactions abort and return HTTP `409 Conflict`.
   - Frontend detects 409 conflicts and prompts faculty with clear conflict warnings and one-click reload actions.

3. **Answer-Key Protected Preview System (`paperPreviewService.ts`)**:
   - **Faculty View (`?mode=faculty`)**: Complete examination blueprint including faculty internal notes, question revision metadata, difficulty ratings, topic tags, and marking schemes/explanations.
   - **Candidate View (`?mode=candidate`)**: Strictly strips answers, marking guides, faculty explanations, revision analyses, author identities, and slot notes. Displays clear confidentiality banner: *"Candidate View — Answer keys hidden"*.

4. **Frontend Preview & Versioning Workspace**:
   - **Preview Page (`/papers/:paperId/preview`)**:
     - Toggleable tab bar between Faculty and Candidate views.
     - Formatted examination paper document layout with headers, duration, target marks, instructions, sections, and questions with allocated marks.
     - Direct "Save Version" action triggering modal with change note input and optimistic lock token tracking.
     - One-click navigation to Version History and Paper Builder.
   - **Version History Page (`/papers/:paperId/versions`)**:
     - Chronological list of all saved snapshot milestones with version numbers, timestamps, and change notes.
     - Expandable accordion inspecting full read-only snapshot of any historical version.
     - Multi-selection diff tool allowing comparison of any two versions side-by-side in a structured comparison modal.
   - **Paper Builder Enhancements (`/papers/:paperId`)**:
     - Added "Preview" action button in the primary toolbar.
     - Live display of optimistic concurrency lock token.
     - Graceful HTTP 409 conflict detection with reload prompt.

---

## 3. Exact Files Created or Modified

### Created Files:
- `backend/prisma/migrations/20261027150000_step9_paper_versions/migration.sql` — Schema migration for `concurrency_version` column and `paper_versions` table.
- `backend/src/services/paperVersionService.ts` — Optimistic concurrency check, snapshot serialization, version listing, retrieval, and comparison.
- `backend/src/services/paperPreviewService.ts` — Mode-dependent paper preview with answer-key and faculty metadata stripping.
- `backend/src/__tests__/paperVersionAndPreview.test.ts` — 14 backend test cases covering preview modes, answer-key protection, optimistic locking, versioning, comparison, and routes.
- `frontend/src/pages/PaperPreviewPage.tsx` — Faculty/candidate toggleable paper preview with version saving and conflict handling.
- `frontend/src/pages/PaperVersionHistoryPage.tsx` — Version history listing, snapshot inspection, and side-by-side comparison modal.
- `docs/step-9-implementation-report.md` — This comprehensive implementation report.

### Modified Files:
- `backend/prisma/schema.prisma` — Added `concurrencyVersion` and `versions` relation to `ExamPaper`; added `PaperVersion` model.
- `backend/src/schemas/paper.ts` — Added Zod schemas for `saveVersionSchema`, `compareVersionsSchema`, `previewModeSchema`, and `paperVersionParamSchema`.
- `backend/src/services/paperService.ts` — Re-exported preview capabilities.
- `backend/src/routes/papers.ts` — Added routes:
  - `GET /exam-papers/:paperId/preview`
  - `POST /exam-papers/:paperId/versions`
  - `GET /exam-papers/:paperId/versions`
  - `GET /exam-papers/:paperId/versions/compare`
  - `GET /exam-papers/:paperId/versions/:versionNumber`
- `frontend/src/types/paper.ts` — Added `PaperVersion`, `SaveVersionResponse`, `CompareVersionsResponse`, added `concurrencyVersion` to `ExamPaper`, added `explanation` to `QuestionSlotRevision`.
- `frontend/src/lib/api.ts` — Added client functions `getPaperPreview`, `saveVersion`, `listVersions`, `getVersion`, and `compareVersions`.
- `frontend/src/pages/PaperBuilderPage.tsx` — Added "Preview" button, displayed lock token, and implemented 409 conflict alert with reload button.
- `frontend/src/app/router.tsx` — Registered routes `/papers/:paperId/preview` and `/papers/:paperId/versions`.

---

## 4. API Routes and Request/Response Examples

All endpoints operate under `/api/v1` and enforce tenant isolation via `x-institution-id`.

### 1. Paper Preview (`GET /api/v1/exam-papers/:paperId/preview?mode=faculty|candidate`)

#### Candidate Mode (`?mode=candidate`):
```json
{
  "id": "a0000000-0000-4000-8000-000000000033",
  "title": "CS301 Midterm Paper Draft",
  "status": "DRAFT",
  "version": 1,
  "concurrencyVersion": 2,
  "notes": null,
  "config": {
    "name": "Midterm Examination 2026",
    "totalMarks": "100.00",
    "durationMinutes": 180,
    "instructions": "Answer all questions in Section A.",
    "subject": { "id": "sub-1", "name": "Operating Systems", "code": "CS301" }
  },
  "sections": [
    {
      "id": "sec-1",
      "sectionLabel": "A",
      "title": "Short Answer Questions",
      "requiredAnswers": null,
      "slots": [
        {
          "id": "slot-1",
          "sequenceOrder": 1,
          "allocatedMarks": "5.00",
          "notes": null,
          "revision": {
            "id": "rev-1",
            "revisionNumber": 1,
            "questionText": "Define virtual memory.",
            "questionType": "SHORT_ANSWER",
            "marks": "5.00",
            "language": "en",
            "difficulty": "EASY"
          }
        }
      ]
    }
  ]
}
```
*(Notice: `notes`, `explanation`, `suggestedAnswer`, `analyses`, and `authorId` are completely omitted or set to null).*

### 2. Save Paper Version (`POST /api/v1/exam-papers/:paperId/versions`)

**Request:**
```json
{
  "changeNote": "Finalized Section A question marks and verified parity with exam syllabus",
  "concurrencyVersion": 2
}
```

**Response (HTTP 201):**
```json
{
  "versionNumber": 3,
  "concurrencyVersion": 3
}
```

**Response on Concurrency Mismatch (HTTP 409):**
```json
{
  "error": "Concurrent edit detected — please reload the paper",
  "statusCode": 409
}
```

### 3. List Versions (`GET /api/v1/exam-papers/:paperId/versions`)

**Response (HTTP 200):**
```json
[
  {
    "id": "c1f7b022-7933-4f91-8ad3-46ea31b0e271",
    "paperId": "a0000000-0000-4000-8000-000000000033",
    "versionNumber": 3,
    "changeNote": "Finalized Section A question marks and verified parity with exam syllabus",
    "createdAt": "2026-10-27T16:50:00.000Z"
  },
  {
    "id": "b2f6a011-6822-3e80-7ac2-35d920a0d160",
    "paperId": "a0000000-0000-4000-8000-000000000033",
    "versionNumber": 2,
    "changeNote": "Added Section B choice rules",
    "createdAt": "2026-10-27T16:20:00.000Z"
  }
]
```

### 4. Compare Versions (`GET /api/v1/exam-papers/:paperId/versions/compare?versionA=1&versionB=2`)

**Response (HTTP 200):**
```json
{
  "versionA": {
    "title": "CS301 Initial Blueprint",
    "version": 1,
    "sections": [...]
  },
  "versionB": {
    "title": "CS301 Revised Blueprint",
    "version": 2,
    "sections": [...]
  }
}
```

---

## 5. Validation Rules and Severities

The validation engine created in Step 8 continues to be actively enforced and integrated with Step 9:

| Severity | Code | Rule / Invariant Checked |
|---|---|---|
| **ERROR** | `MARKS_MISMATCH` | Achievable marks calculated from optional rules must equal configured exam total. |
| **ERROR** | `PAPER_NO_SECTIONS` | Question paper must have at least one defined section. |
| **ERROR** | `PAPER_NO_QUESTIONS` | Question paper must have at least one question slot. |
| **ERROR** | `SECTION_REQUIRED_EXCEEDS_SLOTS` | Section `requiredAnswers` cannot exceed available question slots. |
| **ERROR** | `SLOT_ZERO_MARKS` | Question slot allocated marks must be positive. |
| **WARNING** | `SECTION_EMPTY` | Section contains no assigned questions. |
| **WARNING** | `DUPLICATE_QUESTION_IN_PAPER` | Same question ID is used across multiple slots. |
| **WARNING** | `QUESTION_SIMILARITY_FLAG` | Question revision has potential or near duplicates flagged in question bank. |
| **WARNING** | `TOPIC_CONCENTRATION` | Single syllabus topic accounts for $>75\%$ of paper marks. |
| **WARNING** | `SECTION_AMBIGUOUS_CHOICE` | Optional-choice section has non-uniform slot marks. |
| **INFO** | `MARKS_MATCH` | Achievable marks match configured total exactly. |

---

## 6. Preview Behavior and Answer-Key Protection Design

1. **Zero Answer-Key Leaks in Candidate Mode**:
   - In `getPaperPreview(..., mode='candidate')`, the server enforces strict whitelist-based projection.
   - Internal notes (`slot.notes`, `paper.notes`) are explicitly set to `null`.
   - Explanations (`slot.revision.explanation`), suggested answers (`slot.revision.suggestedAnswer`), AI analysis results (`slot.revision.analyses`), and author details (`slot.revision.authorId`) are completely excluded from the JSON payload.
2. **Visual Differentiation**:
   - The UI displays an explicit warning banner in candidate view: *"Candidate View — Answer keys hidden. Answers, faculty explanations, notes, and similarity analysis findings are strictly stripped."*
   - In faculty view, question cards expand to show full revision details, difficulty tags, syllabus topics, slot notes, and marking scheme explanations.

---

## 7. Versioning and Concurrency Design

1. **Optimistic Locking**:
   - Every `ExamPaper` row tracks a `concurrencyVersion` integer (default `0`).
   - Any client calling `saveVersion()` must supply the `concurrencyVersion` it read when loading the document.
   - Within an atomic Prisma transaction:
     - The current `concurrencyVersion` is verified against the provided token.
     - If equal, the snapshot is created and `concurrencyVersion` is incremented.
     - If not equal, an `AppError("Concurrent edit detected — please reload the paper", 409)` is thrown.
2. **Snapshot Integrity**:
   - Full JSON serialization of the paper structure, its sections, and referenced immutable question revisions.
   - Because slots reference immutable `QuestionRevision` records, the snapshot is permanently preserved regardless of future bank modifications.

---

## 8. Database Migration Instructions

Migration SQL file deployed at:
`backend/prisma/migrations/20261027150000_step9_paper_versions/migration.sql`

To apply in a target environment:
```bash
cd backend
npx prisma migrate deploy
npx prisma generate
```

---

## 9. Test Commands and Actual Outcomes

### 1. Backend TypeScript Check
```bash
cd backend && npx tsc --noEmit
```
**Outcome:** **PASS** (0 errors)

### 2. Backend Vitest Suite
```bash
cd backend && npx vitest run --reporter=verbose
```
**Outcome:** **PASS**  
- Test Files: **8 passed (8)**
  - `paperVersionAndPreview.test.ts` (14 passed)
  - `paperBuilder.test.ts` (15 passed)
  - `academic.test.ts` (37 passed)
  - `questionGeneration.test.ts` (10 passed)
  - `questionAnalysis.test.ts` (13 passed)
  - `aiClient.test.ts` (7 passed)
  - `errorHandler.test.ts` (9 passed)
  - `health.test.ts` (6 passed)
- Total Tests: **111 passed (100%)**

### 3. Frontend Production Build
```bash
cd frontend && npm run build
```
**Outcome:** **PASS**  
- Vite + TypeScript compilation successful.
- 1,972 modules transformed into production assets with 0 errors.

### 4. AI Service Tests (Regression Check)
```bash
cd ai-service && .venv\Scripts\python.exe -m pytest -o pythonpath=. -q
```
**Outcome:** **PASS**  
- **40 passed, 2 skipped** (integration tests) in 13.64s.

---

## 10. Metrics Supported & Review 2 Evaluation

| Metric | Status | Result / Value | Notes |
|---|---|---|---|
| Optimistic Concurrency Detection | MEASURED | 100% Conflict Detection | Verified via Vitest unit test suite (HTTP 409) |
| Answer-Key Stripping Verification | MEASURED | 100% Stripped in Candidate View | Verified via `paperVersionAndPreview.test.ts` |
| Immutable Version Snapshot Fidelity | MEASURED | 100% | Full JSON tree captured and diff-compared |
| Structural Validation Pass Rate | MEASURED | 100% on valid blueprints | Maintained from Step 8 |
| Paper Creation Quality Baseline | NOT MEASURED | N/A | Requires formal comparison baseline |
| Faculty Assembly Time Savings | NOT MEASURED | N/A | Requires longitudinal user study |

---

## 11. Known Limitations

- Real authentication is stubbed with development tenant context headers (`x-institution-id`) until the formal Auth/RBAC step.
- Version diffing currently provides a side-by-side structural comparison of sections and questions; inline character-level word diffing is not implemented.

---

## 12. Explicit Confirmation: PDF Generation is Deferred

**PDF generation and downloadable formatted examination PDF printing are strictly NOT implemented in Step 9.**
All preview rendering is implemented purely in HTML/React components with responsive cards and clean typography. The structured blueprint data and snapshots are now fully prepared for college template formatting and watermark integration in subsequent steps.

---

## 13. Readiness for Step 10

Step 9 is fully complete. The system now features:
- Complete paper validation engine.
- Dual-mode (Faculty / Candidate) preview with zero answer-key leakage.
- Concurrency conflict detection using optimistic locking.
- Full immutable snapshot versioning and side-by-side comparison.

The codebase is completely ready for **Step 10 — Question Paper Approval Workflow, Moderation, and Final Sign-Off**.

