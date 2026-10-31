import json
from types import SimpleNamespace

import triage.lambda_handler as lambda_handler

def sqs_event(*event_ids):
    return {
        "Records": [
            {"messageId": f"message-{event_id}", "body": json.dumps({"eventId": event_id})}
            for event_id in event_ids
        ]
    }

class FakeDb:
    def __init__(self, untriaged):
        self.untriaged = untriaged
        self.saved = []

    def query(self, sql, params=None):
        if "SELECT e.raw" in sql:
            raw = self.untriaged.get(params["event_id"])
            return [{"raw": raw}] if raw is not None else []
        return []

    def execute(self, sql, params=None):
        self.saved.append(params["event_id"])
        return 1


def fake_triage(calls, fail_on=None):
    def triage_event(client, event, related):
        calls.append(event["eventName"])
        if event["eventName"] == fail_on:
            raise RuntimeError("model unavailable")
        result = SimpleNamespace(
            severity="low", summary="s", reasoning="r", evidence=[], unknowns=[]
        )        
        return SimpleNamespace(result=result, seconds=1.0, cost=0.001)

    return triage_event

def test_triages_and_saves_an_untriaged_event(monkeypatch):
    calls = []
    monkeypatch.setattr(lambda_handler, "triage_event", fake_triage(calls))
    db = FakeDb({"event-1": {"eventName": "ConsoleLogin"}})

    response = lambda_handler.handle_batch(sqs_event("event-1"), db, client=None)

    assert calls == ["ConsoleLogin"]
    assert db.saved == ["event-1"]
    assert response == {"batchItemFailures": []}


def test_skips_an_event_that_already_has_a_finding(monkeypatch):
    calls = []
    monkeypatch.setattr(lambda_handler, "triage_event", fake_triage(calls))
    db = FakeDb({})

    response = lambda_handler.handle_batch(sqs_event("event-1"), db, client=None)

    assert calls == []
    assert db.saved == []
    assert response == {"batchItemFailures": []}


def test_reports_only_the_failed_message(monkeypatch):
    calls = []
    monkeypatch.setattr(lambda_handler, "triage_event", fake_triage(calls, fail_on="DeleteTrail"))
    db = FakeDb({
        "event-1": {"eventName": "ConsoleLogin"},
        "event-2": {"eventName": "DeleteTrail"},
        "event-3": {"eventName": "ListBuckets"},
    })

    response = lambda_handler.handle_batch(sqs_event("event-1", "event-2", "event-3"), db, client=None)

    assert db.saved == ["event-1", "event-3"]
    assert response == {"batchItemFailures": [{"itemIdentifier": "message-event-2"}]}