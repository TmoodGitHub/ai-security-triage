import type { NormalizedEvent } from './types.js';

export function dedupeEvents(
  events: NormalizedEvent[],
): NormalizedEvent[] {
  const seen = new Set<string>();
  const unique: NormalizedEvent[] = [];

  for (const event of events) {
    if (seen.has(event.eventID)) {
      continue;
    }
    seen.add(event.eventID);
    unique.push(event);
  }

  return unique;
}
