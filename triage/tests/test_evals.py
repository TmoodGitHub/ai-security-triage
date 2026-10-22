import json
from types import SimpleNamespace

from triage import evals
from triage.evals import distance, event_succeeded, related_from_cases, signed_gap
from triage.triage import TriageResult, format_related

def make_event(event_id, time, principal_id="AIDA1", ip="203.0.113.9", **extra):
    return {
        "eventID": event_id,
        "eventTime": time,
        "eventName": "GetObject",
        "userIdentity": {"type": "IAMUser", "principalId": principal_id, "userName": "jdoe"},
        "sourceIPAddress": ip,
        **extra,
    }

def test_distance_counts_levels_apart():
    assert distance("high", "high") == 0
    assert distance("low", "medium") == 1
    assert distance("critical", "low") == 3

def test_signed_gap_shows_direction():
    assert signed_gap("high", "high") == 0
    assert signed_gap("critical", "medium") == -2 # rated too low
    assert signed_gap("low", "medium") == 1 # rated too high

def test_event_succeeded():
    assert event_succeeded(make_event("1", "2026-10-10T00:00:00Z"))
    assert not event_succeeded(make_event("1", "2026-10-10T00:00:00Z", errorCode="AccessDenied"))
    assert not event_succeeded(
        make_event("1", "2026-10-10T00:00:00Z", responseElements={"ConsoleLogin": "Failure"})
    )


def test_related_from_cases_uses_identity_ip_and_24_hours():
    target = make_event("target", "2026-10-10T12:00:00Z")
    cases = [
        {"event": target},
        {"event": make_event("same-ip", "2026-10-10T13:00:00Z", principal_id="OTHER")},
        {"event": make_event("same-user", "2026-10-10T11:00:00Z", ip="198.51.100.7")},
        {"event": make_event("too-old", "2026-10-08T12:00:00Z")},
        {"event": make_event("unrelated", "2026-10-10T12:30:00Z", principal_id="OTHER", ip="198.51.100.7")},
    ]

    related = related_from_cases(target, cases)

    # The target itself, the 2-day-old event, and the unrelated event are left out.
    assert [r["link"] for r in related] == ["same identity", "same IP"]

def test_run_evals_counts_too_low_too_high_and_failed(tmp_path, monkeypatch):
    # each pair is (expected severity, faux model's answer) ("None" means no usable result)
    scenarios = [
        ("high", "high"),       # assessment matched
        ("critical", "medium"), # AI assessed too low
        ("high", "low"),        # AI assessed too low
        ("low", "medium"),      # AI assessed too high
        ("medium", None),       # failed assessment
    ]

    cases = [
        {"id": i, "expected": expected, "note": "", "event": make_event(str(i), "2026-10-10T00:00:00Z")}
        for i, (expected, _) in enumerate(scenarios, start=1)
    ]
    cases_file = tmp_path / "cases.json"
    cases_file.write_text(json.dumps(cases))
    monkeypatch.setattr(evals, "CASES_PATH", cases_file)

    answers = iter(answer for _, answer in scenarios)

    def parse(**kwargs):
        severity = next(answers)
        result = None
        if severity is not None:
            result = TriageResult(severity=severity, summary="s", reasoning="r", evidence=[], unknowns=[])
        return SimpleNamespace(
            parsed_output=result,
            stop_reason="end_turn" if result else "max_tokens",
            usage=SimpleNamespace(input_tokens=1000, output_tokens=100),
        )

    client = SimpleNamespace(messages=SimpleNamespace(parse=parse))

    run = evals.run_evals(client, with_context=False)

    assert run.exact == 1
    assert run.too_low == 2
    assert run.too_high == 1
    assert run.failed == 1

    # every case counts as exactly one of these four
    assert run.exact + run.too_low + run.too_high + run.failed == run.total


def test_context_cases_are_well_formed():
    cases = json.loads(evals.CONTEXT_CASES_PATH.read_text())
    ids = [case["id"] for case in cases]

    assert len(ids) == len(set(ids)), "case ids must be unique"
    for case in cases:
        assert case["expected"] in evals.LEVELS
        assert case["note"]
        assert case["event"]["eventName"]
        format_related(case["related"]) # raises if a related event is missing a field


def test_run_evals_context_set_sends_case_its_own_related_events():
    prompts = []

    def parse(**kwargs):
        prompts.append(kwargs["messages"][0]["content"])
        return SimpleNamespace(
            parsed_output=TriageResult(severity="low", summary="s", reasoning="r", evidence=[], unknowns=[]),
            stop_reason="end_turn",
            usage=SimpleNamespace(input_tokens=1000, output_tokens=100),
        )

    client = SimpleNamespace(messages=SimpleNamespace(parse=parse))

    run = evals.run_evals(client, context_set=True)

    cases = json.loads(evals.CONTEXT_CASES_PATH.read_text())
    assert run.total == len(cases)
    for case, prompt in zip(cases, prompts):
        if case["related"]:
            for related in case["related"]:
                assert related["event_name"] in prompt
        else:
            assert "Related events: none found." in prompt