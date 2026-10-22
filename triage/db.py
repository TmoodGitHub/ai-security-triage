import os
import psycopg
from psycopg.rows import dict_row
from triage.triage import TriageResult, describe_target

def connect() -> psycopg.Connection:
    return psycopg.connect(
        host=os.environ['DB_HOST'],
        port=os.environ['DB_PORT'],
        user=os.environ['POSTGRES_USER'],
        password=os.environ['POSTGRES_PASSWORD'],
        dbname=os.environ['POSTGRES_DB'],
    )


def fetch_untriaged_events(conn: psycopg.Connection, limit: int) -> list[tuple[str, dict]]:
    return conn.execute(
        """
        SELECT e.event_id, e.raw
        FROM events e
        WHERE NOT EXISTS (SELECT 1 FROM findings f WHERE f.event_id = e.event_id)
        ORDER BY e.event_time
        LIMIT %s
        """,
        (limit,),
    ).fetchall()


def save_finding(conn: psycopg.Connection, event_id: str, result: TriageResult, model: str) -> None:
    conn.execute(
        """
        INSERT INTO findings (event_id, severity, summary, reasoning, evidence, unknowns, model) VALUES (%s,%s,%s,%s,%s,%s,%s)
        """,
        (
            event_id,
            result.severity,
            result.summary,
            result.reasoning,
            result.evidence,
            result.unknowns,
            model
        )
    )

def fetch_related_events(conn: psycopg.Connection, event_id: str, limit: int = 20) -> list[dict]:
    cursor = conn.cursor(row_factory=dict_row)
    rows = cursor.execute(
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
    ).fetchall()

    for row in rows:
        row["target"] = describe_target(row.pop("raw"))
    return rows