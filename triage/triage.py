import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from typing import Literal

import anthropic
from dotenv import load_dotenv
from pydantic import BaseModel, Field, ValidationError

MODEL = "claude-haiku-4-5"
# US dollars per million token for MODEL. Update these if MODEL changes.
# Source: https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-10-16)
PRICE_PER_MILLION_INPUT = 1.00
PRICE_PER_MILLION_OUTPUT = 5.00
SYSTEM_PROMPT = """You are a security analyst triaging AWS CloudTrail events.

Rate each event using exactly these severity levels:
- low: Normal activity. No action needed.
- medium: Unusual or worth a look, but likely harmless or blocked. An analyst should check it when they get to it.
- high: Likely malicious, or a risky change that succeeded. Needs attention today.
- critical: Active attack, or damage to security controls. Needs attention now. Stopping, disabling, or deleting audit logging or threat detection (for example CloudTrail or GuardDuty) is critical, because it blinds the team to what happens next.

Reading the event:
- An action succeeded unless the event has an errorCode, or responseElements.ConsoleLogin is "Failure". A null responseElements does not mean the action failed; many successful actions return nothing.
- MFAUsed shows whether MFA was used in this sign-in attempt. It does not show whether MFA is enabled on the account.
- Base your judgment only on what the event shows. Do not assume facts it does not contain, such as whether an IP address is new or whether a change was approved. List those under unknowns instead.
- Events never record approvals or business justification, so their absence is not evidence of wrongdoing.

Failed and denied actions:
- Do not rate an event low just because it failed or was denied. A denied attempt shows what the caller was trying to do.
- A denied attempt at a sensitive action (creating users or access keys, changing permissions, or disabling logging or monitoring) by an identity with no plausible reason to perform it is at least high.

Related events:
- You may be given related events: other events from the same identity or the same IP address within 24 hours.
- Rate only the event being triaged. Use related events as context for it, not as findings of their own.
- Raise severit when related events show a pattern, for example several identities acting from one IP address, or failed sign-ins followed by sensitive changes.
- Lower severity when related events show the same routine activity repeating.
- If no related events are listed, judge the event on its own.

Routine read-only activity by a known user is usually low.
A human analyst will review your assessment before anyone acts on it."""

class TriageResult(BaseModel):
    severity: Literal["low","medium","high","critical"]
    summary: str = Field(description="One sentence describing what happened.")
    reasoning: str = Field(description="Why you chose this severity, in two or three sentences.")
    evidence: list[str] = Field(description="The specific fields and values from the event that support your assessment.")
    unknowns: list[str] = Field(description="Relevant things the event cannot tell you.")

class TriageError(Exception):
    """
        The model answered, but not with a usable result.
    """

@dataclass
class TriageCall:
    result: TriageResult
    input_tokens: int
    output_tokens: int
    seconds: float

    @property
    def cost(self) -> float:
        return (
            self.input_tokens * PRICE_PER_MILLION_INPUT + self.output_tokens * PRICE_PER_MILLION_OUTPUT
        ) / 1_000_000

def describe_target(event: dict) -> str | None:
    """
        A short description of what a CloudTrail event acted on, for example "bucket customer-exports".
    """
    params = event.get("requestParameters")
    if not isinstance(params, dict):
        return None

    principal = None
    for key, kind in (("userName", "user"), ("roleName", "role"), ("groupName", "group")):
        if params.get(key):
            principal = f"{kind} {params[key]}"
            break

    if params.get("policyArn"):
        policy = "policy " + params["policyArn"].rsplit("/", 1)[-1]
        return f"{policy}, {principal}" if principal else policy
    if principal:
        return principal
    if params.get("roleArn"):
        return "role " + params["roleArn"].rsplit("/", 1)[-1]
    if params.get("instanceType"):
        count = params.get("maxCount") or params.get("minCount") or 1
        return f"{count} x {params['instanceType']}"
    if event.get("eventSource") == "cloudtrail.amazonaws.com" and params.get("name"):
        return "trail " + params["name"].rsplit("/", 1)[-1]
    for key, kind in (("bucketName", "bucket"), ("functionName", "function"), ("groupId", "security group"), ("detectorId", "detector")):
        if params.get(key):
            return f"{kind} {params[key]}"
    return None

def format_related(related: list[dict]) -> str:
    if not related:
        return "Related events: none found."

    lines = ["Related events (same identity or IP, within 24 hours):"]
    for r in related:
        time = r["event_time"]
        if isinstance(time, datetime):
            time = time.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        outcome = "succeeded" if r["success"] else f"failed ({r['error_code'] or 'no error code'})"
        action = f"{r['event_name']} ({r['target']})" if r.get("target") else r["event_name"]
        lines.append(
            f"- {time}  {action} by {r['who']} from {r['source_ip_address']}, {outcome} [{r['link']}]"
        )
    return "\n".join(lines)

def triage_event(client: anthropic.Anthropic, event: dict, related: list[dict] | None = None) -> TriageCall:
    content = "Triage this CloudTrail event:\n\n" + json.dumps(event, indent=2)
    if related is not None:
        content += "\n\n" + format_related(related)

    start = perf_counter()
    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
            output_format=TriageResult
        )
    except ValidationError as error:
        raise TriageError(f"response did not match the schema: {error}") from error
    seconds = perf_counter() - start

    if response.parsed_output is None:
        raise TriageError(f"no usable result (stop reason: {response.stop_reason})")

    return TriageCall(
        result=response.parsed_output,
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
        seconds=seconds,
    )

if __name__ == "__main__":
    load_dotenv()
    client = anthropic.Anthropic()

    events = json.loads(Path("samples/cloudtrail_sample.json").read_text())["Records"]
    for event in events[:5]:
        call = triage_event(client, event)
        result = call.result
        print(f"{event['eventName']}: {result.severity.upper()}")
        print(f"  {result.summary}")
        print(f"  Why: {result.reasoning}")
        print(f"  Evidence: {result.evidence}")
        print(f"  Unknowns: {result.unknowns}")
        print(f"  {call.input_tokens} tokens in, {call.output_tokens} out, {call.seconds:.1f}s, ${call.cost:.4f}")
        print()
    