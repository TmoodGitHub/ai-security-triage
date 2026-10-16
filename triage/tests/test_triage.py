from types import SimpleNamespace

import pytest

from triage.triage import TriageCall, TriageError, TriageResult, format_related, triage_event

RESULT = TriageResult(severity="high", summary="s", reasoning="r", evidence=["e"], unknowns=[])


def fake_client(parsed_output, stop_reason="end_turn", input_tokens=1200, output_tokens=180):
    """Stands in for anthropic.Anthropic(): messages.parse() returns a canned response, no API call."""
    response = SimpleNamespace(
        parsed_output=parsed_output,
        stop_reason=stop_reason,
        usage=SimpleNamespace(input_tokens=input_tokens, output_tokens=output_tokens),
    )
    return SimpleNamespace(messages=SimpleNamespace(parse=lambda **kwargs: response))


def test_cost_uses_input_and_output_prices():
    call = TriageCall(result=RESULT, input_tokens=1_000_000, output_tokens=1_000_000, seconds=1.0)

    # 1 million tokens at $1 in, plus 1 million at $5 out
    assert call.cost == 6.00


def test_triage_event_returns_result_and_token_counts():
    call = triage_event(fake_client(RESULT), {"eventName": "CreateUser"})

    assert call.result == RESULT
    assert call.input_tokens == 1200
    assert call.output_tokens == 180
    assert call.seconds >= 0


def test_triage_event_raises_when_there_is_no_usable_result():
    with pytest.raises(TriageError, match="max_tokens"):
        triage_event(fake_client(None, stop_reason="max_tokens"), {"eventName": "CreateUser"})


def test_format_related_with_no_events():
    assert format_related([]) == "Related events: none found."


def test_format_related_shows_success_and_failure():
    related = [
        {"event_time": "2026-10-10T03:00:00Z", "event_name": "ConsoleLogin", "who": "jdoe",
         "source_ip_address": "203.0.113.9", "success": False, "error_code": None, "link": "same IP"},
        {"event_time": "2026-10-10T03:05:00Z", "event_name": "CreateUser", "who": "jdoe",
         "source_ip_address": "203.0.113.9", "success": True, "error_code": None, "link": "same identity and IP"},
    ]

    text = format_related(related)

    assert "ConsoleLogin by jdoe from 203.0.113.9, failed (no error code) [same IP]" in text
    assert "CreateUser by jdoe from 203.0.113.9, succeeded [same identity and IP]" in text