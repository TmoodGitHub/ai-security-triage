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

def test_case_lookups_filter_by_link_and_window():
    target = {"eventTime": "2026-10-14T12:00:00Z"}
    candidates = [
        {"event_time": "2026-10-14T11:00:00Z", "link": "same identity", "event_name": "A"},
        {"event_time": "2026-10-14T11:30:00Z", "link": "same IP", "event_name": "B"},
        {"event_time": "2026-10-14T06:00:00Z", "link": "same identity and IP", "event_name": "C"},
    ]
    lookups = evals.CaseLookups(target, candidates)

    assert [r["event_name"] for r in lookups.activity("identity", 2)] == ["A"]
    assert [r["event_name"] for r in lookups.activity("ip", 2)] == ["B"]
    assert [r["event_name"] for r in lookups.activity("identity", 24)] == ["A", "C"]

def test_run_evals_with_tools_gives_nothing_up_front_and_answers_lookups():
    requests = []

    def parse(**kwargs):
        requests.append({**kwargs, "messages": list(kwargs["messages"])})
        if len(kwargs["messages"]) == 1:
            lookup = SimpleNamespace(type="tool_use", id="t1", name="activity_from_ip", input={"hours": 24})
            return SimpleNamespace(
                stop_reason="tool_use",
                content=[lookup],
                parsed_output=None,
                usage=SimpleNamespace(input_tokens=500, output_tokens=50),
            )
        return SimpleNamespace(
            stop_reason="end_turn",
            content=[],
            parsed_output=TriageResult(severity="low", summary="s", reasoning="r", evidence=[], unknowns=[]),
            usage=SimpleNamespace(input_tokens=1000, output_tokens=100),
        )

    client = SimpleNamespace(messages=SimpleNamespace(parse=parse))

    run = evals.run_evals(client, context_set=True, tools=True)

    cases = json.loads(evals.CONTEXT_CASES_PATH.read_text())
    assert run.used_lookups == len(cases)
    first_prompts = [r["messages"][0]["content"] for r in requests if len(r["messages"]) == 1]
    assert not any("Related events" in prompt for prompt in first_prompts)

    spraying = next(c for c in cases if c["id"] == "B2")
    answered = [r for r in requests if len(r["messages"]) == 3 and spraying["event"]["eventID"] in r["messages"][0]["content"]]
    tool_result = answered[0]["messages"][2]["content"][0]["content"]
    for related in spraying["related"]:
        if "IP" in related["link"]:
            assert related["event_name"] in tool_result