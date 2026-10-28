# Step 12 — Full Pre-Deployment Audit, Security Readiness, and Environment Configuration

**Date**: 2026-10-27  
**Project**: AI-Powered Blockchain-Based Secure Examination Infrastructure for Intelligent Question Paper Generation and Distribution  
**Step**: Step 12 of 13 (Pre-Deployment Audit, Security Readiness, and Environment Configuration)

---

## 1. Executive Summary

- **Overall Readiness Status**: **`NOT READY`** for public internet deployment until **P0-01** (production identity/JWT authentication or an authenticated network proxy) and **P0-02** (production credentials & Gemini API key provisioning) are resolved. **`READY WITH CONDITIONS`** for a private/staging Review 1 demonstration environment.
- **What Works End-to-End right now**:
  - Multi-tenant academic question bank (`Subject`, `SyllabusTopic`, `Question`, immutable `QuestionRevision`, `Tag`) with soft archive/restore and audit logging.
  - Python FastAPI AI microservice (`ai-service`) providing Bloom's taxonomy classification, difficulty estimation, semantic duplicate detection (`all-MiniLM-L6-v2` + fallback token-overlap), and candidate question generation (`POST /internal/ai/analyze-question`, `POST /internal/ai/generate-questions`).
  - Examination configuration (`ExamConfig`, `ExamSectionConfig`) and Paper Builder (`ExamPaper`, `PaperSection`, `PaperQuestionSlot`, auto-fill, topic coverage, Bloom/difficulty distribution).
  - Deterministic paper validation (`POST /api/v1/papers/:id/validate`), immutable `PaperVersion` snapshots (`v1`, `v2`, ...) with SHA-256 `contentHash`, and paper comparison (`GET /api/v1/papers/:id/compare`).
  - Independent paper approval workflow (`PaperSubmission`, `ApprovalRecord`), separation of duties (`submittedByUserId !== actorUserId`), role-based review (`ADMIN` / `MODERATOR`), rejection/re-edit/re-submit cycle (`REJECTED -> DRAFT -> v2 SUBMITTED -> APPROVED`).
  - Deterministic college-template PDF generation (`cbit-autonomous-v1` based on the user's CBIT `Social_Engineering_22CIE18.pdf` template) bound to the exact approved `PaperVersion` via `PaperPdfArtifact` (`sha256Hash` + private storage outside public static assets).
  - All automated checks pass: Frontend ESLint (**0 errors**), Frontend TypeScript + Vite build (**PASSED**), Backend Prisma validate + TypeScript + build (**PASSED**), Backend Vitest suite (**11 files / 147 tests passed** against real PostgreSQL 16), and Python AI service `pytest` suite (**40 passed, 2 skipped**).
- **What Blocks Step 13 (Public Production Deployment)**:
  1. **P0-01 — Production Authentication (`backend/src/middleware/tenantContext.ts`)**: When `NODE_ENV=production`, `tenantContextMiddleware` intentionally rejects all `/api/v1` requests with `401 Unauthorized` (`Production authentication is not yet configured`) because development header impersonation (`x-institution-id`, `x-user-id`, `x-user-role`) is strictly blocked in production.
  2. **P0-02 — Production Secrets & External Infrastructure Not Yet Provisioned**: Production `DATABASE_URL`, shared 32+ character `AI_SERVICE_TOKEN` / `INTERNAL_SERVICE_TOKEN`, and `GEMINI_API_KEY` must be configured in the user's local/deployment environment files before running in `production` mode or testing live Gemini API calls.

---

## 2. Implementation Audit (Steps 1–11)

| Area | Step(s) | Status | Evidence / Verification Details |
| :--- | :--- | :--- | :--- |
| **Frontend UI & Flows** (`frontend/`) | Steps 2, 4, 7, 8, 9, 10 | `PASS` | 15 page routes in `frontend/src/App.tsx` covering Dashboard, Subjects, Subject Detail, Question Bank, Question Create/Detail, AI Question Generator, Exam Config List/Form, Paper List/Builder/Preview/Version History, Submission Queue, and Submission Review + PDF viewer. `npm --prefix frontend run lint` (0 errors) and `npm --prefix frontend run build` pass. |
| **Backend API, Validation & Domain Logic** (`backend/`) | Steps 2, 4, 6, 7, 8, 9, 10, 11 | `PASS` | Express 5 + TypeScript + Zod validation across `/health` and `/api/v1/{subjects,questions,ai,question-generation,exam-configs,papers,paper-submissions}`. Standardized error envelopes (`AppError`), request correlation IDs (`X-Request-Id`), and security headers. |
| **Database Schema, Migrations & Seed** (`backend/prisma/`) | Steps 3, 4, 7, 8, 9, 10 | `PASS` | 21 models and 10 enums across 7 tracked Prisma migrations (`20260402000000_init_foundation` through `20261027173000_step_10_approval_and_pdf`). Verified against PostgreSQL 16 (`pds_dev`). Production seed guard added in `backend/prisma/seed.ts`. |
| **Python AI Service & Provider Integration** (`ai-service/`) | Steps 5, 6, 7 | `PASS` (Mocked / Offline) / `NOT CONFIGURED` (Live Gemini) | FastAPI + Pydantic v2 + `google-genai` SDK + `sentence-transformers` (`all-MiniLM-L6-v2`). Bearer token auth (`INTERNAL_SERVICE_TOKEN`), strict extra-field rejection, retry/timeout handling, and graceful fallback when `GEMINI_API_KEY` is unset in dev. Live Gemini smoke test is `SKIPPED` until `GEMINI_API_KEY` is provided by user. |
| **Approval Workflow & Immutability** (`paperApprovalService.ts`) | Steps 9, 10, 11 | `PASS` | Enforces validation before submission, locks `PaperVersion` snapshot (`snapshotJson` + `contentHash`), blocks edits while `SUBMITTED` or `APPROVED`, enforces `submittedByUserId !== actorUserId` and `ADMIN`/`MODERATOR` role, and creates a new `PaperVersion` (`v2`) when a rejected paper is edited and re-submitted. |
| **College-Template PDF Renderer & Storage** (`pdfRendererService.ts`, `storageService.ts`) | Step 10 | `PASS` | Renders CBIT Autonomous template (`cbit-autonomous-v1`) matching `Social_Engineering_22CIE18.pdf` using `pdf-lib` with embedded StandardFonts (`TimesRoman`, `TimesRomanBold`, `TimesRomanItalic`). Stores artifacts privately under `PDF_STORAGE_DIR` with SHA-256 integrity checks before download. |
| **Automated Test Suites** (`backend/src/__tests__/`, `ai-service/tests/`) | Steps 4–11 | `PASS` | **147/147** backend Vitest tests (unit + real-PostgreSQL E2E & security suites) and **40/40** Python `pytest` unit/integration tests pass (plus 2 opt-in live model tests skipped by default). |
| **Production Authentication & PostgreSQL RLS** | Pre-Step 13 | `NOT IMPLEMENTED` | `tenantContext.ts` uses dev headers in `development`/`test` and fail-closes (`401`) in `production`. Tenant isolation is enforced at the Prisma service layer (`PASS`), while database-level PostgreSQL Row-Level Security (RLS) policies remain `NOT IMPLEMENTED` until session/JWT auth sets `app.current_institution_id`. |

---

## 3. Environment-Variable Inventory Table

Every environment variable below was verified directly against the executable source code:

| Variable Name | Service / Component | Exact Files Reading Variable | Required vs Optional | Expected Format / Type | Safe Default in Code | Where Defined Locally | Where Defined in Production | Public vs Secret | Current Local Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Frontend (`frontend/`) | `frontend/src/lib/api.ts` | Optional in local dev (Vite proxy handles `/api` and `/health`); Required if frontend & backend are hosted on separate origins | Base URL string without trailing slash (e.g. `https://api.example.com`) or empty string `""` | `""` (empty string, uses relative `/api/v1`) | `frontend/.env` (template in `frontend/.env.example`) | Frontend build environment (e.g. Vercel / Netlify / CI build env) | **Public** (bundled into client JS) | `Optional` (`frontend/.env.example` created) |
| `NODE_ENV` | Backend (`backend/`) | `backend/src/config/env.ts`, `backend/src/middleware/tenantContext.ts`, `backend/src/middleware/errorHandler.ts`, `backend/prisma/seed.ts` | Optional (has default) | Enum: `development` \| `test` \| `production` | `"development"` | `backend/.env` | Container / Host environment | Public | `Configured` (`development` in `backend/.env`) |
| `PORT` | Backend (`backend/`) | `backend/src/config/env.ts`, `backend/src/server.ts` | Optional (has default) | Integer `1..65535` | `4000` | `backend/.env` | Container / Host environment | Public | `Configured` (`4000` in `backend/.env`) |
| `CORS_ORIGIN` | Backend (`backend/`) | `backend/src/config/env.ts`, `backend/src/app.ts` | Optional in dev; Required in production | Origin URL string (e.g. `http://localhost:5173` or `https://app.example.com`) | `"http://localhost:5173"` | `backend/.env` | Container / Host environment | Public | `Configured` (`http://localhost:5173` in `backend/.env`) |
| `DATABASE_URL` | Backend & Prisma (`backend/`) | `backend/src/config/env.ts`, `backend/src/lib/prisma.ts`, `backend/prisma.config.ts`, `backend/prisma/seed.ts` | **Required** | PostgreSQL URI (`postgresql://user:pass@host:port/db?schema=public`) | None in `env.ts` (startup fails if missing); `prisma.config.ts` has a CLI fallback for `prisma validate` | `backend/.env` | Secret Manager / Host environment | **Secret** | `Configured` (points to local Docker `pds_dev`) |
| `AI_SERVICE_URL` | Backend (`backend/`) | `backend/src/config/env.ts`, `backend/src/services/aiServiceClient.ts` | Optional (has default) | Valid HTTP/HTTPS URL (`z.string().url()`) | `"http://127.0.0.1:8000"` | `backend/.env` | Container / Host environment (internal private network URL) | Public / Internal | `Configured` (`http://127.0.0.1:8000` in `backend/.env`) |
| `AI_SERVICE_TOKEN` | Backend (`backend/`) | `backend/src/config/env.ts`, `backend/src/services/aiServiceClient.ts` | **Required** | String, minimum 32 characters; **must equal `INTERNAL_SERVICE_TOKEN`** in `ai-service`; dev placeholder rejected in `production` | Dev placeholder in `env.ts` for `development`/`test` only; rejected when `NODE_ENV=production` | `backend/.env` | Secret Manager / Host environment | **Secret** | `Configured` (dev token in `backend/.env`; **must rotate for production**) |
| `PDF_STORAGE_DIR` | Backend (`backend/`) | `backend/src/config/env.ts`, `backend/src/services/storageService.ts` | Optional (has default) | File-system path string (relative to `backend/` or absolute path) | `"./storage/pdf-artifacts"` | `backend/.env` | Persistent private volume mount path in production | Public (path) | `Configured` (default `./storage/pdf-artifacts`) |
| `ALLOW_PROD_SEED` | Backend Seed (`backend/prisma/seed.ts`) | `backend/prisma/seed.ts` | Optional | `"true"` to explicitly override production seed block | Unset (blocks seeding when `NODE_ENV=production`) | Shell / CLI only | Do not set in production unless initializing an empty staging DB | Public | `Unset` (safe) |
| `APP_ENV` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Enum: `development` \| `test` \| `production` | `"development"` | `ai-service/.env` | Container / Host environment | Public | `Missing local .env` (`ai-service/.env.example` exists; uses safe defaults in dev) |
| `HOST` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | IP / Hostname string | `"127.0.0.1"` | `ai-service/.env` | Container / Host environment (`0.0.0.0` inside container on private network) | Public | `Defaulted` (`127.0.0.1`) |
| `PORT` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Integer `1..65535` | `8000` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`8000`) |
| `LOG_LEVEL` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py`, `ai-service/app/core/logging.py` | Optional (has default) | Enum: `DEBUG` \| `INFO` \| `WARNING` \| `ERROR` | `"INFO"` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`INFO`) |
| `INTERNAL_SERVICE_TOKEN` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py`, `ai-service/app/core/security.py` | **Required** | `SecretStr`, minimum 32 characters; **must equal `AI_SERVICE_TOKEN`** in `backend` | None (startup fails if missing or `< 32` chars) | `ai-service/.env` | Secret Manager / Host environment | **Secret** | **Action Needed**: Create `ai-service/.env` from `ai-service/.env.example` |
| `AI_PROVIDER` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Literal `"gemini"` | `"gemini"` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`gemini`) |
| `GEMINI_API_KEY` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py`, `ai-service/app/services/orchestrator.py`, `ai-service/app/providers/gemini_provider.py` | Optional in `development`/`test` (service runs in degraded/fallback mode); **Required when `APP_ENV=production`** | Google AI Studio / Gemini API Key (`SecretStr`, non-whitespace) | `None` (raises startup error if missing when `APP_ENV=production`) | `ai-service/.env` | Secret Manager / Host environment | **Secret** | **Action Needed**: Set in `ai-service/.env` for live Gemini calls |
| `GEMINI_MODEL` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Non-empty model identifier string (e.g. `gemini-2.5-flash` or `gemini-3.8-flash`) | `"gemini-3.8-flash"` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`gemini-3.8-flash`) |
| `AI_REQUEST_TIMEOUT_SECONDS` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Float `1.0..120.0` | `30.0` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`30.0`) |
| `AI_MAX_RETRIES` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Integer `0..5` | `2` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`2`) |
| `AI_RETRY_BASE_DELAY_SECONDS` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Float `0.1..10.0` | `0.5` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`0.5`) |
| `AI_RETRY_MAX_DELAY_SECONDS` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Float `0.5..30.0` | `8.0` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`8.0`) |
| `AI_MAX_OUTPUT_TOKENS` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Integer `128..8192` | `2048` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`2048`) |
| `MAX_REQUEST_BYTES` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py`, `ai-service/app/main.py` | Optional (has default) | Integer `1024..524288` | `65536` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`65536`) |
| `MAX_INPUT_CHARS` | Python AI Service (`ai-service/`) | `ai-service/app/core/config.py` | Optional (has default) | Integer `100..32000` | `8000` | `ai-service/.env` | Container / Host environment | Public | `Defaulted` (`8000`) |
| `RUN_REAL_GEMINI_TESTS` | Python AI Service Tests (`ai-service/tests/test_real_provider.py`) | `ai-service/tests/test_real_provider.py` | Optional (test-only flag) | `"1"` to enable live Gemini smoke test | Unset (skips live Gemini test) | Shell / CLI only | Not used in production | Public | `Unset` |
| `RUN_HEAVY_ML_TESTS` | Python AI Service Tests (`ai-service/tests/test_duplicate_evaluation.py`) | `ai-service/tests/test_duplicate_evaluation.py` | Optional (test-only flag) | `"1"` to enable live SentenceTransformer model download/benchmark | Unset (skips heavy download test) | Shell / CLI only | Not used in production | Public | `Unset` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Local Docker PostgreSQL (`docker-compose.yml`) | `docker-compose.yml` | Used only by local Docker container | Strings (`pds_dev`, `pds_dev_local`, `pds_dev`) | Defined in `docker-compose.yml` | `docker-compose.yml` | Managed PostgreSQL provider in production | Local dev only | `Configured` (`pds-postgres` container running) |

