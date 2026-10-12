# Eval log

Eval set: hand-labeled CloudTrail events in `eval_cases.json`. New rows are added by `python -m triage.evals --log "what changed"`.

**Prompt** is a fingerprint of the system prompt: runs with the same value used the same prompt. Early runs were logged by hand, before fingerprints existed.

| Date       | Model            | Prompt | Exact       | Within one  | Change                                                                                                                                |
| ---------- | ---------------- | ------ | ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-11 | claude-haiku-4-5 | (none) | 10/16 (62%) | 14/16 (88%) | Baseline: original system prompt                                                                                                      |
| 2026-10-11 | claude-haiku-4-5 | (none) | 8/16 (50%)  | 14/16 (88%) | Added rule that denied attempts signal intent. Fixed #16 but caused over-rating of successful actions                                 |
| 2026-10-11 | claude-haiku-4-5 | (none) | 11/16 (69%) | 14/16 (88%) | Added severity rubric, scoped denied-attempt rule, rules for reading success and MFAUsed, and that missing approvals are not evidence |
| 2026-10-11 | claude-haiku-4-5 | `814e2a7d` | 11/16 (69%) | 15/16 (94%) | Trial run |
| 2026-10-11 22:29 | claude-haiku-4-5 | `814e2a7d` | 12/16 (75%) | 15/16 (94%) | 2nd run, datetime change |
| 2026-10-11 22:33 | claude-haiku-4-5 | `814e2a7d` | 12/16 (75%) | 15/16 (94%) | Confirmation run, no changes |
| 2026-10-11 22:39 | claude-haiku-4-5 | `814e2a7d` | 11/16 (69%) | 15/16 (94%) | Confirmation run, no changes |
| 2026-10-11 22:41 | claude-haiku-4-5 | `814e2a7d` | 11/16 (69%) | 15/16 (94%) | Confirmation run, no changes |
| 2026-10-12 00:53 | claude-haiku-4-5 | `53fd66d8` | 13/16 (81%) | 15/16 (94%) | [no context] Prompt with related-events rules |
| 2026-10-12 00:56 | claude-haiku-4-5 | `53fd66d8` | 8/16 (50%) | 13/16 (81%) | [with context] Prompt with related-events rules |
