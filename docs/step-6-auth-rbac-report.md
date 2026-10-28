# Step 6 — Real Authentication, Role-Based Access Control (RBAC) & Institution-Level Security Report

**Date:** 2026-10-28  
**Project:** AI-Powered Blockchain-Based Secure Examination Infrastructure for Intelligent Question Paper Generation and Distribution  
**Phase:** Step 6 — Real Authentication, RBAC & Institution-Level Security

---

## 1. Executive Summary

Step 6 replaces the legacy development-only header persona simulation (`x-institution-id`, `x-user-id`, `x-user-role`) with real server-side authentication, cryptographically signed and server-side revocable `HttpOnly` session cookies (`pds_session`), a centralized Role-Based Access Control (RBAC) permission matrix, and strict PostgreSQL-verified `InstitutionMembership` tenant resolution across the full stack.

Every academic, AI generation, examination configuration, paper construction, approval workflow, PDF rendering, and membership administration route now enforces verified user identity, active institution membership, and explicit role permissions on the backend while preserving all Step 5 independent review, status-gate, and SHA-256 PDF integrity guarantees.

---

## 2. Previous Authentication / Authorization Gaps Found

During the Step 6 security audit of the pre-existing codebase, the following gaps were identified and resolved:

1. **Client-Trusted Header Simulation**:
   - [`tenantContext.ts`](file:///c:/paper-distribution-system/backend/src/middleware/tenantContext.ts) previously trusted client-supplied `x-institution-id`, `x-user-id`, and `x-user-role` headers in non-production environments and returned a static `501 Authentication is not yet implemented` in production.
2. **Lack of Authentication Endpoints & Password Verification**:
   - Although the Prisma `User` model included an optional `hashedPassword` column and `InstitutionMembership` linked users to institutions with a `UserRole` enum, there were no `/api/v1/auth/*` endpoints, no `bcrypt` password hashing/verification utilities, and no login rate-limiting.
3. **Missing `EXAM_CONTROLLER` Role**:
   - The `UserRole` enum in [`schema.prisma`](file:///c:/paper-distribution-system/backend/prisma/schema.prisma) included `SUPER_ADMIN`, `INSTITUTION_ADMIN`, `EXAMINER`, `MODERATOR`, and `VIEWER`, but lacked a dedicated `EXAM_CONTROLLER` role for examination branch governance.
4. **Incomplete Route-Level RBAC Enforcement**:
   - Mutation routes in `subjects.ts`, `questions.ts`, `analyses.ts`, `generation.ts`, and `papers.ts` relied only on `tenantContextMiddleware` without checking role-level permissions (`subjects:manage`, `questions:write`, `ai:generate`, `ai:promote`, `exams:manage`, `papers:prepare`, `papers:submit`).
5. **Frontend Persona Spoofing (`DevBar` & `localStorage`)**:
   - [`api.ts`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts) injected `pds_dev_user_id` and `pds_dev_user_role` from `localStorage` into request headers, [`Header.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/Header.tsx) displayed a static `"Not signed in"` badge, and [`DevBar.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/DevBar.tsx) allowed arbitrary toggling between simulated submitter/reviewer identities without authentication.

---

## 3. Authentication Architecture Implemented

1. **Password Security (`bcryptjs`)**:
   - Implemented [`hashPassword`](file:///c:/paper-distribution-system/backend/src/services/authService.ts#L72-L74) and [`verifyPassword`](file:///c:/paper-distribution-system/backend/src/services/authService.ts#L79-L89) in [`authService.ts`](file:///c:/paper-distribution-system/backend/src/services/authService.ts) using `bcryptjs` with 10 salt rounds.
   - When an email does not exist or has no password hash, `verifyPassword` compares against a precomputed dummy bcrypt hash so credential verification takes comparable time and prevents timing-based account enumeration.
   - `hashedPassword` is strictly excluded from all Prisma projections and API responses.
2. **Cryptographically Signed & Server-Side Revocable Sessions**:
   - [`createSessionToken`](file:///c:/paper-distribution-system/backend/src/services/authService.ts#L95-L120) issues a compact `v1.<payloadBase64Url>.<hmacSha256Signature>` token bound to a unique session ID (`sid`), user ID (`uid`), active institution ID (`iid`), CSRF token (`csrf`), issued-at (`iat`), and expiration (`exp`) governed by `SESSION_TTL_HOURS`.
   - [`verifySessionToken`](file:///c:/paper-distribution-system/backend/src/services/authService.ts#L126-L179) validates the HMAC-SHA256 signature using `crypto.timingSafeEqual`, checks token expiration, and checks the server-side `revokedSessions` registry.
   - [`POST /api/v1/auth/login`](file:///c:/paper-distribution-system/backend/src/routes/auth.ts#L31-L65) sets the `pds_session` cookie with `HttpOnly; SameSite=Lax; Path=/` (and `Secure` in production).
   - [`POST /api/v1/auth/logout`](file:///c:/paper-distribution-system/backend/src/routes/auth.ts#L71-L97) revokes the active session token server-side via [`revokeSessionToken`](file:///c:/paper-distribution-system/backend/src/services/authService.ts#L184-L189) and clears the `pds_session` cookie immediately.
   - [`GET /api/v1/auth/me`](file:///c:/paper-distribution-system/backend/src/routes/auth.ts#L103-L125) resolves the current user, active membership, all active memberships, and granted permissions from PostgreSQL.
   - [`POST /api/v1/auth/switch-institution`](file:///c:/paper-distribution-system/backend/src/routes/auth.ts#L131-L162) verifies that the authenticated user holds an `ACTIVE` membership in the target institution before rotating the session cookie.
3. **Brute-Force / Rate-Limit Protection**:
   - [`checkLoginRateLimit`](file:///c:/paper-distribution-system/backend/src/services/authService.ts#L282-L299) and [`recordFailedLoginAttempt`](file:///c:/paper-distribution-system/backend/src/services/authService.ts#L301-L321) track failed attempts per account and IP+account over a 15-minute window and return `429 Too Many Requests` after 8 consecutive failures.

---

## 4. Role & Permission Matrix

Centralized in [`backend/src/services/permissionPolicy.ts`](file:///c:/paper-distribution-system/backend/src/services/permissionPolicy.ts):

| Permission | `INSTITUTION_ADMIN` | `EXAM_CONTROLLER` | `EXAMINER` (Faculty) | `MODERATOR` (Reviewer) | `VIEWER` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `dashboard:view` | Yes | Yes | Yes | Yes | Yes |
| `subjects:view` | Yes | Yes | Yes | Yes | Yes |
| `subjects:manage` | Yes | Yes | No | No | No |
| `questions:view` | Yes | Yes | Yes | Yes | Yes |
| `questions:write` | Yes | Yes | Yes | No | No |
| `ai:view` | Yes | Yes | Yes | Yes | No |
| `ai:generate` | Yes | Yes | Yes | No | No |
| `ai:promote` | Yes | Yes | Yes | No | No |
| `exams:view` | Yes | Yes | Yes | Yes | Yes |
| `exams:manage` | Yes | Yes | No | No | No |
| `papers:view` | Yes | Yes | Yes | Yes | Yes |
| `papers:prepare` | Yes | Yes | Yes | No | No |
| `papers:submit` | Yes | Yes | Yes | No | No |
| `submissions:view` | Yes | Yes | Yes | Yes | Yes |
| `submissions:decide` | Yes | Yes | No | Yes | No |
| `pdf:generate` | Yes | Yes | No | Yes | No |
| `pdf:download` | Yes | Yes | Yes | Yes | No |
| `memberships:manage` | Yes | No | No | No | No |

*(Platform `SUPER_ADMIN` holds all permissions within verified memberships.)*

---

## 5. Database / Prisma Schema & Seed Changes

1. **Additive Enum Migration**:
   - Added `EXAM_CONTROLLER` to `enum UserRole` in [`backend/prisma/schema.prisma`](file:///c:/paper-distribution-system/backend/prisma/schema.prisma#L18-L25).
   - Created and applied migration [`backend/prisma/migrations/20261028090000_step6_exam_controller_role/migration.sql`](file:///c:/paper-distribution-system/backend/prisma/migrations/20261028090000_step6_exam_controller_role/migration.sql) (`ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'EXAM_CONTROLLER'`).
2. **Idempotent Demo Account Seeding**:
   - Updated [`backend/prisma/seed.ts`](file:///c:/paper-distribution-system/backend/prisma/seed.ts) to seed five institutional personas in Chaitanya Bharathi Institute of Technology (`a0000000-0000-4000-8000-000000000001`) with bcrypt-hashed passwords (`SEED_DEMO_PASSWORD` environment override supported):
     - `admin@cbit.ac.in` — `INSTITUTION_ADMIN`
     - `coe@cbit.ac.in` — `EXAM_CONTROLLER`
     - `examiner@cbit.ac.in` — `EXAMINER`
     - `moderator@cbit.ac.in` — `MODERATOR`
     - `viewer@cbit.ac.in` — `VIEWER`

---

## 6. Backend Route Protection Summary

All domain routers mounted under `/api/v1` enforce [`tenantContextMiddleware`](file:///c:/paper-distribution-system/backend/src/middleware/tenantContext.ts#L59-L166) and route-level [`requirePermission(...)`](file:///c:/paper-distribution-system/backend/src/middleware/tenantContext.ts#L179-L198):

- [`dashboard.ts`](file:///c:/paper-distribution-system/backend/src/routes/dashboard.ts): `GET /dashboard` → `dashboard:view`
- [`subjects.ts`](file:///c:/paper-distribution-system/backend/src/routes/subjects.ts): `GET` → `subjects:view`; `POST / PATCH / DELETE` subjects & topics → `subjects:manage`
- [`questions.ts`](file:///c:/paper-distribution-system/backend/src/routes/questions.ts): `GET` → `questions:view`; `POST / PATCH` questions & status transitions → `questions:write`
- [`analyses.ts`](file:///c:/paper-distribution-system/backend/src/routes/analyses.ts): `GET` → `questions:view`; `POST` single/batch analysis → `questions:write`
- [`generation.ts`](file:///c:/paper-distribution-system/backend/src/routes/generation.ts): `GET` → `ai:view`; `POST /generation-jobs` → `ai:generate`; `PATCH / review` & `POST / promote` → `ai:promote`
- [`papers.ts`](file:///c:/paper-distribution-system/backend/src/routes/papers.ts):
  - `GET /exam-configs` → `exams:view`; `POST / PATCH /exam-configs` → `exams:manage`
  - `GET /exam-papers*` → `papers:view`; `POST / PATCH / DELETE /exam-papers*` & `/versions` → `papers:prepare`
- [`approvals.ts`](file:///c:/paper-distribution-system/backend/src/routes/approvals.ts):
  - `POST /exam-papers/:id/submit` → `papers:submit`
  - `GET /exam-papers/:id/submissions`, `GET /paper-submissions*` → `submissions:view`
  - `POST /paper-submissions/:id/decision` → `submissions:decide` + strict self-approval prohibition (`submission.submittedBy !== reviewerId`)
  - `POST /exam-papers/:id/pdf/generate` → `pdf:generate` + `APPROVED` status gate
  - `GET /exam-papers/:id/pdf`, `/pdf/download`, `/pdf/preview` → `pdf:download` + `APPROVED` status gate + SHA-256 `verifyFileIntegrity`
- [`institutions.ts`](file:///c:/paper-distribution-system/backend/src/routes/institutions.ts):
  - `GET / POST / PATCH /institutions/memberships*` → `memberships:manage`

---

## 7. Institution Isolation & Cross-Tenant Protections

1. **Server-Resolved Institution Context**:
   - [`resolveAuthenticatedSession`](file:///c:/paper-distribution-system/backend/src/services/authService.ts#L473-L570) looks up the user and their `ACTIVE` `InstitutionMembership` rows directly in PostgreSQL on every request.
2. **Header Spoofing Elimination**:
   - Authenticated sessions completely ignore client-supplied `x-user-id` and `x-user-role` headers.
   - If a client supplies an `x-institution-id` header for an institution where the authenticated user does not hold an `ACTIVE` membership, `resolveAuthenticatedSession` immediately rejects the request with `403 Forbidden: You do not have an active membership in the requested institution`.
3. **Tenant-Scoped Resource Queries**:
   - Every service query (`subjects`, `questions`, `generationJobs`, `examConfigurations`, `examPapers`, `paperSubmissions`, `memberships`) filters by the server-resolved `tenant.institutionId`. Cross-tenant resource IDs return `404` or `403`.

---

## 8. Paper Approval & PDF Security Rules Preserved

All Step 5 security invariants were preserved and reinforced with real authenticated user IDs:

1. **Self-Approval Prohibition**:
   - In [`paperApprovalService.ts`](file:///c:/paper-distribution-system/backend/src/services/paperApprovalService.ts#L316-L329), `reviewSubmission` checks `if (submission.submittedBy === reviewerId)` first and throws `403 Self-approval prohibited: The user who submitted the paper cannot review or approve it`, followed by verifying `hasPermission(reviewerRole, "submissions:decide")`.
2. **Approval Status Gate for PDF Generation & Download**:
   - Unapproved (`DRAFT`, `SUBMITTED`, `REJECTED`) papers cannot generate or download official PDFs (`409 Conflict`).
3. **SHA-256 Checksum Integrity Verification**:
   - Both `getPaperPdfMetadata` and `getPaperPdfDownloadStream` recompute the SHA-256 digest of the on-disk PDF artifact via `verifyFileIntegrity` and throw `500 Integrity check failed` if the file was modified or corrupted.

---

## 9. Frontend Authentication & Route Guard Changes

- Created [`frontend/src/types/auth.ts`](file:///c:/paper-distribution-system/frontend/src/types/auth.ts) with strongly typed `SystemRole`, `Permission`, `AuthSessionResponse`, and `ROLE_DISPLAY_LABELS`.
- Updated [`frontend/src/lib/api.ts`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts) to send `credentials: 'include'` on all API and PDF blob requests, removed `pds_dev_user_id`/`pds_dev_user_role` header injection, and added auth & membership client functions.
- Created [`frontend/src/context/AuthContext.tsx`](file:///c:/paper-distribution-system/frontend/src/context/AuthContext.tsx) providing session state restoration (`GET /api/v1/auth/me`), `login`, `logout`, `switchInstitution`, `hasPermission`, and automatic synchronization with `InstitutionContext`.
- Created [`frontend/src/pages/LoginPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/LoginPage.tsx) with email/password validation, error alerts, post-login redirect to intended route, and a development-mode quick-fill helper for seeded accounts.
- Created [`frontend/src/components/auth/ProtectedRoute.tsx`](file:///c:/paper-distribution-system/frontend/src/components/auth/ProtectedRoute.tsx) and [`frontend/src/pages/UnauthorizedPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/UnauthorizedPage.tsx) (`403 Access Denied`).
- Created [`frontend/src/pages/UsersMembershipsPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/UsersMembershipsPage.tsx) (`/users`, guarded by `memberships:manage`) for `INSTITUTION_ADMIN` user provisioning and role management.
- Updated [`Header.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/Header.tsx), [`SidebarNav.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/SidebarNav.tsx), [`navigation.ts`](file:///c:/paper-distribution-system/frontend/src/config/navigation.ts), [`DevBar.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/DevBar.tsx), [`SubmissionReviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/SubmissionReviewPage.tsx), [`App.tsx`](file:///c:/paper-distribution-system/frontend/src/App.tsx), and [`router.tsx`](file:///c:/paper-distribution-system/frontend/src/app/router.tsx).

---

## 10. Files Created or Modified

### Created
- [`backend/prisma/migrations/20261028090000_step6_exam_controller_role/migration.sql`](file:///c:/paper-distribution-system/backend/prisma/migrations/20261028090000_step6_exam_controller_role/migration.sql)
- [`backend/src/services/permissionPolicy.ts`](file:///c:/paper-distribution-system/backend/src/services/permissionPolicy.ts)
- [`backend/src/services/authService.ts`](file:///c:/paper-distribution-system/backend/src/services/authService.ts)
- [`backend/src/routes/auth.ts`](file:///c:/paper-distribution-system/backend/src/routes/auth.ts)
- [`backend/src/routes/institutions.ts`](file:///c:/paper-distribution-system/backend/src/routes/institutions.ts)
- [`backend/src/__tests__/authRbacAndIsolation.test.ts`](file:///c:/paper-distribution-system/backend/src/__tests__/authRbacAndIsolation.test.ts)
- [`frontend/src/types/auth.ts`](file:///c:/paper-distribution-system/frontend/src/types/auth.ts)
- [`frontend/src/context/AuthContext.tsx`](file:///c:/paper-distribution-system/frontend/src/context/AuthContext.tsx)
- [`frontend/src/components/auth/ProtectedRoute.tsx`](file:///c:/paper-distribution-system/frontend/src/components/auth/ProtectedRoute.tsx)
- [`frontend/src/pages/LoginPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/LoginPage.tsx)
- [`frontend/src/pages/UnauthorizedPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/UnauthorizedPage.tsx)
- [`frontend/src/pages/UsersMembershipsPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/UsersMembershipsPage.tsx)
- [`docs/step-6-auth-rbac-report.md`](file:///c:/paper-distribution-system/docs/step-6-auth-rbac-report.md)

### Modified
- [`backend/prisma/schema.prisma`](file:///c:/paper-distribution-system/backend/prisma/schema.prisma)
- [`backend/prisma/seed.ts`](file:///c:/paper-distribution-system/backend/prisma/seed.ts)
- [`backend/src/config/env.ts`](file:///c:/paper-distribution-system/backend/src/config/env.ts)
- [`backend/.env.example`](file:///c:/paper-distribution-system/backend/.env.example)
- [`backend/src/middleware/tenantContext.ts`](file:///c:/paper-distribution-system/backend/src/middleware/tenantContext.ts)
- [`backend/src/app.ts`](file:///c:/paper-distribution-system/backend/src/app.ts)
- [`backend/src/routes/index.ts`](file:///c:/paper-distribution-system/backend/src/routes/index.ts)
- [`backend/src/routes/dashboard.ts`](file:///c:/paper-distribution-system/backend/src/routes/dashboard.ts)
- [`backend/src/routes/subjects.ts`](file:///c:/paper-distribution-system/backend/src/routes/subjects.ts)
- [`backend/src/routes/questions.ts`](file:///c:/paper-distribution-system/backend/src/routes/questions.ts)
- [`backend/src/routes/analyses.ts`](file:///c:/paper-distribution-system/backend/src/routes/analyses.ts)
- [`backend/src/routes/generation.ts`](file:///c:/paper-distribution-system/backend/src/routes/generation.ts)
- [`backend/src/routes/papers.ts`](file:///c:/paper-distribution-system/backend/src/routes/papers.ts)
- [`backend/src/routes/approvals.ts`](file:///c:/paper-distribution-system/backend/src/routes/approvals.ts)
- [`backend/src/services/paperApprovalService.ts`](file:///c:/paper-distribution-system/backend/src/services/paperApprovalService.ts)
- [`backend/src/__tests__/step11IntegrationAndSecurity.test.ts`](file:///c:/paper-distribution-system/backend/src/__tests__/step11IntegrationAndSecurity.test.ts)
- [`frontend/src/lib/api.ts`](file:///c:/paper-distribution-system/frontend/src/lib/api.ts)
- [`frontend/src/config/navigation.ts`](file:///c:/paper-distribution-system/frontend/src/config/navigation.ts)
- [`frontend/src/components/layout/SidebarNav.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/SidebarNav.tsx)
- [`frontend/src/components/layout/Header.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/Header.tsx)
- [`frontend/src/components/layout/DevBar.tsx`](file:///c:/paper-distribution-system/frontend/src/components/layout/DevBar.tsx)
- [`frontend/src/pages/SubmissionReviewPage.tsx`](file:///c:/paper-distribution-system/frontend/src/pages/SubmissionReviewPage.tsx)
- [`frontend/src/App.tsx`](file:///c:/paper-distribution-system/frontend/src/App.tsx)
- [`frontend/src/app/router.tsx`](file:///c:/paper-distribution-system/frontend/src/app/router.tsx)

---

## 11. Verification & Test Results

| Verification Check | Command | Result |
| :--- | :--- | :--- |
| Database Migration & Seed | `cd backend; npm run db:seed` | **PASS** (5 institutional roles seeded idempotently) |
| Backend Full Test Suite | `cd backend; npx vitest run --fileParallelism=false` | **PASS** (`13/13` test files, `181/181` tests passed) |
| Step 6 Auth, RBAC & Isolation Tests | `cd backend; npx vitest run src/__tests__/authRbacAndIsolation.test.ts` | **PASS** (`17/17` tests passed: login, invalid credentials, inactive user, `GET /auth/me`, logout session revocation, brute-force `429`, role permissions across all 5 personas, self-approval block, header spoofing rejection, cross-tenant isolation) |
| Backend TypeScript Check & Build | `cd backend; npm run typecheck; npm run build` | **PASS** (`0` errors) |
| Frontend ESLint Check | `cd frontend; npm run lint` | **PASS** (`0` errors) |
| Frontend Production Build | `cd frontend; npm run build` | **PASS** (`tsc -b && vite build` succeeded in 1.23s) |

---

## 12. Remaining Recommendations for Step 7

1. **Source Document Ingestion & RAG Pipeline**:
   - Implement the `/source-documents` module to allow `EXAMINER` and `EXAM_CONTROLLER` roles to upload syllabus PDFs and reference textbooks for grounded AI question synthesis.
2. **Institution Settings & Audit Log Viewer**:
   - Expose an administrative audit log viewer for `INSTITUTION_ADMIN` to inspect `auth.login`, `membership.provisioned`, `paper.submitted`, `submission.reviewed`, and `pdf.generated` events stored in `AuditLog`.
3. **Future Blockchain Anchoring Phase**:
   - In a subsequent dedicated step, anchor approved paper version snapshots and PDF SHA-256 digests to an immutable ledger for tamper-evident post-approval distribution verification.