---

## 4. External Accounts and Services Checklist

| Service / Account | Required For | Local Development Status | Production Requirement |
| :--- | :--- | :--- | :--- |
| **PostgreSQL 16 Database** | Primary relational database for all 21 Prisma models (`backend/`) | Running locally via `docker-compose.yml` (`pds-postgres` on `localhost:5432`) | Managed PostgreSQL 16+ instance (e.g., Supabase, Neon, RDS, Cloud SQL) with TLS (`sslmode=require`) and automated backups. |
| **Google AI Studio / Gemini API (`GEMINI_API_KEY`)** | Live AI question classification, difficulty estimation, and candidate question generation in `ai-service` | Optional in dev (fallback heuristics used when unset); required for live AI generation | Active Google AI Studio or Vertex AI Gemini API key with billing/rate-limits suitable for faculty workloads; model set via `GEMINI_MODEL` (e.g., `gemini-2.5-flash`). |
| **Hugging Face / Sentence Transformers (`all-MiniLM-L6-v2`)** | Local semantic embedding generation for duplicate question detection in `ai-service` | Loaded lazily on first embedding call; falls back to deterministic token-overlap similarity if offline | Pre-cache model weights during container image build (`python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"`) so production containers do not download weights at runtime. |
| **Private Persistent File Storage (`PDF_STORAGE_DIR`)** | Storing generated approved examination question paper PDFs (`PaperPdfArtifact`) | Stored locally under `backend/storage/pdf-artifacts` (gitignored) | Persistent private volume mount (e.g., Docker volume / EBS / Filestore) accessible only to the `backend` process, or an encrypted S3/GCS private bucket adapter. |
| **Hosting / Compute Environments** | Serving `frontend` (static SPA), `backend` (Node.js API), and `ai-service` (internal Python service) | Local processes (`localhost:5173`, `localhost:4000`, `localhost:8000`) | Frontend on CDN/static host; Backend on Node 20+ container/host; AI service on private internal network accessible **only** by Backend. |

