# Architecture Overview

## Components

```
Browser ──► frontend (React/Vite) ──HTTPS/JSON──► backend (Express) ──► PostgreSQL (via Prisma)
                                                      │
                                                      └──HTTP (internal)──► ai-service (FastAPI)
```

### frontend/ — React, TypeScript, Vite
- Presentation only: forms, review/editing screens, status displays.
- Talks **only** to the backend API. Never connects to PostgreSQL or the AI service directly.
- Tailwind CSS design system arrives in Step 2.

### backend/ — Node.js, Express, TypeScript, Zod
- The **authoritative business and authorization boundary**: authentication, role/institution scoping, workflow state, paper validation, approvals.
- Validates every request with Zod.
- Sole owner of database access (Prisma, from Step 3).
- Calls the AI service on behalf of authorized users.
- Layout: `config/` (env), `routes/`, `middleware/`, `validation/`, `services/`.

### ai-service/ — Python, FastAPI, Pydantic
- Internal AI processing microservice: text analysis, structured outputs, question classification, difficulty estimation, and semantic duplicate detection.
- Receives data strictly over authenticated internal HTTP from backend (`Authorization: Bearer <INTERNAL_SERVICE_TOKEN>`).
- **No database access**: does not connect to PostgreSQL; all candidate questions and metadata are passed by the Node.js backend.
- Official `google-genai` SDK provider adapter (`gemini-3.8-flash`) with isolated configuration, structured schema enforcement, bounded retries with jitter, and privacy-conscious logging.
- Semantic duplicate detection via local `sentence-transformers` (`all-MiniLM-L6-v2`, 22 MB, 384 dimensions) running on CPU with cosine similarity; no GPU or external vector DB required.
- Endpoints: Liveness (`GET /health`), readiness (`GET /ready`), smoke-test (`POST /api/v1/ai/analyze-text`), question intelligence (`POST /api/v1/ai/analyze-question`).

### database/ — PostgreSQL + Prisma
- Authoritative business data store: institutions, users, memberships, audit logs, subjects, topics, questions, question revisions, topic mappings, and question analyses (`question_analyses`).
- Managed exclusively by the Node.js backend via Prisma migrations and driver adapter.
- Invariant: Historical question revisions are immutable; question analyses link to exact revision IDs. Faculty-assigned difficulty is never mutated by AI output.

### Question Intelligence Subsystem (Step 6)
- **Classification**: Assigns Bloom's Revised Taxonomy levels (Remember, Understand, Apply, Analyze, Evaluate, Create, Undetermined), subject tags, and question type hints.
- **Difficulty Estimation**: Estimates difficulty (easy, medium, hard, undetermined) with confidence and rationale. Advisory only.
- **Duplicate Detection**: Computes cosine similarity against eligible question revisions within the same institution/subject scope. Returns candidate matches categorized as potential duplicates (>= 0.75) or near duplicates (>= 0.90).
- **Faculty Review & Override**: Faculty can `ACCEPT`, `OVERRIDE` (specifying custom Bloom's level, difficulty, notes), or `DISMISS` AI suggestions. Historical analysis rows remain immutable.

## Trust boundaries
1. Frontend is untrusted; the backend re-validates and re-authorizes everything.
2. The AI service is internal and trusted only for its narrow AI role; it is not exposed to browsers.
3. Secrets live in environment variables / secret stores, never in the repo.

## Deferred (post-Review 1)
Blockchain integrity evidence (Hyperledger Fabric), encrypted private object storage, scheduled secure distribution to examination centers.

## Explicitly not in scope
Online exam delivery, proctoring, face recognition, webcam monitoring, cheating detection, answer-sheet grading.
