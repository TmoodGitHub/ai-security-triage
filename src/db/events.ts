import { db } from './client.js';
import type { NormalizedEvent } from '../ingest/types.js';

const INSERT_EVENT = `
    INSERT INTO events (
        event_id, event_time, event_source, event_name, event_type, aws_region, source_ip_address, caller_account_id, target_account_id, principal_id, user_agent, user_type, user_name, user_arn, success, error_code, error_message, raw
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) ON CONFLICT (event_id) DO NOTHING
`;

export async function saveEvents(
  events: NormalizedEvent[],
): Promise<number> {
  return db.transaction(async (tx) => {
    let inserted = 0;
    for (const event of events) {
      const result = await tx.query(INSERT_EVENT, [
        event.eventID,
        event.eventTime,
        event.eventSource,
        event.eventName,
        event.eventType,
        event.awsRegion,
        event.sourceIPAddress,
        event.callerAccountId,
        event.targetAccountId,
        event.principalId,
        event.userAgent,
        event.userType,
        event.userName,
        event.userArn,
        event.success,
        event.errorCode,
        event.errorMessage,
        JSON.stringify(event.raw),
      ]);
      inserted += result.rowCount;
    }
    return inserted;
  });
}