---

## 5. Exact Files the User Needs to Create or Edit Before Step 13

### 5.1. `ai-service/.env` (Create from `ai-service/.env.example`)
Currently `ai-service/.env.example` exists, but `ai-service/.env` has not been created yet.
- **Action**: Copy `ai-service/.env.example` to `ai-service/.env` and set:
  - `INTERNAL_SERVICE_TOKEN`: Must match `AI_SERVICE_TOKEN` in `backend/.env` (at least 32 characters).
  - `GEMINI_API_KEY`: Your Google Gemini API key (leave empty only if running offline/degraded mode in development; **required** when `APP_ENV=production`).
  - `GEMINI_MODEL`: Verify the exact model ID supported by your Gemini key (e.g., `gemini-2.5-flash` or `gemini-3.8-flash`).

### 5.2. `backend/.env` (Review and update for production / live AI)
`backend/.env` already exists locally for development (`localhost:5432`).
- **Action for Local Live AI Testing**:
  - Ensure `AI_SERVICE_TOKEN` in `backend/.env` matches `INTERNAL_SERVICE_TOKEN` in `ai-service/.env`.
- **Action Before Production Deployment**:
  - Generate a fresh cryptographic token (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) and set it as both `backend` `AI_SERVICE_TOKEN` and `ai-service` `INTERNAL_SERVICE_TOKEN`. (Note: `backend/src/config/env.ts` now enforces a hard startup check that rejects the development placeholder token when `NODE_ENV=production`.)
  - Set `DATABASE_URL` to your production PostgreSQL connection string.
  - Set `CORS_ORIGIN` to your deployed frontend origin.
  - Set `PDF_STORAGE_DIR` to a persistent private directory path on the server.

