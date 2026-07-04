import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { redisConnection } from '../db/redis';
import { createEmailQueue, EMAIL_QUEUE } from '../queue/email.queue';
import { asyncHandler } from '../middleware/async-handler';

const router = Router();

router.get(
  '/summary',
  asyncHandler(async (_req: Request, res: Response) => {
    const emailQueue = createEmailQueue();

    const [pgResult, waitingCount, activeProvider, circuitState, aiEnabled] = await Promise.all([
      pool.query(`
        SELECT
          COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0)::int AS pending,
          COALESCE(COUNT(*) FILTER (WHERE status = 'sending'), 0)::int AS sending,
          COALESCE(COUNT(*) FILTER (WHERE status = 'sent'), 0)::int AS sent,
          COALESCE(COUNT(*) FILTER (WHERE status = 'failed'), 0)::int AS failed,
          ROUND(
            CASE
              WHEN COUNT(*) > 0
              THEN COUNT(*) FILTER (WHERE status = 'sent')::numeric / COUNT(*) * 100
              ELSE 0
            END, 2
          ) AS delivery_rate
        FROM jobs
      `),
      emailQueue.getWaitingCount(),
      pool.query(`
        SELECT
          CASE
            WHEN EXISTS (SELECT 1 FROM pg_settings WHERE name = 'sendgrid_api_key' AND setting != '')
            THEN 'SendGrid'
            WHEN $1::text != ''
            THEN 'Gmail'
            ELSE 'None'
          END AS provider
      `, [process.env.GMAIL_USER || '']),
      redisConnection.get('circuit:sendgrid')
        .then(v => v === 'open' ? 'open' : 'closed'),
      Promise.resolve(process.env.AI_PERSONALISATION_ENABLED === 'true' ? 'enabled' : 'disabled'),
    ]);

    const stats = pgResult.rows[0];
    const providerResult = activeProvider.rows[0];

    res.json({
      jobs: {
        pending: stats.pending,
        sending: stats.sending,
        sent: stats.sent,
        failed: stats.failed,
        total: stats.pending + stats.sending + stats.sent + stats.failed,
        deliveryRate: stats.delivery_rate,
      },
      queue: {
        name: EMAIL_QUEUE,
        waiting: waitingCount,
      },
      circuitBreaker: {
        state: circuitState,
        provider: providerResult?.provider || 'None',
      },
      aiPersonalisation: aiEnabled,
    });

    await emailQueue.close();
  }),
);

router.get(
  '/hourly',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT
        DATE_TRUNC('hour', sent_at) AS hour,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM jobs
      WHERE sent_at >= NOW() - INTERVAL '24 hours'
      GROUP BY DATE_TRUNC('hour', sent_at)
      ORDER BY hour ASC
    `);

    res.json(
      result.rows.map((row) => ({
        hour: row.hour.toISOString(),
        sent: row.sent,
        failed: row.failed,
      })),
    );
  }),
);

router.get(
  '/providers',
  asyncHandler(async (_req: Request, res: Response) => {
    const circuitState = await redisConnection.get('circuit:sendgrid');
    const sendgridKey = process.env.SENDGRID_API_KEY;
    const gmailUser = process.env.GMAIL_USER;

    if (circuitState === 'open') {
      res.json({ primary: 'Gmail', fallback: 'SendGrid', status: 'failover' });
    } else if (sendgridKey) {
      res.json({ primary: 'SendGrid', fallback: 'Gmail', status: 'healthy' });
    } else if (gmailUser) {
      res.json({ primary: 'Gmail', fallback: 'SendGrid', status: 'healthy' });
    } else {
      res.json({ primary: 'None', fallback: 'None', status: 'unconfigured' });
    }
  }),
);

router.get(
  '/failures',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(`
      SELECT
        j.id,
        r.email AS "recipientEmail",
        c.name AS "campaignName",
        j.last_error AS error,
        j.created_at AS "failedAt"
      FROM jobs j
      JOIN recipients r ON r.id = j.recipient_id
      JOIN campaigns c ON c.id = j.campaign_id
      WHERE j.status = 'failed'
      ORDER BY j.created_at DESC
      LIMIT 10
    `);

    res.json(result.rows);
  }),
);

export default router;
