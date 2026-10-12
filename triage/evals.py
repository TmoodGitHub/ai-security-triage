import argparse
import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path

import anthropic
from dotenv import load_dotenv

from triage.triage import MODEL, SYSTEM_PROMPT, triage_event

LEVELS = ["low","medium","high","critical"]
CASES_PATH = Path(__file__).parent / "eval_cases.json"
LOG_PATH = Path(__file__).parent / "EVAL_LOG.md"


def distance(expected: str, actual: str) -> int:
    return abs(LEVELS.index(expected) - LEVELS.index(actual))


def event_succeeded(event: dict) -> bool:
    login_failed = (event.get("responseElements") or {}).get("ConsoleLogin") == "Failure"
    return "errorCode" not in event and not login_failed


def related_from_cases(target: dict, cases: list[dict], limit: int = 20) -> list[dict]:
    """Find related events among the eval cases, using the same rules as fetch_related_events."""
    t_time = datetime.fromisoformat(target["eventTime"].replace("Z", "+00:00"))
    t_principal = target["userIdentity"].get("principalId")
    t_ip = target["sourceIPAddress"]

    related = []
    for case in cases:
        e = case["event"]
        if e["eventID"] == target["eventID"]:
            continue

        e_time = datetime.fromisoformat(e["eventTime"].replace("Z", "+00:00"))
        if abs(e_time - t_time) > timedelta(hours=24):
            continue

        identity = e["userIdentity"]
        same_identity = t_principal is not None and identity.get("principalId") == t_principal
        same_ip = e["sourceIPAddress"] == t_ip
        if not (same_identity or same_ip):
            continue

        if same_identity and same_ip:
            link = "same identity and IP"
        elif same_identity:
            link = "same identity"
        else:
            link = "same IP"

        related.append({
            "event_time": e["eventTime"],
            "event_name": e["eventName"],
            "who": identity.get("userName") or identity.get("arn") or identity["type"],
            "source_ip_address": e["sourceIPAddress"],
            "success": event_succeeded(e),
            "error_code": e.get("errorCode"),
            "link": link
        })

    related.sort(key=lambda r: r["event_time"])
    return related[:limit]


def run_evals(client: anthropic.Anthropic, with_context: bool) -> tuple[int, int, int]:
    cases = json.loads(CASES_PATH.read_text())
    exact = 0
    within_one = 0
    misses = []

    mode = "with related events" if with_context else "without related events"
    print(f"Running {len(cases)} eval cases with {MODEL}, {mode}\n")
    print(f"{'#':>3}  {'event':<32} {'expected':<9} {'actual':<9} result")

    for case in cases:
        related = related_from_cases(case["event"], cases) if with_context else None
        result = triage_event(client, case["event"], related)
        gap = distance(case["expected"], result.severity)

        if gap == 0:
            exact += 1
            within_one += 1
            mark = "exact"
        elif gap == 1:
            within_one += 1
            mark = "near"
        else:
            mark = "MISS"

        if gap > 0:
            misses.append((case, result))

        print(f"{case['id']:>3}  {case['event']["eventName"]:<32} {case['expected']:<9} {result.severity:<9} {mark}")

    total = len(cases)
    print(f"\nExact match       {exact}/{total} ({exact / total:.0%})")
    print(f"Within one level: {within_one}/{total} ({within_one / total:.0%})")

    if misses:
        print("\nDisaggrements:")
        for case, result in misses:
            print(f"\n#{case['id']} {case['event']['eventName']}: expected {case['expected']}, got {result.severity}")
            print(f"  Your note: {case['note']}")
            print(f"  Claude's reasoning: {result.reasoning}")

    return exact, within_one, total


def prompt_fingerprint() -> str:
    return hashlib.sha256(SYSTEM_PROMPT.encode("utf-8")).hexdigest()[:8]


def append_to_log(exact: int, within_one: int, total: int, note: str) -> None:
    row = (
        f"| {datetime.now().strftime('%Y-%m-%d %H:%M')} | {MODEL} | `{prompt_fingerprint()}` "
        f"| {exact}/{total} ({exact / total:.0%}) "
        f"| {within_one}/{total} ({within_one / total:.0%}) "
        f"| {note.replace('|', '/')} |\n"
    )
    with LOG_PATH.open("a", encoding="utf-8") as log:
        log.write(row)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the triage eval set.")
    parser.add_argument("--log", metavar="NOTE", help="Add this run to EVAL_LOG.md, with NOTE describing what changed")
    parser.add_argument("--context", action="store_true", help="Give each case its related events from the other cases")
    args = parser.parse_args()

    load_dotenv()
    exact, within_one, total = run_evals(anthropic.Anthropic(), args.context)

    if args.log:
        note = ("[with context] " if args.context else "[no context] ") + args.log
        append_to_log(exact, within_one, total, note)
        print(f"\nAdded to {LOG_PATH.name} (prompt {prompt_fingerprint()})")