### 5.3. `frontend/.env` (Optional in local dev; required for split-origin deployment)
`frontend/.env.example` was created during this audit.
- **Action**:
  - For local development with `npm --prefix frontend run dev`, no change is required because `vite.config.ts` proxies `/api` and `/health` to `http://localhost:4000`.
  - Before building the frontend for deployment on a separate domain from the backend, create `frontend/.env` (or configure your hosting build environment) with `VITE_API_BASE_URL=https://your-backend-domain.example.com`.

---

## 6. Security and Repository Hygiene Audit

### 6.1. Secrets & `.gitignore` Hygiene (`PASS`)
- Checked tracked and untracked files across the repository (`git status --ignored -s`).
- Verified that `backend/.env` is **untracked and ignored** by `.gitignore`.
- Added `storage/` to `.gitignore` during Step 12 so generated examination PDFs (`backend/storage/pdf-artifacts/*.pdf`) and verification renders (`storage/pdf-artifacts/*.png`) can never be accidentally committed.
- Verified `backend/.env.example`, `ai-service/.env.example`, and `frontend/.env.example` contain only safe placeholders and documentation comments.
- Verified that neither `backend` nor `ai-service` logs `DATABASE_URL`, `AI_SERVICE_TOKEN`, `INTERNAL_SERVICE_TOKEN`, or `GEMINI_API_KEY` (`ai-service/tests/test_config.py::test_secret_repr_does_not_leak` explicitly verifies `SecretStr` redaction).

