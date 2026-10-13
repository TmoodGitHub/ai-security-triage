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
        f.created_at AS "createdAt",
        e.raw AS "event"
    FROM findings f
    JOIN events e ON e.event_id = f.event_id
    WHERE f.id = $1
`;

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
}
