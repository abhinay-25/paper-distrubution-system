# pds-backend

Node.js + Express + TypeScript backend for the Paper Distribution System.

## Stack

| Concern | Library |
|---|---|
| Runtime | Node.js ≥ 22 |
| Framework | Express 5 |
| Language | TypeScript 6 (strict, NodeNext) |
| Database ORM | Prisma 7 (`prisma-client` provider) |
| DB Driver | `@prisma/adapter-pg` (pg v8) |
| Validation | Zod 4 |
| Testing | Vitest 5 + Supertest |
| Dev runner | tsx (watch mode) |

## Getting started

### Prerequisites

- Node.js ≥ 22
- Docker Desktop (for local Postgres)
- Copy `.env.example` → `.env` (already done if you followed Step 1)

### 1. Install dependencies
```bash
npm install
```

### 2. Start the database
```bash
npm run db:start          # docker compose up -d db
```

### 3. Generate Prisma client
```bash
npm run prisma:generate
```

### 4. Apply database migrations
```bash
npm run prisma:migrate    # prisma migrate dev
```

### 5. Start the dev server
```bash
npm run dev               # tsx watch src/server.ts
```

The API will be available at **http://localhost:4000**.

---

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server with hot-reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server (`dist/server.js`) |
| `npm run typecheck` | Type-check without emitting files |
| `npm test` | Run unit tests (Vitest, no DB required) |
| `npm run test:watch` | Vitest in interactive watch mode |
| `npm run test:coverage` | Run tests with v8 coverage report |
| `npm run prisma:generate` | Re-generate Prisma Client from schema |
| `npm run prisma:migrate` | Create + apply a new migration (dev) |
| `npm run prisma:migrate:deploy` | Apply pending migrations (CI/prod) |
| `npm run prisma:studio` | Open Prisma Studio |
| `npm run db:start` | Start the local Postgres container |

---

## Project structure

```
backend/
├── prisma/
│   ├── schema.prisma           # Database schema (source of truth)
│   ├── prisma.config.ts        # Prisma 7 config — adapter + schema path
│   └── migrations/             # SQL migration files
│       └── 20241025000000_init_foundation/migration.sql
├── src/
│   ├── __generated__/prisma/   # Generated Prisma Client (git-ignored)
│   ├── __tests__/              # Unit tests
│   │   ├── health.test.ts
│   │   └── errorHandler.test.ts
│   ├── config/
│   │   └── env.ts              # Zod-validated env — exits on invalid config
│   ├── lib/
│   │   └── prisma.ts           # PrismaClient singleton + closePrisma()
│   ├── middleware/
│   │   ├── requestId.ts        # Attaches X-Request-Id to every request
│   │   └── errorHandler.ts     # Global error handler + AppError class
│   ├── routes/
│   │   ├── health.ts           # GET /api/health, GET /api/health/db
│   │   └── index.ts            # Central route registry
│   ├── services/               # (empty — feature services added in later steps)
│   ├── validation/             # (empty — Zod schemas added in later steps)
│   ├── app.ts                  # Express app factory
│   └── server.ts               # Entry point + graceful shutdown
├── .env                        # Local secrets (git-ignored)
├── .env.example                # Template committed to git
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## API endpoints (Step 3)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/health` | Liveness check — always 200 if process is up |
| `GET` | `/api/health/db` | Readiness check — 200 if DB reachable, 503 if not |

All responses include `X-Request-Id` for trace correlation.

---

## Error response format

All errors return a consistent JSON body:

```json
{
  "error": "Human-readable message",
  "requestId": "uuid-v4",
  "details": { }
}
```

`details` is only present for `400 Validation failed` responses (Zod errors).

Throw `AppError` from any route/service:
```typescript
import { AppError } from "../middleware/errorHandler.js";

throw AppError.notFound("Institution not found");
throw AppError.forbidden();
throw new AppError("Custom message", 422);
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development` \| `test` \| `production` |
| `PORT` | No | `4000` | HTTP server port |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection URL |

---

## Running migrations against the database

> **Docker must be running** before this step.

```bash
# Start Postgres (from repo root)
docker compose up -d db

# Apply the initial migration
cd backend
npm run prisma:migrate:deploy
```

This will apply `20241025000000_init_foundation` and record it in the
`_prisma_migrations` table. Future schema changes follow the same flow:
edit `prisma/schema.prisma` → `npm run prisma:migrate -- --name <name>`.