### 6.2. Authentication, Authorization & Tenant Isolation (`PARTIAL` — P0 Blocker for Public Prod)
- **Tenant Isolation (`PASS` at service layer)**: Every query and mutation across `subjectService`, `questionService`, `questionIntelligenceService`, `questionGenerationService`, `examConfigService`, `paperService`, `paperValidationService`, `paperVersionService`, `paperApprovalService`, and `pdfGenerationService` scopes records by `institutionId`. Cross-tenant access attempts consistently return `404 Not Found` (verified by `step11IntegrationAndSecurity.test.ts`).
- **Role-Based Access Control (`PASS`)**:
  - `ADMIN`, `MODERATOR`, and `EXAMINER` can create subjects, questions, exam configs, and draft papers, and submit papers for approval.
  - Only `ADMIN` and `MODERATOR` can review submissions (`POST /api/v1/paper-submissions/:id/review`) and generate official PDFs (`POST /api/v1/papers/:id/generate-pdf`). `EXAMINER` is rejected with `403 Forbidden`.
  - Separation of duties is strictly enforced: `submission.submittedByUserId === actorUserId` is rejected with `403 Forbidden` even if the submitter has `ADMIN` or `MODERATOR` role.
- **Authentication (`BLOCKED` for public production — P0-01)**:
  - `backend/src/middleware/tenantContext.ts` reads `x-institution-id`, `x-user-id`, and `x-user-role` headers in `development` and `test` modes.
  - In `production` mode (`NODE_ENV=production`), `tenantContext.ts` blocks all requests with `401 Unauthorized` (`Production authentication is not yet configured`).

