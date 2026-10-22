from types import SimpleNamespace

from triage.db import fetch_related_events



def test_fetch_related_events_replaces_raw_event_with_target():
    rows = [
        {"event_name": "GetObject", "raw": {"requestParameters": {"bucketName": "customer-exports"}}},
        {"event_name": "ListBuckets", "raw": {"requestParameters": None}},
    ]
    cursor = SimpleNamespace(execute=lambda sql, params: SimpleNamespace(fetchall=lambda: rows))
    conn = SimpleNamespace(cursor=lambda row_factory: cursor)

    related = fetch_related_events(conn, "event-1")

    assert related[0]["target"] == "bucket customer-exports"
    assert related[1]["target"] is None
    assert all("row" not in row for row in related)