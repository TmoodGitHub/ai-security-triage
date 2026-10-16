from triage.evals import distance, event_succeeded, related_from_cases


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