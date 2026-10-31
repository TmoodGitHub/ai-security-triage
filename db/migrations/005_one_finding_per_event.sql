DROP INDEX IF EXISTS findings_event_id_idx;
CREATE UNIQUE INDEX IF NOT EXISTS findings_event_id_key ON findings (event_id);