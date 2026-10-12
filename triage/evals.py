import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path

import anthropic
from dotenv import load_dotenv

from triage.triage import MODEL, SYSTEM_PROMPT, triage_event

LEVELS = ["low","medium","high","critical"]
CASES_PATH = Path(__file__).parent / "eval_cases.json"
LOG_PATH = Path(__file__).parent / "EVAL_LOG.md"

def distance(expected: str, actual: str) -> int:
    return abs(LEVELS.index(expected) - LEVELS.index(actual))

def run_evals(client: anthropic.Anthropic) -> tuple[int, int, int]:
    cases = json.loads(CASES_PATH.read_text())
    exact = 0
    within_one = 0
    misses = []

    print(f"Running {len(cases)} eval cases with {MODEL}\n")
    print(f"{'#':>3}  {'event':<32} {'expected':<9} {'actual':<9} result")

    for case in cases:
        result = triage_event(client, case["event"])
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

        print(f"{case['id']:>3}  {case['event']['eventName']:<32} {case['expected']:<9} {result.severity:<9} {mark}")

    total = len(cases)
    print(f"\nExact match:      {exact}/{total} ({exact /  total:.0%})")
    print(f"Within one level:   {within_one}/{total} ({within_one / total:.0%})")

    if misses:
        print("\nDisagreements:")
        for case, result in misses:
            print(f"\n{case['id']} {case['event']['eventName']}: expected {case['expected']}, got {result.severity}")
            print(f"  Your note: {case['note']}")
            print(f"  Clause's reasoning: {result.reasoning}")

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
    args = parser.parse_args()

    load_dotenv()
    exact, within_one, total = run_evals(anthropic.Anthropic())

    if args.log:
        append_to_log(exact, within_one, total, args.log)
        print(f"\nAdded to {LOG_PATH.name} (prompt {prompt_fingerprint()})")