-- Constraints and search indexes that the Prisma schema language cannot express.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_progress_range CHECK (progress BETWEEN 0 AND 100),
  ADD CONSTRAINT service_requests_attempts_non_negative CHECK (attempts >= 0),
  ADD CONSTRAINT service_requests_version_positive CHECK (version >= 1),
  ADD CONSTRAINT service_requests_title_not_blank CHECK (length(trim(title)) >= 3);

-- Trigram indexes make case-insensitive "contains" search (ILIKE '%term%') use an index.
CREATE INDEX service_requests_title_trgm_idx ON service_requests USING gin (title gin_trgm_ops);
CREATE INDEX service_requests_description_trgm_idx ON service_requests USING gin (description gin_trgm_ops);
