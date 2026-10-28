# Development Setup

## Prerequisites
Git, Node.js (>= 22.12; see decision log), npm, Python 3.12+, Docker.
Verified with: Node 22.18.0, npm 11.11.1, Python 3.12.0, Git 2.47.1, Docker 29.2.0.

All commands are PowerShell, run from the repository root.

## Frontend (port 5173)
```powershell
npm --prefix frontend install
npm --prefix frontend run dev      # dev server
npm --prefix frontend run build    # type check + production build
npm --prefix frontend run preview  # serve the production build locally
```
Open http://localhost:5173. Design details: [frontend-design-system.md](frontend-design-system.md).

## Backend (port 4000)
```powershell
npm --prefix backend install
Copy-Item backend\.env.example backend\.env   # optional; defaults work
npm --prefix backend run dev        # tsx watch
npm --prefix backend run typecheck
npm --prefix backend run test       # vitest run
Invoke-RestMethod http://localhost:4000/api/health
```

## Database (Docker)
```powershell
docker compose up -d db
cd backend
npx prisma migrate deploy
npm run db:seed
```

## AI service (port 8000)
```powershell
cd ai-service
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env    # Ensure INTERNAL_SERVICE_TOKEN is set
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:8000/ready

# Run unit tests (including Step 6 question intelligence & duplicate evaluation)
.\.venv\Scripts\python -m pytest -v
```
macOS/Linux: use `.venv/bin/python` instead of `.\.venv\Scripts\python`.

To run the optional live Gemini smoke test:
```powershell
$env:GEMINI_API_KEY="your-gemini-api-key"
.\.venv\Scripts\python -m pytest -v tests/test_real_provider.py
```

## Root shortcuts
`npm run install:all`, `npm run dev:frontend`, `npm run dev:backend`, `npm run build`. The root `package.json` forwards to service scripts.

## Environment files
Copy `.env.example` to `.env` in `backend/` and `ai-service/`. Ensure `INTERNAL_SERVICE_TOKEN` in `ai-service/.env` matches `AI_SERVICE_TOKEN` in `backend/.env`. All `.env` files are Git-ignored. Never commit real secrets.
