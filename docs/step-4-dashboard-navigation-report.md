# Step 4 — Live Overview Dashboard, Institutional Metrics & Navigation Polish Report

**Date:** 2026-10-28  
**Project:** Paper Distribution System  
**Scope:** Live institutional dashboard (`OverviewPage.tsx`), tenant-scoped summary endpoint (`GET /api/v1/dashboard`), active institution display in header/context, and nested-route active state polish in `SidebarNav.tsx`.

---

## 1. Dashboard Sections Implemented

Replaced the static placeholder dashboard in [`frontend/src/pages/OverviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/OverviewPage.tsx) with a live, institution-scoped operational dashboard structured into four main sections:

1. **Welcome & Page Header (`<PageHeader />` + Active Tenant Banner)**:
   - Uses the shared [`PageHeader`](file:///c:/paper-distribution-system/frontend/src/components/ui/Card.tsx#L32-L64) component from Step 2 (`max-w-[1440px]` page container, single `h1`, eyebrow showing the active institution name when loaded, status badge, concise description, and header action buttons for **Refresh** and **Generate Questions**).
   - Displays an active-institution status bar showing the tenant's full name (`Institution.name`), slug (`Institution.slug`), and a highlighted action pill linking directly to `/approvals` whenever submissions are awaiting review (`submissions.pending > 0`).
   - Removed all outdated placeholder copy (`"Nothing to show yet"`, `"Planned workflow"`, and `"Sign-in has not been implemented"`).

2. **Summary Metric Cards (6 Responsive Cards)**:
   - Displays live, institution-wide totals and status breakdowns across a responsive grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`):
     1. **Active Subjects** — Primary figure: `subjects.active`; breakdown footer: total subjects and archived count; action link to `/subjects`.
     2. **Active Questions** — Primary figure: `questions.active`; breakdown footer: draft, retired, and total question counts; action link to `/questions`.
     3. **AI Generation Batches** — Primary figure: `generationJobs.total` with an accent badge when candidate questions are awaiting review (`pendingCandidateReviews > 0`); breakdown footer: completed, failed, and running batch counts; action link to `/questions/generate`.
     4. **Examinations Configured** — Primary figure: `examinations.active`; breakdown footer: total and inactive examination configurations; action link to `/examinations`.
     5. **Examination Papers** — Primary figure: `papers.total`; breakdown footer: `draft`, `submitted`, `approved`, and `rejected` counts; action link to `/papers`.
     6. **Pending Approvals** — Primary figure: `submissions.pending` with a `Needs Review` warning badge when `pending > 0`; breakdown footer: `approved` and returned (`changesRequested + rejected`) out of `total` submissions; action link to `/approvals`.

3. **Quick Actions (Featured Primary Cards + Secondary Shortcuts)**:
   - **Primary Featured Cards (7-column span on `lg`)**:
     - **Generate Questions with AI** (`/questions/generate`) — Highlights syllabus-aligned AI batch generation and candidate promotion.
     - **Prepare Examination Paper** (`/papers`) — Highlights blueprint-validated paper assembly and submission for review.
   - **Secondary Workflow Shortcuts (5-column 2×2 grid on `lg`)**:
     - **Approval Queue** (`/approvals`)
     - **Question Bank** (`/questions`)
     - **Examinations** (`/examinations`)
     - **Subjects & Syllabus** (`/subjects`)

4. **Recent Work & Activity (3 Independently Loaded Cards)**:
   - **Recent Examination Papers**: Lists the 5 most recent papers (`title`, examination/subject metadata, total marks, duration, creation date, and status badge) with direct links to `/papers/:paperId/preview` (for submitted/approved papers) or `/papers/:paperId` (for drafts/rejected papers).
   - **Submissions Awaiting Review**: Lists up to 5 `PENDING` approval submissions (`paper.title`, examination/subject name, version number, submission date, and submitter notes preview) linking directly to `/approvals/:submissionId`.
   - **Recent AI Generation Batches**: Lists the 5 most recent AI generation jobs (`subject.code`, `topic.title`, requested question type/difficulty/count, creation date, and job status badge) linking directly to `/questions/generated/:jobId` for completed batches or `/questions/generate` otherwise.

---

## 2. Metric Definitions & Data Sources

All summary metrics on the dashboard represent **true institution-wide database aggregates** scoped by `institutionId`, never lengths of paginated frontend arrays:

