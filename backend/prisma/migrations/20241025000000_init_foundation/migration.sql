-- Migration: 20241025_init_foundation
-- Created: Step 3 — Database Foundation
-- Description: Creates the four foundational tables for the Paper Distribution System.
--
-- Tables created:
--   institutions            — top-level tenant
--   users                   — identity records
--   institution_memberships — user↔institution M:N with role
--   audit_logs              — immutable compliance log
--
-- All PKs are UUID v4.
-- All timestamps are timestamptz (UTC-aware).
-- Row-Level Security (RLS) placeholder notes are included but NOT enabled yet;
-- that will be done in a dedicated security step once the auth layer is in place.

-- ---------------------------------------------------------------------------
-- Enable required extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid() for UUID v4

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "user_role" AS ENUM (
    'SUPER_ADMIN',
    'INSTITUTION_ADMIN',
    'EXAMINER',
    'MODERATOR',
    'VIEWER'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "membership_status" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'REVOKED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "institution_status" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'ARCHIVED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- institutions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "institutions" (
  "id"         TEXT                NOT NULL DEFAULT gen_random_uuid()::text,
  "slug"       TEXT                NOT NULL,
  "name"       TEXT                NOT NULL,
  "logo_url"   TEXT,
  "status"     "institution_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT "institutions_pkey"         PRIMARY KEY ("id"),
  CONSTRAINT "institutions_slug_unique"  UNIQUE ("slug")
);

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "users" (
  "id"              TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "email"           TEXT        NOT NULL,
  "hashed_password" TEXT        NOT NULL,
  "display_name"    TEXT        NOT NULL,
  "avatar_url"      TEXT,
  "is_active"       BOOLEAN     NOT NULL DEFAULT TRUE,
  "last_login_at"   TIMESTAMPTZ,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "users_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "users_email_unique"  UNIQUE ("email")
);

-- ---------------------------------------------------------------------------
-- institution_memberships
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "institution_memberships" (
  "id"             TEXT               NOT NULL DEFAULT gen_random_uuid()::text,
  "institution_id" TEXT               NOT NULL,
  "user_id"        TEXT               NOT NULL,
  "role"           "user_role"        NOT NULL,
  "status"         "membership_status" NOT NULL DEFAULT 'ACTIVE',
  "joined_at"      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT "institution_memberships_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "institution_memberships_institution_id_user_id_unique"
    UNIQUE ("institution_id", "user_id"),

  CONSTRAINT "institution_memberships_institution_id_fkey"
    FOREIGN KEY ("institution_id")
    REFERENCES "institutions" ("id")
    ON DELETE CASCADE,

  CONSTRAINT "institution_memberships_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users" ("id")
    ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "institution_id" TEXT,
  "user_id"       TEXT,
  "action"        TEXT        NOT NULL,
  "resource_type" TEXT,
  "resource_id"   TEXT,
  "payload"       JSONB,
  "ip_address"    TEXT,
  "user_agent"    TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "audit_logs_institution_id_fkey"
    FOREIGN KEY ("institution_id")
    REFERENCES "institutions" ("id")
    ON DELETE SET NULL,

  CONSTRAINT "audit_logs_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users" ("id")
    ON DELETE SET NULL
);

-- Performance indexes for audit_logs (high-volume append-only table)
CREATE INDEX IF NOT EXISTS "audit_logs_institution_id_created_at_idx"
  ON "audit_logs" ("institution_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_user_id_created_at_idx"
  ON "audit_logs" ("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "audit_logs_action_idx"
  ON "audit_logs" ("action");

-- ---------------------------------------------------------------------------
-- RLS Placeholder
-- ---------------------------------------------------------------------------
-- Row-Level Security is NOT enabled yet. It will be added in the auth/security
-- step. When enabled, policies will enforce tenant isolation so that queries
-- without an explicit institution_id context return no rows.
--
-- Example (future step):
--   ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
--   CREATE POLICY institution_isolation ON institutions
--     USING (id = current_setting('app.institution_id', true));
