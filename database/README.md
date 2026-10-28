# Paper Distribution System — Database

## Quick start (local development)

### 1. Start Postgres
```bash
# From the repository root:
docker compose up -d db
```

### 2. Run migrations
```bash
cd backend
npm run prisma:migrate        # creates migration + applies it
# or for CI / production:
npm run prisma:migrate:deploy
```

### 3. Regenerate the Prisma Client after schema changes
```bash
cd backend
npm run prisma:generate
```

### 4. Inspect data
```bash
npm run prisma:studio         # opens Prisma Studio in the browser
```

---

## Schema overview

| Table | Purpose |
|---|---|
| `institutions` | Top-level tenant — every piece of data belongs to one institution |
| `users` | Identity records — a user exists once, linked to institutions via memberships |
| `institution_memberships` | M:N join between user and institution with `user_role` and `membership_status` |
| `audit_logs` | Immutable append-only compliance log — never updated, only inserted |

### Enumerations

**`user_role`** — `SUPER_ADMIN | INSTITUTION_ADMIN | EXAMINER | MODERATOR | VIEWER`

**`membership_status`** — `ACTIVE | SUSPENDED | REVOKED`

**`institution_status`** — `ACTIVE | SUSPENDED | ARCHIVED`

---

## Design decisions

### UUID primary keys
All PKs are UUID v4 strings (`gen_random_uuid()`). This avoids sequential-ID
enumeration attacks and makes rows safe to reference in URLs.

### `timestamptz` everywhere
All timestamp columns use `TIMESTAMPTZ` (UTC-aware). Application code always
works in UTC; display conversion is the frontend's responsibility.

### Tenant isolation via `institution_id`
Every user-visible resource will carry an `institution_id` foreign key.
Row-Level Security (RLS) policies will be added in the authentication/security
step to enforce that queries are automatically scoped to the current tenant.

### Audit log is append-only
`audit_logs` has no `updated_at` column and no `ON UPDATE` trigger.
Application code must never issue `UPDATE` or `DELETE` on this table.
The three indexes (`institution_id+created_at`, `user_id+created_at`, `action`)
support the most common compliance query patterns.

---

## Connection strings

| Environment | URL |
|---|---|
| Local dev | `postgresql://pds_dev:pds_dev_local@localhost:5432/pds_dev` |
| Local tests | `postgresql://pds_dev:pds_dev_local@localhost:5432/pds_test` |
| Production | Set via `DATABASE_URL` environment variable (never commit) |

---

## Migrations

Migrations live in `backend/prisma/migrations/`.
Each folder is named `YYYYMMDDHHMMSS_<description>/migration.sql`.

To create a new migration after editing `prisma/schema.prisma`:
```bash
cd backend
npm run prisma:migrate -- --name <description>
```

> **Note**: The initial migration (`20241025000000_init_foundation`) was
> authored manually and checked in. Run `prisma migrate deploy` once Docker
> is running to apply it to the database and record it in the
> `_prisma_migrations` table.
