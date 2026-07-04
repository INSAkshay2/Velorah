import { Worker } from "bullmq";
import Redis from "ioredis";
import { logger } from "../utils/logger.js";
import { markAsSent, closeIdempotencyClient } from "../services/idempotency.js";

// Separate Redis connection for the consumer so the worker never blocks
// a producer that might be running in the same process.
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const processor = async (job) => {
  const { campaignId, to, subject, html } = job.data ?? {};

  // ── Idempotency guard ──
  // Before any send attempt, check whether this (campaignId, email)
  // pair has already been processed.  markAsSent is atomic (SET NX) so
  // concurrent workers cannot both see "not sent" and both send.
  if (campaignId && to) {
    const firstTime = await markAsSent(campaignId, to);
    if (!firstTime) {
      logger.info("Duplicate skipped — already sent", {
        campaignId,
        email: to,
        jobId: job.id,
      });
      return { status: "duplicate", reason: "already sent" };
    }
  }

  logger.info("Worker picked up job", { jobId: job.id, data: job.data });
  // TODO: delegate to emailProvider.sendWithFailover(job.data) once the sending layer is ready
  return { status: "logged" };
};

export const emailWorker = new Worker("emailQueue", processor, { connection });

export async function closeEmailWorker() {
  await emailWorker.close();
  await connection.quit();
  await closeIdempotencyClient();
}
