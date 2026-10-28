-- ---------------------------------------------------------------------------
-- Step 7 — AI-Powered Question Generation
-- ---------------------------------------------------------------------------

-- Enumerations

CREATE TYPE "generation_job_status" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'FAILED'
);

CREATE TYPE "generated_question_status" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'EDITED'
);

-- QuestionGenerationJob table

CREATE TABLE "question_generation_jobs" (
  "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "institution_id" TEXT        NOT NULL,
  "subject_id"    TEXT         NOT NULL,
  "topic_id"      TEXT,
  "requested_by"  TEXT,
  "question_type" "question_type"      NOT NULL,
  "difficulty"    "difficulty_level",
  "count"         INTEGER              NOT NULL,
  "language"      TEXT         NOT NULL DEFAULT 'en',
  "context_hint"  TEXT,
  "status"        "generation_job_status" NOT NULL DEFAULT 'PENDING',
  "error_message" TEXT,
  "ai_provider"   TEXT,
  "ai_model"      TEXT,
  "duration_ms"   INTEGER,
  "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"    TIMESTAMPTZ  NOT NULL,

  CONSTRAINT "question_generation_jobs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "question_generation_jobs"
  ADD CONSTRAINT "question_generation_jobs_institution_id_fkey"
    FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE;

ALTER TABLE "question_generation_jobs"
  ADD CONSTRAINT "question_generation_jobs_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE;


CREATE INDEX "question_generation_jobs_institution_id_status_idx"
  ON "question_generation_jobs"("institution_id", "status");

CREATE INDEX "question_generation_jobs_institution_id_subject_id_idx"
  ON "question_generation_jobs"("institution_id", "subject_id");

-- GeneratedQuestion table

CREATE TABLE "generated_questions" (
  "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
  "job_id"               UUID         NOT NULL,
  "question_text"        TEXT         NOT NULL,
  "question_type"        "question_type"      NOT NULL,
  "suggested_answer"     TEXT,
  "explanation"          TEXT,
  "difficulty"           "difficulty_level",
  "blooms_level"         TEXT,
  "subject_tags"         TEXT[]       NOT NULL DEFAULT '{}',
  "status"               "generated_question_status" NOT NULL DEFAULT 'PENDING',
  "reviewed_at"          TIMESTAMPTZ,
  "reviewed_by"          TEXT,
  "review_notes"         TEXT,
  "promoted_question_id" TEXT,
  "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"           TIMESTAMPTZ  NOT NULL,

  CONSTRAINT "generated_questions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "generated_questions"
  ADD CONSTRAINT "generated_questions_job_id_fkey"
    FOREIGN KEY ("job_id") REFERENCES "question_generation_jobs"("id") ON DELETE CASCADE;

CREATE INDEX "generated_questions_job_id_idx"
  ON "generated_questions"("job_id");

CREATE INDEX "generated_questions_status_idx"
  ON "generated_questions"("status");
