-- Step 9: Paper versioning and optimistic concurrency
ALTER TABLE exam_papers ADD COLUMN IF NOT EXISTS concurrency_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS paper_versions (
  id TEXT NOT NULL PRIMARY KEY,
  paper_id TEXT NOT NULL REFERENCES exam_papers(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot_json JSONB NOT NULL,
  change_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT paper_versions_paper_id_version_number_key UNIQUE (paper_id, version_number)
);

CREATE INDEX IF NOT EXISTS paper_versions_paper_id_idx ON paper_versions(paper_id);

