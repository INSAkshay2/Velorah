import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../middleware/async-handler';
import { createCampaignSchema, type CreateCampaignInput } from '../schemas/campaign.schema';
import { createEmailQueue } from '../queue/email.queue';

const router = Router();
const emailQueue = createEmailQueue();

router.post(
  '/',
  validate(createCampaignSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { name, subject, body, recipients } = req.body as CreateCampaignInput;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const campaignResult = await client.query(
        `INSERT INTO campaigns (name, subject, body) VALUES ($1, $2, $3) RETURNING *`,
        [name, subject, body],
      );
      const campaign = campaignResult.rows[0];

      const recipientValues = recipients
        .map(
          (r) =>
            `(${campaign.id}, '${r.email.replace(/'/g, "''")}', '${r.name.replace(/'/g, "''")}')`,
        )
        .join(', ');

      await client.query(
        `INSERT INTO recipients (campaign_id, email, name) VALUES ${recipientValues}`,
      );

      const recipientsResult = await client.query(
        `SELECT id, email, name, status, created_at FROM recipients WHERE campaign_id = $1`,
        [campaign.id],
      );

      await client.query('COMMIT');

      res.status(201).json({ ...campaign, recipients: recipientsResult.rows });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to create campaign:', err);
      res.status(500).json({ error: 'Failed to create campaign' });
    } finally {
      client.release();
    }
  }),
);

router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const result = await pool.query(
      'SELECT id, name, subject, body, status, created_at FROM campaigns ORDER BY created_at DESC',
    );
    res.json(result.rows);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const campaignResult = await pool.query(
      'SELECT id, name, subject, body, status, created_at FROM campaigns WHERE id = $1',
      [id],
    );

    if (campaignResult.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const statsResult = await pool.query(
      `SELECT status, COUNT(*)::int AS count FROM recipients WHERE campaign_id = $1 GROUP BY status`,
      [id],
    );

    const campaign = campaignResult.rows[0];
    campaign.recipientStats = statsResult.rows.reduce(
      (acc: Record<string, number>, row: { status: string; count: number }) => {
        acc[row.status] = row.count;
        return acc;
      },
      {} as Record<string, number>,
    );

    res.json(campaign);
  }),
);

router.get(
  '/:id/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const campaignResult = await pool.query(
      'SELECT id FROM campaigns WHERE id = $1',
      [id],
    );

    if (campaignResult.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const result = await pool.query(
      `WITH rec AS (
        SELECT
          COUNT(*)::int AS total_recipients,
          COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered,
          COUNT(*) FILTER (WHERE status = 'bounced')::int AS bounced,
          COUNT(*) FILTER (WHERE status = 'opened')::int AS opened,
          COUNT(*) FILTER (WHERE status = 'spam')::int AS spam
        FROM recipients
        WHERE campaign_id = $1
      ),
      jb AS (
        SELECT
          COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
          AVG(EXTRACT(EPOCH FROM (sent_at - created_at)) * 1000)::numeric AS avg_send_latency_ms
        FROM jobs
        WHERE campaign_id = $1
      )
      SELECT
        rec.total_recipients,
        COALESCE(jb.sent, 0)::int AS sent,
        rec.delivered,
        rec.bounced,
        rec.opened,
        rec.spam,
        COALESCE(jb.failed, 0)::int AS failed,
        ROUND(CASE WHEN rec.total_recipients > 0 THEN rec.delivered::numeric / rec.total_recipients * 100 ELSE 0 END, 2) AS delivery_rate,
        ROUND(CASE WHEN rec.delivered > 0 THEN rec.opened::numeric / rec.delivered * 100 ELSE 0 END, 2) AS open_rate,
        jb.avg_send_latency_ms
      FROM rec, jb`,
      [id],
    );

    res.json(result.rows[0]);
  }),
);

router.post(
  '/:id/send',
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const campaignResult = await pool.query(
      'SELECT id, name, subject, body, status FROM campaigns WHERE id = $1',
      [id],
    );

    if (campaignResult.rows.length === 0) {
      res.status(404).json({ error: 'Campaign not found' });
      return;
    }

    const campaign = campaignResult.rows[0];

    const recipientsResult = await pool.query(
      `SELECT id, email, name FROM recipients WHERE campaign_id = $1 AND status = 'pending'`,
      [id],
    );

    if (recipientsResult.rows.length === 0) {
      res.status(400).json({ error: 'No pending recipients' });
      return;
    }

    const recipients = recipientsResult.rows;

    const insertedJobs: { id: number; recipientId: number }[] = [];
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const recipient of recipients) {
        const jobResult = await client.query(
          `INSERT INTO jobs (campaign_id, recipient_id, status) VALUES ($1, $2, 'queued') RETURNING id`,
          [campaign.id, recipient.id],
        );
        insertedJobs.push({ id: jobResult.rows[0].id, recipientId: recipient.id });
      }

      await client.query(`UPDATE campaigns SET status = 'sending' WHERE id = $1`, [campaign.id]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to create job records:', err);
      res.status(500).json({ error: 'Failed to queue campaign' });
      return;
    } finally {
      client.release();
    }

    for (const job of insertedJobs) {
      const recipient = recipients.find((r) => r.id === job.recipientId)!;
      await emailQueue.add(`job-${job.id}`, {
        jobId: job.id,
        campaignId: campaign.id,
        recipientId: job.recipientId,
        to: recipient.email,
        subject: campaign.subject,
        html: campaign.body,
        recipientName: recipient.name,
        campaignTopic: campaign.name,
      });
    }

    res.json({ message: 'Campaign queued', jobCount: insertedJobs.length });
  }),
);

export default router;
