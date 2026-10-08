import json
from pathlib import Path
from typing import Literal

import anthropic
from dotenv import load_dotenv
from pydantic import BaseModel, Field

MODEL = "claude-haiku-4-5"
SYSTEM_PROMPT = """
    You are a security analyst triaging AWS CloudTrail events.

    For each event, assess how likely it is to be malicious or risky, and how much harm it could cause.

    Rules:
    - Base your judgement only on what the event shows. Do not assume facts the event does not contain.
    - If something matters but the event cannot tell you, list it under unknowns instead of guessing.
    - Routine read-only activity from a known user is usually low severity.
    - A human analyst will review your assessment before anyone acts on it.
"""

class TriageResult(BaseModel):
    severity: Literal["low","medium","high","critical"]
    summary: str = Field(description="One sentence describing what happened.")
    reasoning: str = Field(description="Why you chose this severity, in two or three sentences.")
    evidence: list[str] = Field(description="The specific fields and values from the event that support your assessment.")
    unknowns: list[str] = Field(description="Relevant things the event cannot tell you.")


def triage_event(client: anthropic.Anthropic, event: dict) -> TriageResult:
    response = client.messages.parse(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": "Triage this CloudTrail event:\n\n" + json.dumps(event, indent=2),
            }
        ],
        output_format=TriageResult,
    )
    return response.parsed_output


if __name__ == "__main__":
    load_dotenv()
    client = anthropic.Anthropic()

    events = json.loads(Path("samples/cloudtrail_sample.json").read_text())["Records"]
    for event in events[:5]:
        result = triage_event(client, event)
        print(f"{event['eventName']}: {result.severity.upper()}")
        print(f"  {result.summary}")
        print(f"  Why: {result.reasoning}")
        print(f"  Evidence: {result.evidence}")
        print(f"  Unknowns: {result.unknowns}")
        print()
    