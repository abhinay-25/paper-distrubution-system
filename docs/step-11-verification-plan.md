# Step 11 Verification Plan — Complete Integration, Security, and End-to-End Verification

**Project:** AI-Powered Blockchain-Based Secure Examination Infrastructure for Intelligent Question Paper Generation and Distribution  
**Stage:** Step 11 — Complete Integration, Security, and End-to-End Verification  
**Date:** October 27, 2026  

---

## 1. Implementation Inventory (Steps 1–10)

| Component / Capability | Step | Initial Status | Notes |
|---|---|---|---|
| **Academic Subjects & Syllabus Topics CRUD** | Step 4 | `IMPLEMENTED AND VERIFIED` | Paginated, tenant-isolated, unique subject codes per institution |
| **Question Bank & Immutable Question Revisions** | Step 4 | `IMPLEMENTED AND VERIFIED` | Atomic creation, optimistic concurrency (`expectedRevisionNumber`), immutable revisions |
| **Python FastAPI AI Microservice Foundation** | Step 5 | `IMPLEMENTED AND VERIFIED` | Internal bearer token auth (`require_internal_service`), Pydantic validation, structured error handling |
| **AI Question Intelligence (Bloom's, Difficulty, Duplicates)** | Step 6 | `IMPLEMENTED AND VERIFIED` | Local `all-MiniLM-L6-v2` semantic duplicate detection + Gemini provider + advisory faculty review |
| **AI Batch Question Generation & Faculty Promotion** | Step 7 | `PARTIALLY IMPLEMENTED` | Defect found: `reviewGeneratedQuestion` did not validate `input.subjectId` tenant ownership when `topicIds` was empty |
| **Examination Configuration & Paper Builder** | Step 8 | `IMPLEMENTED AND VERIFIED` | Marks arithmetic (`paperCalculator.ts`), optional choice rules, syllabus coverage, validation engine |
| **Paper Preview (Faculty/Candidate) & Versioning** | Step 9 | `PARTIALLY IMPLEMENTED` | Defect found: `saveVersion` lacked status guard blocking new versions on `SUBMITTED`/`APPROVED` papers |
| **Independent Paper Approval Lifecycle** | Step 10 | `PARTIALLY IMPLEMENTED` | Defects found: (1) `getPaperForEdit` blocked editing `REJECTED` papers (`409`); (2) `submitPaperForApproval` reused `versions[0]` on re-submission if a prior version existed |
| **College-Template PDF Generation & Integrity** | Step 10 | `IMPLEMENTED AND VERIFIED` | 2-page CBIT Autonomous template (`cbit-autonomous-v1`), SHA-256 verification, private storage |
| **Production Session/JWT Authentication** | Deferred | `NOT IMPLEMENTED` | `tenantContextMiddleware` intentionally blocks `NODE_ENV=production` with `401` until JWT/session step |

---

## 2. End-to-End Workflows to Verify

### Workflow A — Question Bank (`subjectService`, `topicService`, `questionService`)
1. Retrieve subjects and syllabus topics as an authorized faculty user.
2. Create a question and its initial revision (`revisionNumber = 1`).
3. Edit the question (`expectedRevisionNumber = 1`) and verify `revisionNumber = 2` is created.
4. Retrieve historical revisions and verify `revisionNumber = 1` is preserved unchanged.
5. Verify search, filtering, and pagination.
6. Verify cross-institution access attempts are rejected (`404` / `400`).

### Workflow B — AI Question Intelligence & Generation (`questionAnalysisService`, `questionGenerationService`, `ai-service`)
1. Submit a valid AI generation request (`POST /api/v1/generation-jobs`).
2. Verify input validation, prompt construction, and schema-valid structured candidate persistence.
3. Verify provider error/timeout handling transitions job to `FAILED` and returns `503`.
4. Review generated candidates (`APPROVED`, `EDITED`, `REJECTED`) and promote selected items into the question bank.
5. Verify AI outputs never bypass faculty review (`status = PENDING` initially) and cross-tenant `subjectId` promotion is rejected.

### Workflow C — Examination Configuration & Paper Construction (`paperService`, `paperCalculator`)
1. Create an examination configuration for a subject.
2. Create a paper draft with mandatory and optional-choice sections.
3. Add, reorder, and remove question slots referencing immutable `QuestionRevision` IDs.
4. Verify marks calculation (printed marks vs. achievable marks) and syllabus topic coverage.
5. Verify cross-institution question/revision assignment is rejected (`404`).
6. Edit a question in the question bank (`v1 -> v2`) and confirm the existing paper slot still references `v1`.

### Workflow D — Paper Validation, Preview, Editing, and Versioning (`paperService`, `paperPreviewService`, `paperVersionService`)
1. Run validation on incomplete/invalid papers (`MARKS_MISMATCH`, `PAPER_NO_QUESTIONS`, `SECTION_REQUIRED_EXCEEDS_SLOTS`) and confirm blocking `ERROR`s.
2. Run validation on valid papers with advisory conditions (`SECTION_AMBIGUOUS_CHOICE`, `DUPLICATE_QUESTION_IN_PAPER`) and confirm `WARNING` vs `ERROR` distinction.
3. Open candidate preview (`?mode=candidate`) and faculty preview (`?mode=faculty`); confirm zero answer-key, explanation, or internal note leakage in candidate view.
4. Save paper versions (`v1`, `v2`), inspect version history, compare versions, and verify optimistic concurrency conflict (`409 Conflict`).

### Workflow E — Independent Approval (`paperApprovalService`)
1. Attempt to submit a paper with blocking validation errors -> rejected with `422`.
2. Submit a valid paper version for approval -> creates immutable `PaperVersion` and `PaperSubmission` (`PENDING`), paper transitions to `SUBMITTED`.
3. Attempt self-approval (`submittedBy === reviewerId`) -> rejected with `403`.
4. Attempt approval as unauthorized role (`EXAMINER` / `VIEWER`) -> rejected with `403`.
5. Attempt cross-institution approval -> rejected with `404`.
6. Reject submission without comments -> rejected with `422`; reject with comments -> transitions paper to `REJECTED`.
7. Edit the rejected paper draft (transitions paper back to `DRAFT`), re-submit for approval -> automatically creates a new `PaperVersion` (`v2`) without mutating `v1`, and confirm previous decision does not approve `v2`.
8. Approve the new submission as an independent `MODERATOR` -> transitions paper to `APPROVED`.

### Workflow F — PDF Generation and Template Integrity (`paperApprovalService`, `pdfRendererService`, `storageService`)
1. Attempt PDF generation for `DRAFT`, `SUBMITTED`, and `REJECTED` papers -> rejected with `400`.
2. Generate PDF for `APPROVED` paper -> renders 2-page CBIT template PDF bound to the exact approved `PaperVersion`.
3. Verify output begins with `%PDF`, contains non-zero bytes, matches CBIT layout (Regulation `R22`, `Code No.`, Part A & Part B, `M`/`CO`/`BT` columns, `(OR)` separators, `*****`, `Page X of Y`), and excludes answer keys/notes.
4. Verify SHA-256 checksum calculation and `integrityVerified: true` on `GET /exam-papers/:paperId/pdf`, and `integrityVerified: false` if file bytes are tampered with.
5. Verify cross-institution PDF metadata and download attempts are rejected (`404`).

---

## 3. Security Verification Matrix

| Security Area | Target Controls |
|---|---|
| **A. Authentication & Authorization** | Missing/invalid `x-institution-id` (`401`), production guard (`401`), self-approval block (`403`), role check (`MODERATOR`/`INSTITUTION_ADMIN`/`SUPER_ADMIN`), internal AI token check (`401`/`403`) |
| **B. Tenant Isolation** | Cross-tenant subject, topic, question, revision, analysis, generation job, exam config, paper, version, submission, and PDF access blocked |
| **C. Input Validation** | Missing fields, invalid UUIDs, invalid enums, negative/excessive marks, oversized strings, invalid state transitions (`400`/`409`/`422`) |
| **D. Secrets & Privacy** | No API keys or DB credentials in frontend bundle or API responses; candidate preview and generated PDF strip answer keys and internal notes |
| **E. Reliability & Concurrency** | Question revision optimistic lock (`409`), paper version optimistic lock (`409`), repeat approval decision block (`409`), idempotent PDF generation |

