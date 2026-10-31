import json

from triage.drivers import Db
from triage.triage import TriageResult, describe_target


def fetch_untriaged_events(db: Db, limit: int) -> list[tuple[str, dict]]:
    rows = db.query(
        """
        SELECT e.event_id, e.raw
        FROM events e
        WHERE NOT EXISTS (SELECT 1 FROM findings f WHERE f.event_id = e.event_id)
        ORDER BY e.event_time
        LIMIT %(limit)s
        """,
        {"limit": limit},
    )
    return [(row["event_id"], row["raw"]) for row in rows]

def fetch_event_for_triage(db: Db, event_id: str) -> dict | None:
    rows = db.query(
        """
        SELECT e.raw
        FROM events e
        WHERE e.event_id = %(event_id)s
            AND NOT EXISTS (SELECT 1 FROM findings f WHERE f.event_id = e.event_id)
        """,
        {"event_id": event_id},
    )
    return rows[0]["raw"] if rows else None

def save_finding(db: Db, event_id: str, result: TriageResult, model: str) -> None:
    # evidence and unknowns are sent as JSON and unpacked into TEXT[] in SQL,
    # because the Data API does not accept array parameters.
    db.execute(
        """
        INSERT INTO findings (event_id, severity, summary, reasoning, evidence, unknowns, model)
        VALUES (
            %(event_id)s,
            %(severity)s,
            %(summary)s,
            %(reasoning)s,
            ARRAY(SELECT jsonb_array_elements_text(%(evidence)s::jsonb)),
            ARRAY(SELECT jsonb_array_elements_text(%(unknowns)s::jsonb)),
            %(model)s
        )
        ON CONFLICT (event_id) DO NOTHING
        """,
        {
            "event_id": event_id,
            "severity": result.severity,
            "summary": result.summary,
            "reasoning": result.reasoning,
            "evidence": json.dumps(result.evidence),
            "unknowns": json.dumps(result.unknowns),
            "model": model,
        },
    )


def fetch_related_events(db: Db, event_id: str, limit: int = 20) -> list[dict]:
    rows = db.query(
        """
        WITH target AS (
            SELECT event_id, principal_id, source_ip_address, event_time
            FROM events
            WHERE event_id = %(event_id)s
        )
        SELECT
            e.event_time,
            e.event_name,
            COALESCE(e.user_name, e.user_arn, e.user_type) AS who,
            e.source_ip_address,
            e.success,
            e.error_code,
            e.raw,
            CASE
                WHEN e.principal_id = t.principal_id AND e.source_ip_address = t.source_ip_address THEN 'same identity and IP'
                WHEN e.principal_id = t.principal_id THEN 'same identity'
                ELSE 'same IP'
            END AS link
        FROM events e
        JOIN target t ON e.event_id <> t.event_id
        WHERE (e.principal_id = t.principal_id OR e.source_ip_address = t.source_ip_address)
            AND e.event_time BETWEEN t.event_time - INTERVAL '24 hours' AND t.event_time + INTERVAL '24 hours'
        ORDER BY e.event_time
        LIMIT %(limit)s
        """,
        {"event_id": event_id, "limit": limit},
    )

    for row in rows:
        row["target"] = describe_target(row.pop("raw"))
    return rows