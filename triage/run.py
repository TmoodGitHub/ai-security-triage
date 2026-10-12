import argparse

import anthropic
from dotenv import load_dotenv

from triage.db import connect, fetch_untriaged_events, save_finding
from triage.triage import MODEL, triage_event

parser = argparse.ArgumentParser(description="Triage saved events that have no finding yet.")
parser.add_argument("--limit", type=int, default=10, help="Maximum number of events to triage (default 10)")
args = parser.parse_args()

load_dotenv()
client = anthropic.Anthropic()

with connect() as conn:
    events = fetch_untriaged_events(conn, args.limit)
    print(f"Found {len(events)} events to triage")

    for event_id, raw in events:
        result = triage_event(client, raw)
        save_finding(conn, event_id, result, MODEL)
        conn.commit()
        print(f"  {raw['eventName']}: {result.severity.upper()}")

print("Done")