| Metric Card | Primary Value | Secondary Breakdown | Prisma Query Source (`dashboardService.ts`) |
| :--- | :--- | :--- | :--- |
| **Institution Metadata** | `institution.name` | `slug`, `status` | `db.institution.findUnique({ where: { id: institutionId }, select: { id, name, slug, status } })` |
| **Active Subjects** | `subjects.active` (`status = 'ACTIVE'`) | `total`, `archived` (`status = 'ARCHIVED'`) | `db.subject.groupBy({ by: ['status'], where: { institutionId }, _count: { _all: true } })` |
| **Active Questions** | `questions.active` (`lifecycle = 'ACTIVE'`) | `draft` (`DRAFT`), `retired` (`RETIRED`), `total` | `db.question.groupBy({ by: ['lifecycle'], where: { institutionId }, _count: { _all: true } })` |
| **AI Generation Batches** | `generationJobs.total` | `completed`, `running`, `pending`, `failed`, plus `pendingCandidateReviews` | `db.questionGenerationJob.groupBy({ by: ['status'], where: { institutionId }, _count: { _all: true } })` + `db.generatedQuestion.count({ where: { job: { institutionId }, status: 'PENDING' } })` |
| **Examinations Configured** | `examinations.active` (`isActive = true`) | `total`, `inactive` (`isActive = false`) | `db.examConfiguration.groupBy({ by: ['isActive'], where: { institutionId }, _count: { _all: true } })` |
| **Examination Papers** | `papers.total` | `draft`, `submitted`, `approved`, `rejected` | `db.examPaper.groupBy({ by: ['status'], where: { institutionId }, _count: { _all: true } })` |
| **Pending Approvals** | `submissions.pending` (`status = 'PENDING'`) | `approved`, `changesRequested`, `rejected`, `total` | `db.paperSubmission.groupBy({ by: ['status'], where: { institutionId }, _count: { _all: true } })` |

