# Paper Distribution System

A multi-institution web application for **AI-assisted examination question-paper preparation**. Faculty manage question banks, AI assists with classification and generation, papers are validated, reviewed, approved by an independent authority, and finalized as protected PDFs. Blockchain integrity evidence and secure scheduled distribution come after Review 1.

> **Status: Step 1 — project foundation only.** There are no product features yet. See [docs/implementation-roadmap.md](docs/implementation-roadmap.md).

## Layout

| Directory | Purpose |
|---|---|
| `frontend/` | React + TypeScript + Vite single-page app (Tailwind added in Step 2) |
| `backend/` | Node.js + Express + TypeScript API; authoritative business/authorization boundary |
| `ai-service/` | Python + FastAPI + Pydantic service for AI operations |
| `database/` | PostgreSQL / Prisma notes (schema designed in Step 3) |
| `docs/` | Architecture, roadmap, setup, decision log |

Each service manages its own dependencies. There are no npm workspaces and no root lockfile.

## Quick start

See [docs/development-setup.md](docs/development-setup.md) for full details.

```powershell
# Frontend  (http://localhost:5173)
npm --prefix frontend install
npm --prefix frontend run dev

# Backend   (http://localhost:4000/api/health)
npm --prefix backend install
npm --prefix backend run dev

# AI service (http://localhost:8000/health)
cd ai-service
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

No database, external API, or credentials are needed to run these.

## Out of scope

Online exam delivery, proctoring, face recognition, webcam monitoring, cheating detection, and answer-sheet grading are not part of this product.
