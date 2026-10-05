CREATE TABLE IF NOT EXISTS events (
    event_id            TEXT        PRIMARY KEY,
    event_time          TIMESTAMPTZ NOT NULL,
    event_source        TEXT        NOT NULL,
    event_name          TEXT        NOT NULL,
    event_type          TEXT        NOT NULL,
    aws_region          TEXT        NOT NULL,
    source_ip_address   TEXT        NOT NULL,
    caller_account_id   TEXT,
    target_account_id   TEXT,
    principal_id        TEXT,
    user_agent          TEXT,
    user_type           TEXT        NOT NULL,
    user_name           TEXT,
    user_arn            TEXT,
    success             BOOLEAN     NOT NULL,
    error_code          TEXT,
    error_message       TEXT,
    raw                 JSONB       NOT NULL,
    ingested_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_event_time_idx ON events (event_time);
CREATE INDEX IF NOT EXISTS events_principal_id_idx ON events (principal_id);
CREATE INDEX IF NOT EXISTS events_source_ip_address_idx ON events (source_ip_address);