**Security & Privacy Guarantee**: [`getDashboardSummary`](file:///c:/paper-distribution-system/backend/src/services/dashboardService.ts#L60-L157) executes only metadata `findUnique`, `groupBy`, and `count` queries. It never selects or returns `Question.prompt`, `suggestedAnswer`, `explanation`, or `QuestionOption` records.

---

## 3. Existing Endpoints Reused vs. Summary Endpoint Added

### Added Endpoint
- **`GET /api/v1/dashboard`** ([`backend/src/routes/dashboard.ts`](file:///c:/paper-distribution-system/backend/src/routes/dashboard.ts), registered in [`backend/src/routes/index.ts`](file:///c:/paper-distribution-system/backend/src/routes/index.ts)):
  - Protected by `tenantContextMiddleware` (`getTenant(res)`).
  - Uses strict Zod query validation (`z.object({}).strict()`) so unexpected query parameters return a structured `400 Bad Request` (`Request validation failed`).
  - Why added: Existing list endpoints (`/subjects`, `/questions`, `/generation-jobs`, `/exam-configs`, `/exam-papers`, `/paper-submissions`) are paginated and only filter by one status at a time, which would have required 15+ separate HTTP requests to compute full status breakdowns and still would not have returned the active `Institution` name/slug.

### Reused Endpoints (for Recent Activity Lists)
- **`GET /api/v1/exam-papers?page=1&pageSize=5`** via existing [`fetchExamPapers`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts#L502-L515)
- **`GET /api/v1/paper-submissions?status=PENDING&page=1&pageSize=5`** via existing [`listSubmissions`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts#L648-L660)
- **`GET /api/v1/generation-jobs?page=1&pageSize=5`** via existing [`fetchGenerationJobs`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts#L343-L355)

---

## 4. Files Changed

### Backend
- [`backend/src/services/dashboardService.ts`](file:///c:/paper-distribution-system/backend/src/services/dashboardService.ts) *(new)* — Parallel Prisma `groupBy`/`count` aggregation service for institution-scoped dashboard metrics.
- [`backend/src/routes/dashboard.ts`](file:///c:/paper-distribution-system/backend/src/routes/dashboard.ts) *(new)* — Express route handler for `GET /api/v1/dashboard`.
- [`backend/src/routes/index.ts`](file:///c:/paper-distribution-system/backend/src/routes/index.ts) — Mounted `dashboardRouter` at `/api/v1/dashboard`.
- [`backend/src/__tests__/dashboard.test.ts`](file:///c:/paper-distribution-system/backend/src/__tests__/dashboard.test.ts) *(new)* — Unit test suite covering `401` missing/invalid tenant header, empty-institution zero counts, multi-status aggregation accuracy across all 6 modules, and `400` strict query validation.

### Frontend
- [`frontend/src/lib/api.ts`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts) — Added `DashboardSummary` type definitions and `fetchDashboardSummary()`.
- [`frontend/src/context/InstitutionContext.tsx`](file:///c:/paper-distribution-system/frontend/src/context/InstitutionContext.tsx) — Added `institutionName` state and `setInstitutionName` updater (automatically clearing `institutionName` when `institutionId` changes).
- [`frontend/src/components/layout/Header.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/Header.tsx) — Updated the header tenant pill to display the active `institutionName` when available (with full name + UUID tooltip) and fall back to the short UUID.
- [`frontend/src/components/layout/SidebarNav.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/SidebarNav.tsx) — Fixed `<NavLink>` active-state matching via `isNavItemActive(itemPath, currentPathname)` so:
  - `/` (`Overview`) matches only `/`.
  - `/questions` (`Question Bank`) remains active on `/questions`, `/questions/new`, and `/questions/:questionId/*`, but does **not** highlight on `/questions/generate` or `/questions/generated/:jobId`.
  - `/questions/generate` (`AI Generator`) remains active on both `/questions/generate` and `/questions/generated/:jobId`.
  - `/subjects`, `/examinations`, `/papers`, and `/approvals` remain active across their nested detail, builder, and preview routes.
  - Deferred items (`Source Documents`, `Users & Memberships`, `Settings`) retain their non-clickable `Soon` badge and `aria-disabled="true"` presentation.
- [`frontend/src/pages/OverviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/OverviewPage.tsx) — Replaced static placeholder page with the live institutional dashboard.

---

## 5. Loading, Error, Empty-State & Responsive Behavior

- **Independent Data Loading**: Summary metrics (`loadSummary`) and each of the three recent-work lists (`loadRecentPapers`, `loadPendingSubmissions`, `loadRecentBatches`) have independent state slices and error handlers. A failure in one recent list never blocks or hides the summary metric cards or the other recent-work sections.
- **Loading States**: Skeleton placeholders (`<Skeleton />`) preserve card geometry while data is being fetched.
- **Recoverable Error States**: Each section renders `<ErrorMessage />` with a section-specific **Retry** button on failure, and the page header provides a global **Refresh** button that refreshes all four data sources in parallel.
- **Actionable Empty States**: When an institution has zero papers, zero pending approvals, or zero AI generation batches, the corresponding card renders `<EmptyState />` with a direct CTA button (**Go to Paper Preparation**, **View Approval History**, or **Generate Questions**).
- **Responsive Layout**:
  - Summary metric cards: `1` column on mobile, `2` columns on `sm` (`>=640px`), `3` columns on `xl` (`>=1280px`).
  - Quick actions: stacked on mobile/tablet; `7 + 5` 12-column split on `lg` (`>=1024px`).
  - Recent work cards: `1` column on mobile/tablet; `3` equal columns on `xl` (`>=1280px`) with `truncate` / `line-clamp-1` text guards so long titles or UUIDs never cause horizontal overflow.

---

## 6. Verification Commands & Results

1. **Backend Dashboard Unit Tests, Typecheck & Build**:
   ```powershell
   cd backend; npx vitest run src/__tests__/dashboard.test.ts; npm run typecheck; npm run build
   ```
   - **Result**: `1 passed (4 tests)` in `src/__tests__/dashboard.test.ts`; `tsc -p tsconfig.json --noEmit` and `tsc -p tsconfig.json` exited with code `0`.

2. **Live Backend API Verification (`GET /api/v1/dashboard`)**:
   ```powershell
   Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/v1/dashboard" -Headers @{ "x-institution-id" = "a0000000-0000-4000-8000-000000000001" }
   ```
   - **Result**: Returned `200 OK` with live PostgreSQL counts for `CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY (Autonomous)` (`2` active subjects, `15` questions, `4` AI generation jobs with `7` pending candidate reviews, `1` active examination, `3` examination papers, and `2` approved submissions).

3. **Frontend Lint & Production Build**:
   ```powershell
   cd frontend; npm run lint; npm run build
   ```
   - **Result**: ESLint passed with `0 errors` (`8` pre-existing warnings in unrelated files); `tsc -b && vite build` succeeded with `0` TypeScript or bundler errors.

---

## 7. Browser Verification Disclosure

- Automated verification was performed via Vitest unit tests, TypeScript compiler checks (`tsc --noEmit` and `tsc -b`), Vite production build (`vite build`), and live HTTP inspection against `http://127.0.0.1:4000/api/v1/dashboard`.
- Interactive headless-browser click-through testing was not executed in this environment; the frontend dev server (`http://localhost:5173`) and backend dev server (`http://127.0.0.1:4000`) are running with hot reload for immediate visual inspection.

---

## 8. Remaining Dashboard or Navigation Limitations

- **Dev-Mode Institution Switching**: When a user switches the active `institutionId` in the development bar (`DevBar`), `OverviewPage` automatically refetches `/api/v1/dashboard` and updates `institutionName` in `InstitutionContext`. If a user loads the app directly on a non-dashboard route without visiting `/`, the header falls back to displaying the short UUID until `/api/v1/dashboard` is fetched.
- **Deferred Navigation Items**: `Source Documents`, `Users & Memberships`, and `Settings` remain intentionally disabled (`Soon`) in the sidebar as those modules are outside the scope of Step 4.

