import json
from time import perf_counter
from typing import Protocol

import anthropic
from pydantic import ValidationError

from triage.db import fetch_activity
from triage.drivers import Db
from triage.triage import (
    MODEL,
    SYSTEM_PROMPT,
    TriageCall,
    TriageError,
    TriageResult,
    format_activity_line,
)

MAX_HOURS = 24
MAX_LOOKUP_ROUNDS = 4

TOOLS_PROMPT = """

Lookups:
- You can look up other activity by the same identity, or from the same IP address, near the time of this event.
- Look up activity when the event alone does not settle the severity. Skip lookups when it does.
- Use what you find as context for this event, not as findings of their own."""


def _window_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "hours": {
                "type": "integer",
                "description": f"How far before and after the event to look, from 1 to {MAX_HOURS}.",
            }
        },
        "required": ["hours"],
        "additionalProperties": False,
    }


TOOLS = [
    {
        "name": "activity_by_identity",
        "description": "Other events by the same user or role as the event being triaged, "
        "within the given number of hours before or after it.",
        "strict": True,
        "input_schema": _window_schema(),
    },
    {
        "name": "activity_from_ip",
        "description": "Other events from the same source IP address as the event being triaged, "
        "within the given number of hours before or after it.",
        "strict": True,
        "input_schema": _window_schema(),
    },
]

_TOOL_KINDS = {"activity_by_identity": "identity", "activity_from_ip": "ip"}


class Lookups(Protocol):
    def activity(self, by: str, hours: int) -> list[dict]: ...


class DbLookups:
    def __init__(self, db: Db, event_id: str):
        self.db = db
        self.event_id = event_id

    def activity(self, by: str, hours: int) -> list[dict]:
        return fetch_activity(self.db, self.event_id, by, hours)


def format_activity(rows: list[dict]) -> str:
    if not rows:
        return "No other activity found."
    return "\n".join(format_activity_line(r) for r in rows)


def _run_tool(lookups: Lookups, name: str, tool_input: dict) -> tuple[str, bool]:
    kind = _TOOL_KINDS.get(name)
    if kind is None:
        return f"Unknown tool: {name}", True
    # Strict tool use guarantees an integer; the range is checked here.
    hours = min(max(int(tool_input["hours"]), 1), MAX_HOURS)
    return format_activity(lookups.activity(kind, hours)), False


def _as_param(block) -> dict:
    if block.type == "tool_use":
        return {"type": "tool_use", "id": block.id, "name": block.name, "input": block.input}
    return {"type": "text", "text": block.text}


def triage_with_tools(
    client: anthropic.Anthropic,
    event: dict,
    lookups: Lookups,
    max_rounds: int = MAX_LOOKUP_ROUNDS,
) -> TriageCall:
    messages: list[dict] = [
        {"role": "user", "content": "Triage this CloudTrail event:\n\n" + json.dumps(event, indent=2)}
    ]
    input_tokens = 0
    output_tokens = 0
    used: list[str] = []
    start = perf_counter()

    for round_number in range(max_rounds + 1):
        # After max_rounds of lookups, no more tools: the model must answer.
        tool_choice = {"type": "none"} if round_number == max_rounds else {"type": "auto"}
        try:
            response = client.messages.parse(
                model=MODEL,
                max_tokens=1024,
                system=SYSTEM_PROMPT + TOOLS_PROMPT,
                messages=messages,
                tools=TOOLS,
                tool_choice=tool_choice,
                output_format=TriageResult,
            )
        except ValidationError as error:
            raise TriageError(f"response did not match the schema: {error}") from error

        input_tokens += response.usage.input_tokens
        output_tokens += response.usage.output_tokens

        if response.stop_reason != "tool_use":
            if response.parsed_output is None:
                raise TriageError(f"no usable result (stop reason: {response.stop_reason})")
            return TriageCall(
                result=response.parsed_output,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                seconds=perf_counter() - start,
                lookups=used,
            )

        messages.append({"role": "assistant", "content": [_as_param(b) for b in response.content]})
        results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            text, is_error = _run_tool(lookups, block.name, block.input)
            used.append(f"{block.name}({block.input.get('hours')}h)")
            results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": text, "is_error": is_error}
            )
        messages.append({"role": "user", "content": results})

    raise TriageError("the model kept requesting lookups after they were turned off")