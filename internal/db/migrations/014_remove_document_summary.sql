DROP TABLE IF EXISTS document_summaries;

ALTER TABLE import_job_notes
    DROP COLUMN IF EXISTS summary;
