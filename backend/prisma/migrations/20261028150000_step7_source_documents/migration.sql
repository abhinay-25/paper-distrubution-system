-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('UPLOADED', 'PROCESSING', 'INDEXED', 'FAILED');

-- AlterTable
ALTER TABLE "question_generation_jobs"
  ADD COLUMN "source_document_id" TEXT,
  ADD COLUMN "source_document_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "grounding_mode" TEXT;

-- AlterTable
ALTER TABLE "generated_questions"
  ADD COLUMN "source_chunk_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "source_documents" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "uploaded_by_id" TEXT,
    "subject_id" TEXT,
    "title" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "content_hash" TEXT NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'UPLOADED',
    "error_message" TEXT,
    "page_count" INTEGER,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "processing_started_at" TIMESTAMPTZ,
    "processing_completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "source_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "page_number" INTEGER,
    "section_title" TEXT,
    "token_count" INTEGER,
    "embedding_json" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_documents_institution_id_idx" ON "source_documents"("institution_id");
CREATE INDEX "source_documents_status_idx" ON "source_documents"("status");
CREATE INDEX "source_documents_subject_id_idx" ON "source_documents"("subject_id");

-- CreateIndex
CREATE INDEX "document_chunks_document_id_idx" ON "document_chunks"("document_id");
CREATE INDEX "document_chunks_institution_id_idx" ON "document_chunks"("institution_id");

-- AddForeignKey
ALTER TABLE "question_generation_jobs" ADD CONSTRAINT "question_generation_jobs_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "source_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_documents" ADD CONSTRAINT "source_documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "source_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
