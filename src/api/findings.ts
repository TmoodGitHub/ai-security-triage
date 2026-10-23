import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];

interface ListFindingsQuery {
  severity?: string;
  status?: string;
  limit: number;
}

const LIST_FINDINGS = `
    SELECT
        f.id,
        f.event_id AS "eventId",
        f.severity,
        f.summary,
        f.review_status AS "reviewStatus",
        f.classification,
        f.model,
        f.created_at AS "createdAt",
        e.event_name AS "eventName",
        e.event_time AS "eventTime",
        COALESCE(e.user_name, e.user_arn, e.user_type) AS "who",
        e.source_ip_address AS "sourceIpAddress"
    FROM findings f
    JOIN events e ON e.event_id = f.event_id
    WHERE ($1::text IS NULL OR f.severity = $1)
        AND ($2::text IS NULL OR f.review_status = $2)
    ORDER BY
        CASE f.severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
        f.created_at DESC
    LIMIT $3
`;

const GET_FINDING = `
    SELECT
        f.id,
        f.event_id AS "eventId",
        f.severity,
        f.summary,
        f.reasoning,
        f.evidence,
        f.unknowns,
        f.model,
        f.review_status AS "reviewStatus",
        f.classification,
        f.reviewed_at AS "reviewedAt",
        f.reviewed_by AS "reviewedBy",
        f.review_note AS "reviewNote",
        f.created_at AS "createdAt",
        e.raw AS "event"
    FROM findings f
    JOIN events e ON e.event_id = f.event_id
    WHERE f.id = $1
`;

const REVIEW_FINDING = `
    UPDATE findings
    SET review_status = $2, classification = $3,  review_note = $4, reviewed_by = $5, reviewed_at = now()
    WHERE id = $1 AND review_status = 'pending'
    RETURNING
        id,
        review_status AS "reviewStatus",
        classification,
        reviewed_at AS "reviewedAt",
        reviewed_by AS "reviewedBy",
        review_note AS "reviewNote"
`;

const FINDING_SUMMARY = `
  SELECT
    count(*) FILTER (WHERE review_status = 'pending')::int AS pending,
    count(*) FILTER (WHERE review_status = 'approved')::int AS approved,
    count(*) FILTER (WHERE review_status = 'rejected')::int AS rejected,
    count(*) FILTER (WHERE review_status = 
    'pending' AND severity = 'critical')::int AS "pendingCritical",
    count(*) FILTER (WHERE review_status = 
    'pending' AND severity = 'high')::int AS "pendingHigh",
    count(*) FILTER (WHERE review_status = 
    'pending' AND severity = 'medium')::int AS "pendingMedium",
    count(*) FILTER (WHERE review_status = 
    'pending' AND severity = 'low')::int AS "pendingLow"
  FROM findings
`;

interface ReviewBody {
  decision: 'approved' | 'rejected';
  classification:
    | 'true_positive'
    | 'benign_positive'
    | 'false_positive';
  note: string;
}

export function registerFindingsRoutes(
  app: FastifyInstance,
  db: Pool,
) {
  app.get<{ Querystring: ListFindingsQuery }>(
    '/findings',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            severity: {
              type: 'string',
              enum: SEVERITIES,
            },
            status: {
              type: 'string',
              enum: REVIEW_STATUSES,
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 200,
              default: 50,
            },
          },
          additionalProperties: false,
        },
      },
    },
    async (request) => {
      const { severity, status, limit } = request.query;
      const result = await db.query(LIST_FINDINGS, [
        severity ?? null,
        status ?? null,
        limit,
      ]);
      return { findings: result.rows };
    },
  );

  app.get('/findings/summary', async () => {
    const result = await db.query(FINDING_SUMMARY);
    const row = result.rows[0];
    const reviewed = row.approved + row.rejected;

    return {
      pending: row.pending,
      approved: row.approved,
      rejected: row.rejected,
      pendingBySeverity: {
        critical: row.pendingCritical,
        high: row.pendingHigh,
        medium: row.pendingMedium,
        low: row.pendingLow,
      },
      agreementRate:
        reviewed === 0 ? null : row.approved / reviewed,
    };
  });

  app.get<{ Params: { id: number } }>(
    '/findings/:id',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer', minimum: 1 },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const result = await db.query(GET_FINDING, [
        request.params.id,
      ]);

      if (result.rows.length === 0) {
        return reply
          .code(404)
          .send({ error: 'Finding not found' });
      }

      return result.rows[0];
    },
  );

  app.post<{ Params: { id: number }; Body: ReviewBody }>(
    '/findings/:id/review',
    {
      schema: {
        params: {
          type: 'object',
          properties: {
            id: { type: 'integer', minimum: 1 },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            decision: {
              type: 'string',
              enum: ['approved', 'rejected'],
            },
            classification: {
              type: 'string',
              enum: [
                'true_positive',
                'benign_positive',
                'false_positive',
              ],
            },
            note: {
              type: 'string',
              minLength: 1,
              maxLength: 2000,
              pattern: '\\S',
            },
          },
          required: ['decision', 'classification', 'note'],
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { decision, classification, note } =
        request.body;

      const result = await db.query(REVIEW_FINDING, [
        id,
        decision,
        classification,
        note,
        request.user?.subject,
      ]);
      if (result.rows.length > 0) {
        return result.rows[0];
      }

      const existing = await db.query(
        'SELECT review_status FROM findings WHERE id = $1',
        [id],
      );
      if (existing.rows.length === 0) {
        return reply
          .code(404)
          .send({ error: 'Finding not found' });
      }
      return reply.code(409).send({
        error: `Finding was already ${existing.rows[0].review_status}`,
      });
    },
  );
}
