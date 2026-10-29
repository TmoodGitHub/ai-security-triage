import json
from types import SimpleNamespace

from triage.db import fetch_related_events, fetch_untriaged_events, save_finding

class FakeDb:
    def __init__(self, rows=None):
        self.rows = rows or []
        self.calls = []

    def query(self, sql, params=None):
        self.calls.append((sql, params))
        return self.rows

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        return 1


def test_fetch_related_events_replaces_raw_event_with_target():
    db = FakeDb([
        {"event_name": "GetObject", "raw": {"requestParameters": {"bucketName": "customer-exports"}}},
        {"event_name": "ListBuckets", "raw": {"requestParameters": None}},
    ])

    related = fetch_related_events(db, "event-1")

    assert related[0]["target"] == "bucket customer-exports"
    assert related[1]["target"] is None
    assert all("raw" not in row for row in related)


def test_fetch_untriaged_events_return_id_and_event_pairs():
    db = FakeDb([{"event_id": "event-1", "raw": {"eventName": "ConsoleLogin"}}])

    assert fetch_untriaged_events(db, 5) == [("event-1", {"eventName": "ConsoleLogin"})]
    assert db.calls[0][1] == {"limit": 5}


def test_save_finding_sends_lists_as_json():
    db = FakeDb()
    result = SimpleNamespace(
        severity="high",
        summary="summary",
        reasoning="reasoning",
        evidence=["root login", "no MFA"],
        unknowns=["who owns the account"],
    )

    save_finding(db, "event-1", result, "test-model")

    params = db.calls[0][1]
    assert json.loads(params["evidence"]) == ["root login", "no MFA"]
    assert json.loads(params["unknowns"]) == ["who owns the account"]