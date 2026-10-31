import json
import os

import anthropic
import boto3

from triage.db import fetch_related_events, fetch_event_for_triage, save_finding
from triage.drivers import Db, connect
from triage.triage import MODEL, triage_event


def handle_batch(event: dict, db: Db, client: anthropic.Anthropic) -> dict:
    failures = []
    for record in event["Records"]:
        message_id = record["messageId"]
        try:
            event_id = json.loads(record["body"])["eventId"]
            raw = fetch_event_for_triage(db, event_id)
            if raw is None:
                print(json.dumps({"eventId": event_id, "skipped": "already triage or not found"}))
                continue

            related = fetch_related_events(db, event_id)
            call = triage_event(client, raw, related)
            save_finding(db, event_id, call.result, MODEL)
            print(json.dumps({
                "eventId": event_id,
                "eventName": raw.get("eventName"),
                "severity": call.result.severity,
                "related": len(related),
                "seconds": round(call.seconds, 2),
                "cost": round(call.cost, 6),
            }))
        except Exception as error:
            print(json.dumps({"messageId": message_id, "error": repr(error)}))
            failures.append({"itemIdentifier": message_id})

    return {"batchItemFailures": failures}

def _load_api_key() -> str:
    response = boto3.client("ssm").get_parameter(
        Name=os.environ["ANTHROPIC_API_KEY_PARAMETER"],
        WithDecryption=True,
    )
    return response["Parameter"]["Value"]

_db = None
_client = None

def handler(event: dict, context) -> dict:
    global _db, _client
    if _db is None:
        _db = connect("data-api")
        _client = anthropic.Anthropic(api_key=_load_api_key())
    return handle_batch(event, _db, _client)