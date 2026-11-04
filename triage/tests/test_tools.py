from types import SimpleNamespace

from triage.tools import DbLookups, format_activity, triage_with_tools
from triage.triage import TriageResult

RESULT = TriageResult(
    severity="high",
    summary="summary",
    reasoning="reasoning",
    evidence=["evidence"],
    unknowns=[],
)


def tool_use(block_id, name, hours):
    return SimpleNamespace(type="tool_use", id=block_id, name=name, input={"hours": hours})


def response(stop_reason, content=(), parsed=None, tokens=(100, 20)):
    return SimpleNamespace(
        stop_reason=stop_reason,
        content=list(content),
        parsed_output=parsed,
        usage=SimpleNamespace(input_tokens=tokens[0], output_tokens=tokens[1]),
    )


class FakeClient:
    """Stands in for anthropic.Anthropic: returns queued responses in order
    and records every request."""

    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []
        self.messages = SimpleNamespace(parse=self._parse)

    def _parse(self, **request):
        # Copy the conversation as it was at this call; the loop keeps adding to it.
        self.requests.append({**request, "messages": list(request["messages"])})
        return self.responses.pop(0)


class FakeLookups:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def activity(self, by, hours):
        self.calls.append((by, hours))
        return self.rows


ROW = {
    "event_time": "2026-10-14T13:07:12Z",
    "event_name": "ListBuckets",
    "who": "jdoe",
    "source_ip_address": "203.0.113.10",
    "success": True,
    "error_code": None,
    "target": None,
}


def test_runs_the_lookups_the_model_asks_for_then_returns_its_answer():
    client = FakeClient([
        response("tool_use", [tool_use("t1", "activity_by_identity", 6)]),
        response("end_turn", parsed=RESULT, tokens=(300, 80)),
    ])
    lookups = FakeLookups([ROW])

    call = triage_with_tools(client, {"eventName": "ConsoleLogin"}, lookups)

    assert call.result == RESULT
    assert lookups.calls == [("identity", 6)]
    assert call.lookups == ["activity_by_identity(6h)"]
    assert (call.input_tokens, call.output_tokens) == (400, 100)
    tool_result = client.requests[1]["messages"][-1]["content"][0]
    assert tool_result["tool_use_id"] == "t1"
    assert "ListBuckets by jdoe from 203.0.113.10, succeeded" in tool_result["content"]


def test_answers_without_lookups_when_the_model_needs_none():
    client = FakeClient([response("end_turn", parsed=RESULT)])
    lookups = FakeLookups([ROW])

    call = triage_with_tools(client, {"eventName": "ListBuckets"}, lookups)

    assert call.lookups == []
    assert lookups.calls == []


def test_keeps_the_window_within_24_hours():
    client = FakeClient([
        response("tool_use", [tool_use("t1", "activity_from_ip", 72)]),
        response("end_turn", parsed=RESULT),
    ])
    lookups = FakeLookups([])

    triage_with_tools(client, {}, lookups)

    assert lookups.calls == [("ip", 24)]


def test_turns_lookups_off_after_the_last_round():
    client = FakeClient([
        response("tool_use", [tool_use("t1", "activity_from_ip", 24)]),
        response("end_turn", parsed=RESULT),
    ])

    triage_with_tools(client, {}, FakeLookups([]), max_rounds=1)

    assert client.requests[0]["tool_choice"] == {"type": "auto"}
    assert client.requests[1]["tool_choice"] == {"type": "none"}


def test_reports_an_unknown_tool_as_an_error_to_the_model():
    client = FakeClient([
        response("tool_use", [tool_use("t1", "delete_everything", 1)]),
        response("end_turn", parsed=RESULT),
    ])

    triage_with_tools(client, {}, FakeLookups([]))

    tool_result = client.requests[1]["messages"][-1]["content"][0]
    assert tool_result["is_error"] is True


def test_format_activity_says_when_nothing_was_found():
    assert format_activity([]) == "No other activity found."


def test_db_lookups_query_by_the_chosen_link():
    class FakeDb:
        def __init__(self):
            self.calls = []

        def query(self, sql, params=None):
            self.calls.append((sql, params))
            return [{**ROW, "raw": {"requestParameters": {"bucketName": "logs"}}}]

    db = FakeDb()
    rows = DbLookups(db, "event-1").activity("ip", 6)

    sql, params = db.calls[0]
    assert "e.source_ip_address = t.link_value" in sql
    assert params == {"event_id": "event-1", "hours": 6, "limit": 20}
    assert rows[0]["target"] == "bucket logs"