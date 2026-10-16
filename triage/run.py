import argparse

import anthropic
from dotenv import load_dotenv

from triage.db import connect, fetch_related_events, fetch_untriaged_events, save_finding
from triage.triage import MODEL, TriageError, triage_event

parser = argparse.ArgumentParser(description="Triage saved events that have no findings yet.")
parser.add_argument("--limit", type=int, default=10, help="Maximum number of events to triage (default 10)")
args = parser.parse_args()

load_dotenv()
client = anthropic.Anthropic()

with connect() as conn:
    events = fetch_untriaged_events(conn, args.limit)
    print(f"Found {len(events)} events to triage")

    calls = []
    failed = 0
    for event_id, raw in events:
        related = fetch_related_events(conn, event_id)
        try:
            call = triage_event(client, raw, related)
        except (anthropic.APIError, TriageError) as error:
            failed += 1
            print(f"  {raw['eventName']}: FAILED: {error}")
            continue

        save_finding(conn, event_id, call.result, MODEL)
        conn.commit()
        calls.append(call)
        print(
            f"  {raw['eventName']}: {call.result.severity.upper()} "
            f"({len(related)} related events, {call.seconds:.1f}s, ${call.cost:.4f})"
        )

    if calls:
        total_cost = sum(c.cost for c in calls)
        print(f"\nTriaged {len(calls)}, failed {failed}")
        print(f"Total cost ${total_cost:.4f}, avg ${total_cost/len(calls):.4f} and "
        f"{sum(c.seconds for c in calls) / len(calls):.1f}s per alert")
    elif failed:
        print(f"\nAll {failed} failed")

    print('Done')