### 6.3. AI Service Boundary & Data Privacy (`PASS`)
- `ai-service` requires `Authorization: Bearer <INTERNAL_SERVICE_TOKEN>` using constant-time `secrets.compare_digest` on all `/internal/ai/*` routes.
- Only question text, subject/topic metadata, Bloom level, difficulty, and candidate text for similarity comparison are sent to `ai-service`. No user credentials, personal data, or full approved examination paper PDFs are sent to the external AI provider.
- All Gemini outputs are parsed and validated through strict Pydantic schemas (`extra="forbid"`) and re-validated by the Node.js backend before persistence. AI-generated questions are saved only as `CandidateQuestion` (`PENDING_REVIEW`) and cannot enter the active question bank without explicit human review.

### 6.4. PDF Storage & Template Integrity (`PASS`)
- Generated PDFs are written outside `frontend/public` into `PDF_STORAGE_DIR` (`./storage/pdf-artifacts/{institutionId}/{paperId}/{versionId}_{timestamp}.pdf`).
- `storageService.ts` sanitizes path segments (`sanitizeSegment`) and checks `!resolved.startsWith(baseDir)` to prevent path traversal.
- `pdfGenerationService.ts` computes a SHA-256 hash on generation (`PaperPdfArtifact.sha256Hash`) and re-verifies `crypto.createHash("sha256").update(fileBytes).digest("hex") === artifact.sha256Hash` on every download (`GET /api/v1/papers/:id/pdf`), returning `500 Integrity failure` if the file on disk was tampered with.

---

## 7. Database Readiness

- **Schema & Migrations (`PASS`)**:
  - `npx prisma validate` passes with 0 errors.
  - All 7 migration directories in `backend/prisma/migrations/` match `backend/prisma/schema.prisma` with zero schema drift:
    1. `20260402000000_init_foundation`
    2. `20260402010000_step_4_question_bank`
    3. `20261027112202_step_6_question_intelligence`
    4. `20261027121500_step_7_question_generation`
    5. `20261027150000_step_8_exam_config_and_paper_builder`
    6. `20261027160000_step_9_validation_and_versioning`
    7. `20261027173000_step_10_approval_and_pdf`
- **Production Migration Command**:
  - Use `npx prisma migrate deploy` (via `npm --prefix backend run db:migrate:deploy`) in staging/production. Never run `prisma migrate dev` or `prisma db push` against production.
- **Seed Script Safety (`PASS`)**:
  - Updated `backend/prisma/seed.ts` during Step 12 to refuse execution when `NODE_ENV=production` unless `ALLOW_PROD_SEED=true` is explicitly set.
  - Seed script uses idempotent `upsert` operations.
- **Row-Level Security (RLS) Status (`NOT IMPLEMENTED` at DB level)**:
  - As documented in `database/README.md`, PostgreSQL RLS policies (`app.current_institution_id`) were deferred to the authentication step. Application-layer tenant filtering in Prisma services is `PASS` and verified by automated tests.

---

## 8. Build and Test Results (Executed in Step 12)

All checks below were executed against the current repository state after applying Step 12 fixes:

| Check / Suite | Exact Command Executed | Result | Details |
| :--- | :--- | :--- | :--- |
| **Backend Prisma Schema Validation** | `cd backend; npx prisma validate` | **PASS** | `The schema at prisma\schema.prisma is valid 🚀` |
| **Backend TypeScript Typecheck** | `cd backend; npm run typecheck` (`tsc --noEmit`) | **PASS** | 0 errors |
| **Backend Production Build** | `cd backend; npm run build` (`tsc -p tsconfig.build.json`) | **PASS** | Compiled cleanly to `backend/dist/` |
| **Backend Automated Test Suite (Vitest + PostgreSQL 16)** | `cd backend; npm test` (`vitest run`) | **PASS** | **11 test files passed, 147 tests passed** in 5.83s (includes unit tests + real-PostgreSQL integration & security tests across Steps 4–11) |
| **Python AI Service Automated Test Suite (Pytest)** | `cd ai-service; .\.venv\Scripts\pytest.exe -o pythonpath=. -v` | **PASS** | **40 passed, 2 skipped** in 14.46s (2 opt-in live model tests skipped by default: `test_live_sentence_transformer_benchmark`, `test_real_gemini_smoke_test`) |
| **Frontend ESLint Check** | `npm --prefix frontend run lint` | **PASS** | **0 errors**, 10 non-blocking React hook dependency warnings |
| **Frontend TypeScript + Vite Production Build** | `npm --prefix frontend run build` (`tsc -b && vite build`) | **PASS** | Built cleanly to `frontend/dist/` |

