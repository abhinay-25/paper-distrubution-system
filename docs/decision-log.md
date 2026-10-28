# Decision Log

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Monorepo with independent service folders; no workspaces/Turborepo/Nx | Minimal; avoids conflicting lockfiles |
| D2 | Frontend: React 19, TypeScript 6, Vite 8 (create-vite `react-ts`, ESLint) | Agreed baseline; Vite 8 supports Node 22.12+ |
| D3 | Backend: Express 5, Zod 4, TypeScript 6, ESM (`NodeNext`), `tsx` dev runner | No global installs; `tsx watch` for dev, `tsc` for build |
| D4 | Backend config validated by Zod at startup (`src/config/env.ts`) | Fail fast on bad configuration |
| D5 | AI service: FastAPI + Pydantic 2 + pydantic-settings, venv in `ai-service/.venv` | Agreed baseline; venv is Git-ignored |
| D6 | Health endpoints: `GET /api/health` (backend), `GET /health` (AI) | Testable without DB or external APIs |
| D7 | Frontend never accesses the DB; AI service has no unrestricted DB access | Backend is the authorization boundary |
| D8 | Vite template demo UI removed | No placeholder UI presented as product |
| D9 | No Docker Compose in Step 1 | Nothing needs containers yet |
| D10 | Prisma not installed in Step 1 | Schema/migrations are Step 3 |
| D11 | Tailwind CSS 4 with CSS-first tokens in `index.css` (no `tailwind.config`) | Matches Tailwind 4 + Vite 8; one place for tokens |
| D12 | React Router 7 (`createBrowserRouter`), lucide-react icons, self-hosted Inter | Lightweight, established; no third-party font requests |
| D13 | Planned nav items are non-link entries marked "Soon"; header shows "Not signed in" only | Never imply unbuilt features or fake identity |
| D14 | Light, warm off-white UI with limited frosted translucency (header/drawer) | Requested premium look; fallbacks for reduced transparency |
| D15 | Internal service auth via HMAC constant-time Bearer token (min. 32 chars) | Protects internal AI endpoints without coupling to user identity |
| D16 | Official google-genai SDK (gemini-3.8-flash) with Pydantic structured outputs | Stable model, schema-validated responses, service-controlled retries with jitter |
| D17 | Question Intelligence subsystem boundary | Node.js backend remains the authoritative store & security boundary; Python AI service handles inference with bounded inputs |
| D18 | Bloom's Revised Taxonomy for classification | 6 standard cognitive levels (Remember, Understand, Apply, Analyze, Evaluate, Create) + Undetermined fallback |
| D19 | Non-destructive difficulty estimation | Faculty-assigned difficulty (QuestionRevision.difficulty) is never overwritten. AI estimates are advisory suggestions |
| D20 | Local sentence-transformers embedding model (`all-MiniLM-L6-v2`) | Lightweight (22 MB, 384 dimensions), runs on CPU, no external API calls, no vector DB required for early bank scale |
| D21 | Provisional cosine similarity thresholds (0.90 near, 0.75 potential) | Documented as provisional; benchmark evaluated; candidates are never automatically merged or deleted |
| D22 | Additive `QuestionAnalysis` persistence linked to exact revision | Preserves revision immutability; supports multi-run audit history; tracks faculty review state |
| D23 | Faculty review lifecycle (PENDING, ACCEPTED, OVERRIDDEN, DISMISSED) | Enforces human-in-the-loop governance for all AI suggestions |

## Assumptions
- Local development on Windows/PowerShell; Linux/macOS equivalents noted in setup.
- Backend and AI service communicate over internal HTTP with Bearer token authentication.

## Unresolved / needs human input
1. **Node version:** baseline says Node 24 LTS, but the machine has Node 22.18.0. All packages used support it, and `engines` is `>=22.12.0`. Decide whether to install Node 24 (e.g. via nvm-windows/fnm) before Step 3, or accept 22.
2. **Prisma version:** at the time of Step 1, npm's `latest` tag for `prisma` resolved to a release candidate (8.0.0-rc). Re-check and choose a stable release in Step 3.
3. **Remote repository** and initial commit: pending approval.
4. **Generative AI provider:** Gemini is a candidate; not configured.
5. **Authentication approach** (sessions vs JWT) and the backend-to-AI-service auth: decide in later steps.
6. **Python dependency locking:** currently ranged `requirements.txt`; consider pinned lock file later.
7. **Brand name:** UI uses the neutral "Paper Distribution System" (config/app.ts). Choose a final product name when ready.
8. **Frontend tests:** no test runner yet; decide (e.g. Vitest + Testing Library) in a later step.
9. **Hosting, object storage, key management, Hyperledger Fabric:** deferred.
