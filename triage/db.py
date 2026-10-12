import os
import psycopg
from triage.triage import TriageResult

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