### Safe Code & Configuration Fixes Applied During Step 12
1. **`.gitignore`**: Added `storage/` so private generated examination PDFs and test artifacts are never committed to Git.
2. **`backend/src/config/env.ts` & `backend/.env.example`**: Added `PDF_STORAGE_DIR` validation and added a `.superRefine()` production guard that rejects the default development `AI_SERVICE_TOKEN` when `NODE_ENV=production`.
3. **`backend/src/app.ts`**: Added `X-User-Id, X-User-Role` to `Access-Control-Allow-Headers` so browser CORS preflight requests succeed when frontend and backend run on different origins.
4. **`backend/prisma/seed.ts`**: Added a production guard preventing accidental execution of `prisma db seed` when `NODE_ENV=production` unless `ALLOW_PROD_SEED=true`.
5. **`frontend/src/lib/api.ts` & `frontend/.env.example`**: Added `VITE_API_BASE_URL` support for split-origin deployments and created `frontend/.env.example`.
6. **`frontend/src/pages/QuestionGeneratorPage.tsx`**: Fixed topic loading to call `fetchTopics(selectedSubjectId)` instead of reading a non-existent `.topics` property on `SubjectDetail`, restoring the topic dropdown in the AI Question Generator UI.
7. **`frontend/eslint.config.js` & Frontend Pages (`PaperListPage.tsx`, `PaperVersionHistoryPage.tsx`, `SubmissionReviewPage.tsx`)**: Fixed all 34 ESLint errors and 1 TypeScript build error so both `npm --prefix frontend run lint` and `npm --prefix frontend run build` pass with 0 errors.

---

## 9. PDF Template Readiness

- **Original Reference Template**: `Social_Engineering_22CIE18.pdf` (`C:/Users/palle/.gemini/antigravity/brain/c2855197-ebb6-4ba3-8010-ea150f7cc250/.user_uploaded/media_1793120579147_eccf4862.pdf`).
- **Renderer Implementation**: `backend/src/services/pdfRendererService.ts` (`TEMPLATE_VERSION = "cbit-autonomous-v1"`).
- **Verified Fidelity (`PASS`)**:
  - Top-right `Code No: <code>` bold header and boxed `Hall Ticket No.` with 10 individual character cells.
  - Centered institution header (`CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)`), program/semester subtitle, examination title, `Time: X Hours` / `Max Marks: Y` row, and italicized candidate instructions block.
  - Full-width 6-column bordered grid (`Q.No` | `Questions` | `Marks` | `CO` | `TL` | `PI`) with centered section band headers (`Part - A`, `Part - B`), sub-question grouping (`1 a)`, `b)`), `"OR"` separator rows for internal choice pairs, automatic multi-page continuation (`Page X of Y`), and centered `***` end marker.
  - Embedded standard PDF fonts (`TimesRoman`, `TimesRomanBold`, `TimesRomanItalic`) via `pdf-lib` require no external OS font files in Docker/Linux deployments.
  - Visually verified in Step 10 by rendering a 2-page PDF to 150 DPI PNGs (`storage/pdf-artifacts/page_1.png`, `page_2.png`) and comparing directly against `Social_Engineering_22CIE18.pdf`.

---

## 10. Prioritized Issue List (`P0`, `P1`, `P2`, `P3`)

### `P0` — Must Fix Before Public Production Deployment
- **P0-01: Production Authentication Middleware (`backend/src/middleware/tenantContext.ts`)**
  - **Issue**: In `development` and `test` modes, `tenantContext.ts` trusts `x-institution-id`, `x-user-id`, and `x-user-role` request headers. When `NODE_ENV=production`, it intentionally rejects all `/api/v1` requests with `401 Unauthorized` (`Production authentication is not yet configured`).
  - **Impact**: Setting `NODE_ENV=production` without implementing JWT/session authentication (or placing an authenticated reverse proxy in front of the service) will block all API traffic; running with `NODE_ENV=development` on the public internet would allow header spoofing.
  - **Resolution Options for Step 13**:
    1. If Step 13 is a **local / private network / staging demo for Review 1**, keep `NODE_ENV=development` (or behind an authenticated tunnel/proxy) on a private network.
    2. If Step 13 is a **public internet deployment**, implement JWT/session verification in `tenantContext.ts` backed by `User` (`passwordHash`) and `InstitutionMembership` records.
- **P0-02: Missing `ai-service/.env` and Production Secrets (`GEMINI_API_KEY`, `INTERNAL_SERVICE_TOKEN`)**
  - **Issue**: `ai-service/.env` has not been created yet locally, and `GEMINI_API_KEY` is not configured.
  - **Impact**: Live Gemini question analysis and candidate question generation will return degraded/fallback responses (or `503 Service Unavailable` for generation) until `GEMINI_API_KEY` is provided.

