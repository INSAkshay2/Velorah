"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmailWorker = createEmailWorker;
const bullmq_1 = require("bullmq");
const pool_1 = __importDefault(require("../db/pool"));
const email_queue_1 = require("../queue/email.queue");
const idempotency_1 = require("../services/idempotency");
const rateLimiter_1 = require("../services/rateLimiter");
const aiPersonaliser_1 = require("../services/aiPersonaliser");
const redis_1 = require("../db/redis");
const BACKOFF_BASE = 1000;
const BACKOFF_CAP = 30000;
const rateLimiter = new rateLimiter_1.SlidingWindowRateLimiter(redis_1.redisConnection, {
    windowMs: 60000,
    max: 100,
});
function computeBackoffDelay(attemptsMade) {
    const exponential = Math.min(BACKOFF_CAP, BACKOFF_BASE * Math.pow(2, attemptsMade));
    const jitter = Math.floor(Math.random() * 1000);
    return exponential + jitter;
}
function createEmailWorker(provider) {
    const worker = new bullmq_1.Worker(email_queue_1.EMAIL_QUEUE, async (job) => {
        console.log(`Worker picked up job ${job.id} for recipient ${job.data.recipientId}`);
        const { jobId, campaignId, to, subject, html, recipientName, campaignTopic } = job.data;
        console.log('Step 1: Idempotency check for job', jobId);
        const alreadySent = !(await (0, idempotency_1.markAsSent)(campaignId, to));
        if (alreadySent) {
            console.log(`Job ${job.id} already sent (idempotency), skipping`);
            await pool_1.default.query(`UPDATE jobs SET status = 'sent', sent_at = NOW(), attempts = attempts + 1 WHERE id = $1`, [jobId]);
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
            finalSubject = await (0, aiPersonaliser_1.personalise)({
                recipientName,
                recipientEmail: to,
                campaignTopic,
                baseSubject: subject,
            });
        }
        console.log('Step 4: Sending email to', to);
        try {
            await provider.send(to, finalSubject, html);
            await pool_1.default.query(`UPDATE jobs SET status = 'sent', sent_at = NOW(), attempts = attempts + 1 WHERE id = $1`, [jobId]);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            await pool_1.default.query(`UPDATE jobs SET status = 'failed', attempts = attempts + 1, last_error = $1 WHERE id = $2`, [message, jobId]);
            throw err;
        }
    }, {
        connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
        concurrency: 5,
        settings: {
            backoffStrategy: computeBackoffDelay,
        },
    });
    worker.on('completed', (job) => {
        console.log(`Job ${job.id} completed successfully`);
    });
    worker.on('failed', (job, err) => {
        if (!job)
            return;
        if (job.attemptsMade < 5) {
            const delay = computeBackoffDelay(job.attemptsMade);
            console.log(`Job ${job.id} failed (attempt ${job.attemptsMade}/5), retrying in ${delay}ms: ${err.message}`);
        }
        else {
            console.log(`Job ${job.id} failed after ${job.attemptsMade} attempts, no more retries`);
        }
    });
    return worker;
}
//# sourceMappingURL=email.worker.js.map