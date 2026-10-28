-- ---------------------------------------------------------------------------
-- Step 8 — Examination Configuration and Question Paper Builder
-- ---------------------------------------------------------------------------

-- Enumerations

CREATE TYPE "paper_status" AS ENUM (
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED'
);

-- ---------------------------------------------------------------------------
-- exam_configurations
-- ---------------------------------------------------------------------------

CREATE TABLE "exam_configurations" (
  "id"               TEXT         NOT NULL DEFAULT gen_random_uuid()::text,
  "institution_id"   TEXT         NOT NULL,
  "subject_id"       TEXT         NOT NULL,
  "name"             TEXT         NOT NULL,
  "description"      TEXT,
  "total_marks"      NUMERIC(8,2) NOT NULL,
  "passing_marks"    NUMERIC(8,2),
  "duration_minutes" INTEGER,
  "instructions"     TEXT,
  "is_active"        BOOLEAN      NOT NULL DEFAULT TRUE,
  "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT "exam_configurations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "exam_configurations"
  ADD CONSTRAINT "exam_configurations_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT;

CREATE INDEX "exam_configurations_institution_id_subject_id_idx"
  ON "exam_configurations"("institution_id", "subject_id");

CREATE INDEX "exam_configurations_institution_id_is_active_idx"
  ON "exam_configurations"("institution_id", "is_active");

-- ---------------------------------------------------------------------------
-- exam_papers
-- ---------------------------------------------------------------------------

CREATE TABLE "exam_papers" (
  "id"               TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "institution_id"   TEXT          NOT NULL,
  "config_id"        TEXT          NOT NULL,
  "title"            TEXT          NOT NULL,
  "status"           "paper_status" NOT NULL DEFAULT 'DRAFT',
  "version"          INTEGER       NOT NULL DEFAULT 1,
  "created_by"       TEXT,
  "submitted_at"     TIMESTAMPTZ,
  "approved_at"      TIMESTAMPTZ,
  "approved_by"      TEXT,
  "rejection_reason" TEXT,
  "notes"            TEXT,
  "created_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "exam_papers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "exam_papers"
  ADD CONSTRAINT "exam_papers_config_id_fkey"
    FOREIGN KEY ("config_id") REFERENCES "exam_configurations"("id") ON DELETE RESTRICT;

CREATE INDEX "exam_papers_institution_id_status_idx"
  ON "exam_papers"("institution_id", "status");

CREATE INDEX "exam_papers_institution_id_config_id_idx"
  ON "exam_papers"("institution_id", "config_id");

-- ---------------------------------------------------------------------------
-- paper_sections
-- ---------------------------------------------------------------------------

CREATE TABLE "paper_sections" (
  "id"              TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "paper_id"        TEXT          NOT NULL,
  "section_label"   TEXT          NOT NULL,
  "title"           TEXT          NOT NULL,
  "description"     TEXT,
  "sequence_order"  INTEGER       NOT NULL DEFAULT 0,
  "total_slots"     INTEGER       NOT NULL DEFAULT 0,
  "required_answers" INTEGER,
  "section_marks"   NUMERIC(8,2)  NOT NULL DEFAULT 0,
  
  CONSTRAINT "paper_sections_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "paper_sections"
  ADD CONSTRAINT "paper_sections_paper_id_fkey"
    FOREIGN KEY ("paper_id") REFERENCES "exam_papers"("id") ON DELETE CASCADE;

CREATE INDEX "paper_sections_paper_id_sequence_order_idx"
  ON "paper_sections"("paper_id", "sequence_order");

-- ---------------------------------------------------------------------------
-- question_slots
-- ---------------------------------------------------------------------------

CREATE TABLE "question_slots" (
  "id"             TEXT          NOT NULL DEFAULT gen_random_uuid()::text,
  "section_id"     TEXT          NOT NULL,
  "question_id"    TEXT          NOT NULL,
  "revision_id"    TEXT          NOT NULL,
  "sequence_order" INTEGER       NOT NULL DEFAULT 0,
  "allocated_marks" NUMERIC(6,2) NOT NULL,
  "notes"          TEXT,

  CONSTRAINT "question_slots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "question_slots_section_id_sequence_order_key" UNIQUE ("section_id", "sequence_order")
);

ALTER TABLE "question_slots"
  ADD CONSTRAINT "question_slots_section_id_fkey"
    FOREIGN KEY ("section_id") REFERENCES "paper_sections"("id") ON DELETE CASCADE;

ALTER TABLE "question_slots"
  ADD CONSTRAINT "question_slots_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "question_revisions"("id") ON DELETE RESTRICT;

CREATE INDEX "question_slots_section_id_idx"
  ON "question_slots"("section_id");
