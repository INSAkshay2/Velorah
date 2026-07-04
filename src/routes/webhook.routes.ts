import { Router, Request, Response } from 'express';
import { EventWebhook } from '@sendgrid/eventwebhook';
import pool from '../db/pool';
import { redisConnection } from '../db/redis';

const router = Router();

interface SendGridEvent {
  email: string;
  event: string;
  sg_event_id?: string;
  timestamp?: number;
}

const WEBHOOK_PROCESSED_PREFIX = 'webhook:processed:';
const IDEMPOTENCY_TTL_SEC = 86400;

const eventStatusMap: Record<string, string> = {
  delivered: 'delivered',
  bounce: 'bounced',
  spamreport: 'spam',
  open: 'opened',
  click: 'clicked',
};

router.post('/sendgrid', async (req: Request, res: Response) => {
  const secret = process.env.SENDGRID_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('SENDGRID_WEBHOOK_SECRET not set, skipping signature verification');
  } else {
    const ew = new EventWebhook();
    const publicKey = ew.convertPublicKeyToECDSA(secret);
    const payload = (req as any).rawBody;
    const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;

    if (!signature || !timestamp) {
      res.status(401).json({ error: 'Missing webhook signature headers' });
      return;
    }

    const isValid = ew.verifySignature(publicKey, payload, signature, timestamp);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
  }

  const events: SendGridEvent[] = req.body;

  if (!Array.isArray(events)) {
    res.status(200).json({ received: 0 });
    return;
  }

  for (const event of events) {
    if (!event.email || !event.event) continue;

    const eventId = event.sg_event_id ?? `${event.email}:${event.event}:${event.timestamp ?? Date.now()}`;
    const redisKey = `${WEBHOOK_PROCESSED_PREFIX}${eventId}`;

    const alreadyProcessed = await redisConnection.get(redisKey);
    if (alreadyProcessed) continue;

    const status = eventStatusMap[event.event];
    if (!status) continue;

    const query =
      event.event === 'open'
        ? `UPDATE recipients SET status = $1, opened_at = to_timestamp($2) WHERE email = $3`
        : `UPDATE recipients SET status = $1 WHERE email = $2`;

    const params =
      event.event === 'open'
        ? [status, event.timestamp ?? Math.floor(Date.now() / 1000), event.email]
        : [status, event.email];

    await pool.query(query, params);

    await redisConnection.setex(redisKey, IDEMPOTENCY_TTL_SEC, '1');
  }

  res.json({ received: events.length });
});

export default router;
