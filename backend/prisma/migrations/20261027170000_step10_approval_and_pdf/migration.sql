-- Step 10: Independent Paper Approval and PDF Generation

DO $$ BEGIN
  CREATE TYPE paper_submission_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS paper_submissions (
  id TEXT NOT NULL PRIMARY KEY,
  institution_id TEXT NOT NULL,
  paper_id TEXT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  paper_version_id TEXT NOT NULL REFERENCES paper_versions(id) ON DELETE RESTRICT,
  submitted_by TEXT NOT NULL,
  submitter_notes TEXT,
  status paper_submission_status NOT NULL DEFAULT 'PENDING',
  validation_snapshot JSONB NOT NULL,
  decided_by TEXT,
  decision TEXT,
  review_comments TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS paper_submissions_institution_id_status_idx ON paper_submissions(institution_id, status);
CREATE INDEX IF NOT EXISTS paper_submissions_paper_id_submitted_at_idx ON paper_submissions(paper_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS paper_pdf_artifacts (
  id TEXT NOT NULL PRIMARY KEY,
  institution_id TEXT NOT NULL,
  paper_id TEXT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  paper_version_id TEXT NOT NULL REFERENCES paper_versions(id) ON DELETE RESTRICT,
  template_id TEXT NOT NULL DEFAULT 'cbit-autonomous-v1',
  template_version TEXT NOT NULL DEFAULT '1.0.0',
  renderer_version TEXT NOT NULL DEFAULT '1.0.0',
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  page_count INTEGER NOT NULL DEFAULT 1,
  generated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS paper_pdf_artifacts_institution_id_paper_id_idx ON paper_pdf_artifacts(institution_id, paper_id);
CREATE INDEX IF NOT EXISTS paper_pdf_artifacts_paper_version_id_idx ON paper_pdf_artifacts(paper_version_id);

