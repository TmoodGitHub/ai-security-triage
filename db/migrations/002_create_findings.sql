CREATE TABLE IF NOT EXISTS findings (
    id              BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id        TEXT            NOT NULL REFERENCES events (event_id),
    severity        TEXT            NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    summary         TEXT            NOT NULL,
    reasoning       TEXT            NOT NULL,
    evidence        TEXT[]          NOT NULL,
    unknowns        TEXT[]          NOT NULL,
    model           TEXT            NOT NULL,
    review_status   TEXT            NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS findings_event_id_idx ON findings (event_id);
CREATE INDEX IF NOT EXISTS findings_review_status_idx ON findings (review_status);