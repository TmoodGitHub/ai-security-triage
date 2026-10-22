import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import anthropic
from dotenv import load_dotenv

from triage.triage import MODEL, SYSTEM_PROMPT, TriageError, describe_target, triage_event

LEVELS = ["low","medium","high","critical"]
CASES_PATH = Path(__file__).parent / "eval_cases.json"
CONTEXT_CASES_PATH = Path(__file__).parent / "eval_context_cases.json"
LOG_PATH = Path(__file__).parent / "EVAL_LOG.md"

def signed_gap(expected: str, actual: str) -> int:
    """
        Levels between the label and the AI's rating. Negative: rated too low. Positive: rated too high.
    """
    return LEVELS.index(actual) - LEVELS.index(expected)


def distance(expected: str, actual: str) -> int:
    return abs(signed_gap(expected, actual))


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
            "target": describe_target(e),
            "link": link
        })

    related.sort(key=lambda r: r["event_time"])
    return related[:limit]

@dataclass
class EvalRun:
    total: int
    exact: int
    within_one: int
    too_low: int
    too_high: int
    failed: int
    avg_cost: float
    avg_seconds: float

def run_evals(client: anthropic.Anthropic, with_context: bool = False, context_set: bool = False) -> EvalRun:
    """
    Score the model against labeled cases.

    with_context: give each event its related events, found amoung the other cases.
    context_set: use the context cases instead, each with its own designed related events.
    """
    cases = json.loads((CONTEXT_CASES_PATH if context_set else CASES_PATH).read_text())
    exact = 0
    within_one = 0
    too_low = 0
    too_high = 0
    failed = 0
    calls = []
    misses = []

    if context_set:
        mode = "context set, with designed related events"
    elif with_context:
        mode = "with related events"
    else:
        mode = "without related events"
    print(f"Running {len(cases)} eval cases with {MODEL}, {mode}\n")
    print(f"{'#':>3}  {'event':<32} {'expected':<9} {'actual':<9} result")

    for case in cases:
        name = case["event"]["eventName"]
        if context_set:
            related = case["related"]
        elif with_context:
            related = related_from_cases(case["event"], cases)
        else:
            related = None
        try:
            call = triage_event(client, case["event"], related)
        except (anthropic.APIError, TriageError) as error:
            failed += 1
            print(f"{case['id']:>3}  {name:<32} {case['expected']:<9} {'-':<9} FAILED: {error}")
            continue

        calls.append(call)
        result = call.result

        off_by = signed_gap(case["expected"], result.severity)
        if off_by < 0:
            too_low += 1
        elif off_by > 0:
            too_high += 1
        gap = abs(off_by)
        direction = " (too low)" if off_by < 0 else " (too high)" if off_by > 0 else ""

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

        print(f"{case['id']:>3}  {name:<32} {case['expected']:<9} {result.severity:<9} {mark}{direction}")

    total = len(cases)
    avg_cost = sum(c.cost for c in calls) / len(calls) if calls else 0.0
    avg_seconds = sum(c.seconds for c in calls) / len(calls) if calls else 0.0

    print(f"\nExact match:    {exact}/{total} ({exact / total:.0%})")
    print(f"Within one level: {within_one}/{total} ({within_one / total:.0%})")
    print(f"Rated too low:    {too_low}/{total}")
    print(f"Rated too high:   {too_high}/{total}")
    print(f"Failed calls:     {failed}/{total}")
    print(f"Avg per alert:    ${avg_cost:.4f}, {avg_seconds:.1f}s")
    print(f"Per 1,000 alerts: ${avg_cost * 1000:.2f}")

    if misses:
        print("\nDisagreements:")
        for case, result in misses:
            direction = "too low" if signed_gap(case["expected"], result.severity) < 0 else "too high"
            print(f"\n#{case['id']} {case['event']['eventName']}: expected {case['expected']}, got {result.severity} ({direction})")
            print(f"  Label note: {case['note']}")
            print(f"  Claude's reasoning: {result.reasoning}")

    return EvalRun(total, exact, within_one, too_low, too_high, failed, avg_cost, avg_seconds)
        


def prompt_fingerprint() -> str:
    return hashlib.sha256(SYSTEM_PROMPT.encode("utf-8")).hexdigest()[:8]


def append_to_log(run: EvalRun, note: str) -> None:
    row = (
        f"| {datetime.now().strftime('%Y-%m-%d %H:%M')} | {MODEL} | `{prompt_fingerprint()}` "
        f"| {run.exact}/{run.total} ({run.exact / run.total:.0%}) "
        f"| {run.within_one}/{run.total} ({run.within_one / run.total:.0%}) "
        f"| {run.too_low}/{run.total} "
        f"| {run.too_high}/{run.total} "
        f"| {run.failed}/{run.total} "
        f"| ${run.avg_cost * 1000:.2f} "
        f"| {run.avg_seconds:.1f}s "
        f"| {note.replace('|', '/')} |\n"
    )
    with LOG_PATH.open("a", encoding="utf-8") as log:
        log.write(row)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the triage eval set.")
    parser.add_argument("--log", metavar="NOTE", help="Add this run to EVAL_LOG.md, with NOTE describing what chagned")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--context", action="store_true", help="Give each case its related events from teh other cases")
    mode.add_argument("--context-set", action="store_true", help="Run the context cases, each with its own designed related events")
    args = parser.parse_args()

    load_dotenv()
    run = run_evals(anthropic.Anthropic(), with_context=args.context, context_set=args.context_set)

    if args.log:
        if args.context_set:
            tag = "[context set] "
        elif args.context:
            tag = "[with context] "
        else:
            tag = "[no context] "
        note = tag + args.log
        append_to_log(run, note)
        print(f"\nAdded to {LOG_PATH.name} (prompt {prompt_fingerprint()})")