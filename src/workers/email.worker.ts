import { Worker } from 'bullmq';
import pool from '../db/pool';
import { EMAIL_QUEUE, type EmailJobData } from '../queue/email.queue';
import type { EmailProvider } from '../providers/email-provider.interface';
import { markAsSent } from '../services/idempotency';
import { SlidingWindowRateLimiter } from '../services/rateLimiter';
import { personalise } from '../services/aiPersonaliser';
import { redisConnection } from '../db/redis';

const BACKOFF_BASE = 1000;
const BACKOFF_CAP = 30000;

const rateLimiter = new SlidingWindowRateLimiter(redisConnection, {
  windowMs: 60000,
  max: 100,
});

function computeBackoffDelay(attemptsMade: number): number {
  const exponential = Math.min(BACKOFF_CAP, BACKOFF_BASE * Math.pow(2, attemptsMade));
  const jitter = Math.floor(Math.random() * 1000);
  return exponential + jitter;
}

export function createEmailWorker(provider: EmailProvider): Worker {
  const worker = new Worker<EmailJobData>(
    EMAIL_QUEUE,
    async (job) => {
      console.log(`Worker picked up job ${job.id} for recipient ${job.data.recipientId}`);
      const { jobId, campaignId, to, subject, html, recipientName, campaignTopic } = job.data;

      console.log('Step 1: Idempotency check for job', jobId);
      const alreadySent = !(await markAsSent(campaignId, to));
      if (alreadySent) {
        console.log(`Job ${job.id} already sent (idempotency), skipping`);
        await pool.query(
          `UPDATE jobs SET status = 'sent', sent_at = NOW(), attempts = attempts + 1 WHERE id = $1`,
          [jobId],
        );
        return;
      }

      console.log('Step 2: Rate limiter check');
      const { allowed } = await rateLimiter.isAllowed('send');
      if (!allowed) {
        throw new Error('Rate limited — will retry with backoff');
      }

      console.log('Step 3: AI personalisation check');
      let finalSubject = subject;
      if (recipientName && campaignTopic) {
        finalSubject = await personalise({
          recipientName,
          recipientEmail: to,
          campaignTopic,
          baseSubject: subject,
        });
      }

      console.log('Step 4: Sending email to', to);
      try {
        await provider.send(to, finalSubject, html);

        await pool.query(
          `UPDATE jobs SET status = 'sent', sent_at = NOW(), attempts = attempts + 1 WHERE id = $1`,
          [jobId],
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';

        await pool.query(
          `UPDATE jobs SET status = 'failed', attempts = attempts + 1, last_error = $1 WHERE id = $2`,
          [message, jobId],
        );

        throw err;
      }
    },
    {
      connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
      concurrency: 5,
      settings: {
        backoffStrategy: computeBackoffDelay,
      },
    },
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    if (!job) return;

    if (job.attemptsMade < 5) {
      const delay = computeBackoffDelay(job.attemptsMade);
      console.log(
        `Job ${job.id} failed (attempt ${job.attemptsMade}/5), retrying in ${delay}ms: ${err.message}`,
      );
    } else {
      console.log(`Job ${job.id} failed after ${job.attemptsMade} attempts, no more retries`);
    }
  });

  return worker;
}
