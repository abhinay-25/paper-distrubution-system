-- CreateEnum
CREATE TYPE "blooms_level" AS ENUM ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE', 'UNDETERMINED');

-- CreateEnum
CREATE TYPE "ai_difficulty_suggestion" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'UNDETERMINED');

-- CreateEnum
CREATE TYPE "ai_analysis_review_status" AS ENUM ('PENDING', 'ACCEPTED', 'OVERRIDDEN', 'DISMISSED');

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";

-- DropForeignKey
ALTER TABLE "institution_memberships" DROP CONSTRAINT "institution_memberships_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "institution_memberships" DROP CONSTRAINT "institution_memberships_user_id_fkey";

-- DropForeignKey
ALTER TABLE "question_revisions" DROP CONSTRAINT "question_revisions_author_id_fkey";

-- DropForeignKey
ALTER TABLE "question_revisions" DROP CONSTRAINT "question_revisions_question_id_fkey";

-- DropForeignKey
ALTER TABLE "question_topic_maps" DROP CONSTRAINT "question_topic_maps_revision_id_fkey";

-- DropForeignKey
ALTER TABLE "question_topic_maps" DROP CONSTRAINT "question_topic_maps_topic_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_subject_id_fkey";

-- DropForeignKey
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "topics" DROP CONSTRAINT "topics_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "topics" DROP CONSTRAINT "topics_subject_id_fkey";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "institution_memberships" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "institutions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "question_revisions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "question_topic_maps" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "questions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "subjects" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "topics" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "question_analyses" (
    "id" TEXT NOT NULL,
    "revision_id" TEXT NOT NULL,
    "ai_blooms_level" "blooms_level" NOT NULL,
    "ai_blooms_confidence" DOUBLE PRECISION NOT NULL,
    "ai_subject_tags" TEXT[],
    "ai_question_type_hint" TEXT NOT NULL,
    "ai_suggested_difficulty" "ai_difficulty_suggestion" NOT NULL,
    "ai_difficulty_confidence" DOUBLE PRECISION NOT NULL,
    "ai_difficulty_rationale" TEXT NOT NULL,
    "has_potential_duplicates" BOOLEAN NOT NULL DEFAULT false,
    "has_near_duplicates" BOOLEAN NOT NULL DEFAULT false,
    "duplicate_candidates" JSONB NOT NULL DEFAULT '[]',
    "near_duplicate_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.90,
    "potential_duplicate_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.75,
    "review_status" "ai_analysis_review_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by" TEXT,
    "faculty_blooms_level" "blooms_level",
    "faculty_difficulty" "difficulty_level",
    "faculty_notes" TEXT,
    "ai_provider" TEXT NOT NULL,
    "ai_model" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "question_analyses_revision_id_created_at_idx" ON "question_analyses"("revision_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "question_analyses_review_status_idx" ON "question_analyses"("review_status");

-- AddForeignKey
ALTER TABLE "institution_memberships" ADD CONSTRAINT "institution_memberships_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_memberships" ADD CONSTRAINT "institution_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_revisions" ADD CONSTRAINT "question_revisions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_topic_maps" ADD CONSTRAINT "question_topic_maps_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "question_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_topic_maps" ADD CONSTRAINT "question_topic_maps_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_analyses" ADD CONSTRAINT "question_analyses_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "question_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "institution_memberships_institution_id_user_id_unique" RENAME TO "institution_memberships_institution_id_user_id_key";

-- RenameIndex
ALTER INDEX "institutions_slug_unique" RENAME TO "institutions_slug_key";

-- RenameIndex
ALTER INDEX "question_revisions_question_id_revision_number_desc_idx" RENAME TO "question_revisions_question_id_revision_number_idx";

-- RenameIndex
ALTER INDEX "question_revisions_question_id_revision_number_unique" RENAME TO "question_revisions_question_id_revision_number_key";

-- RenameIndex
ALTER INDEX "question_topic_maps_revision_id_topic_id_unique" RENAME TO "question_topic_maps_revision_id_topic_id_key";

-- RenameIndex
ALTER INDEX "subjects_institution_id_code_unique" RENAME TO "subjects_institution_id_code_key";

-- RenameIndex
ALTER INDEX "users_email_unique" RENAME TO "users_email_key";