### `P1` — Important for Production Reliability & Security Hardening
- **P1-01: Pre-cache Hugging Face `all-MiniLM-L6-v2` Model Weights in Production Container**
  - **Location**: `ai-service/app/services/embedding_service.py`
  - **Details**: First semantic duplicate check downloads `all-MiniLM-L6-v2` (~90MB) from Hugging Face if not cached. In Step 13 Dockerfile/deployment setup, pre-download the model during image build to prevent cold-start latency or network timeouts.
- **P1-02: Verify `GEMINI_MODEL` Identifier Against Google AI Studio Account**
  - **Location**: `ai-service/app/core/config.py` / `ai-service/.env.example`
  - **Details**: Default model is set to `gemini-3.8-flash`. When configuring `GEMINI_API_KEY`, verify whether your Google AI Studio key targets `gemini-2.5-flash` or `gemini-3.8-flash` and set `GEMINI_MODEL` accordingly in `ai-service/.env`.

### `P2` — Post-Review 1 Enhancements (Non-Blocking)
- **P2-01: Database-Level PostgreSQL Row-Level Security (RLS)**
  - **Location**: `database/README.md`, `backend/prisma/migrations/`
  - **Details**: Tenant isolation is enforced at the Prisma service layer (`PASS`). Adding PostgreSQL RLS policies (`app.current_institution_id`) provides defense-in-depth once real authentication middleware is active.
- **P2-02: Rate Limiting Middleware on Backend API**
  - **Location**: `backend/src/app.ts`
  - **Details**: Add `express-rate-limit` on `/api/v1/ai/*`, `/api/v1/question-generation/*`, and `/api/v1/papers/:id/generate-pdf` before exposing the backend to untrusted public traffic.

### `P3` — Minor Polish
- **P3-01: React Hook Exhaustive-Deps Warnings (10 warnings, 0 errors)**
  - **Location**: `frontend/src/pages/`
  - **Details**: Non-breaking ESLint warnings for `institutionId` in `useCallback` arrays; zero functional impact.

---

## 11. Step 13 Deployment Gate

| Deployment Target Type | Gate Status | Conditions to Proceed to Step 13 |
| :--- | :--- | :--- |
| **Private / Staging / Review 1 Demo Deployment** | **`READY WITH CONDITIONS`** | Create `ai-service/.env` with `INTERNAL_SERVICE_TOKEN` matching `backend/.env` `AI_SERVICE_TOKEN` and set `GEMINI_API_KEY`. Run behind a private network or authenticated proxy if using development header persona switching. |
| **Public Internet Production Deployment** | **`NOT READY`** | Must resolve **P0-01** (replace header-based dev auth in `backend/src/middleware/tenantContext.ts` with real JWT/session authentication) and **P0-02** (provision production PostgreSQL, rotated `AI_SERVICE_TOKEN`/`INTERNAL_SERVICE_TOKEN`, and `GEMINI_API_KEY`). |

---

## 12. Final User Action Checklist Before Step 13

1. **Create `ai-service/.env`**:
   - Copy `ai-service/.env.example` to `ai-service/.env`.
   - Set `INTERNAL_SERVICE_TOKEN` in `ai-service/.env` to match `AI_SERVICE_TOKEN` in `backend/.env` (for local dev, `dev_internal_service_token_min_32_chars_long_12345`; for production, generate a new 64-char hex secret).
2. **Add Your Gemini API Key**:
   - Paste your Google AI Studio API key into `GEMINI_API_KEY=` in `ai-service/.env`.
   - Confirm `GEMINI_MODEL=` in `ai-service/.env` matches your target Gemini model (e.g., `gemini-2.5-flash` or `gemini-3.8-flash`).
3. **(Optional) Run the Live Gemini Smoke Test**:
   - Once `GEMINI_API_KEY` is set in `ai-service/.env`, you can verify live Gemini connectivity by running:
     ```powershell
     cd ai-service
     $env:RUN_REAL_GEMINI_TESTS="1"
     .\.venv\Scripts\pytest.exe tests/test_real_provider.py -v
     ```
4. **Decide Your Step 13 Deployment Mode**:
   - Let me know in Step 13 whether we are targeting:
     - **(A)** Docker Compose / Private Staging / Review 1 Demo deployment (preserving the header-based Role/Persona switcher in the UI), or
     - **(B)** Public cloud deployment (where we should first wire JWT/session login or an access proxy so `NODE_ENV=production` is unlocked).

