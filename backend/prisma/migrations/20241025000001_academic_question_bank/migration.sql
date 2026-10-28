-- Migration: 20241025000001_academic_question_bank
-- Created: Step 4 — Academic Data and Question Bank
-- Description: Adds subjects, topics, questions, question_revisions,
--              and question_topic_maps tables with all integrity constraints.
--
-- Design notes:
--   - All PKs are UUID v4 (gen_random_uuid()).
--   - Subject codes are unique per institution via composite unique constraint.
--   - QuestionRevision is append-only; revision numbers unique per question.
--   - QuestionTopicMap is per-revision (immutable part of the content snapshot).
--   - authorId is nullable; will be set from auth session in the auth step.
--   - currentRevisionNumber on Question acts as an optimistic-concurrency token.

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "subject_status" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "topic_status" AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "question_type" AS ENUM (
    'MULTIPLE_CHOICE',
    'SHORT_ANSWER',
    'LONG_ANSWER',
    'NUMERICAL'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "difficulty_level" AS ENUM ('EASY', 'MEDIUM', 'HARD');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "question_lifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "subjects" (
  "id"             TEXT             NOT NULL DEFAULT gen_random_uuid()::text,
  "institution_id" TEXT             NOT NULL,
  "name"           TEXT             NOT NULL,
  "code"           TEXT             NOT NULL,
  "description"    TEXT,
  "status"         "subject_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at"     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),

  CONSTRAINT "subjects_pkey"                        PRIMARY KEY ("id"),
  CONSTRAINT "subjects_institution_id_code_unique"  UNIQUE ("institution_id", "code"),
  CONSTRAINT "subjects_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "subjects_institution_id_status_idx"
  ON "subjects" ("institution_id", "status");

-- ---------------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "topics" (
  "id"             TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "institution_id" TEXT          NOT NULL,
  "subject_id"     TEXT          NOT NULL,
  "name"           TEXT          NOT NULL,
  "code"           TEXT,
  "description"    TEXT,
  "sequence_order" INT           NOT NULL DEFAULT 0,
  "status"         "topic_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "topics_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "topics_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions" ("id") ON DELETE CASCADE,
  CONSTRAINT "topics_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "topics_subject_id_sequence_order_idx"
  ON "topics" ("subject_id", "sequence_order");

-- ---------------------------------------------------------------------------
-- questions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "questions" (
  "id"                      TEXT                NOT NULL DEFAULT gen_random_uuid()::text,
  "institution_id"          TEXT                NOT NULL,
  "subject_id"              TEXT                NOT NULL,
  "lifecycle"               "question_lifecycle" NOT NULL DEFAULT 'DRAFT',
  "current_revision_number" INT                 NOT NULL DEFAULT 0,
  "created_at"              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  "updated_at"              TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT "questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "questions_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions" ("id") ON DELETE CASCADE,
  CONSTRAINT "questions_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects" ("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "questions_institution_id_subject_id_idx"
  ON "questions" ("institution_id", "subject_id");

CREATE INDEX IF NOT EXISTS "questions_institution_id_lifecycle_idx"
  ON "questions" ("institution_id", "lifecycle");

-- ---------------------------------------------------------------------------
-- question_revisions (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "question_revisions" (
  "id"              TEXT                NOT NULL DEFAULT gen_random_uuid()::text,
  "question_id"     TEXT                NOT NULL,
  "revision_number" INT                 NOT NULL,
  "question_text"   TEXT                NOT NULL,
  "question_type"   "question_type"     NOT NULL,
  "marks"           DECIMAL(6,2)        NOT NULL,
  "language"        TEXT                NOT NULL DEFAULT 'en',
  "difficulty"      "difficulty_level",
  "explanation"     TEXT,
  "author_id"       TEXT,
  "created_at"      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

  CONSTRAINT "question_revisions_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "question_revisions_question_id_revision_number_unique"
    UNIQUE ("question_id", "revision_number"),
  CONSTRAINT "question_revisions_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "questions" ("id") ON DELETE CASCADE,
  CONSTRAINT "question_revisions_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users" ("id") ON DELETE SET NULL,
  -- Marks must be positive and reasonable (max 999.99).
  CONSTRAINT "question_revisions_marks_positive" CHECK ("marks" > 0),
  CONSTRAINT "question_revisions_marks_max"      CHECK ("marks" <= 999.99)
);

-- No UPDATE rule — enforced at application layer; direct DB updates are a
-- noted limitation (see docs). Trigger-based immutability can be added later.

CREATE INDEX IF NOT EXISTS "question_revisions_question_id_revision_number_desc_idx"
  ON "question_revisions" ("question_id", "revision_number" DESC);

-- ---------------------------------------------------------------------------
-- question_topic_maps
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "question_topic_maps" (
  "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "revision_id" TEXT NOT NULL,
  "topic_id"    TEXT NOT NULL,

  CONSTRAINT "question_topic_maps_pkey"
    PRIMARY KEY ("id"),
  CONSTRAINT "question_topic_maps_revision_id_topic_id_unique"
    UNIQUE ("revision_id", "topic_id"),
  CONSTRAINT "question_topic_maps_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "question_revisions" ("id") ON DELETE CASCADE,
  CONSTRAINT "question_topic_maps_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "topics" ("id") ON DELETE CASCADE
);
