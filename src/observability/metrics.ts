import client from 'prom-client';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';

export const registry = client.register;

export const emailsSentTotal = new client.Counter({
  name: 'emails_sent_total',
  help: 'Total number of emails sent successfully',
  labelNames: ['provider'],
});

export const emailsFailedTotal = new client.Counter({
  name: 'emails_failed_total',
  help: 'Total number of failed email sends',
  labelNames: ['provider'],
});

export const emailSendDurationSeconds = new client.Histogram({
  name: 'email_send_duration_seconds',
  help: 'Duration of email send operations',
  labelNames: ['provider'],
  buckets: [0.1, 0.5, 1, 2, 5],
});

export const queueDepth = new client.Gauge({
  name: 'queue_depth',
  help: 'Number of jobs waiting in the email queue',
});

export const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state: 0=closed, 1=open, 2=half-open',
});

export const rateLimiterRejectionsTotal = new client.Counter({
  name: 'rate_limiter_rejections_total',
  help: 'Total rate-limited rejections',
});

export const aiPersonalisationCallsTotal = new client.Counter({
  name: 'ai_personalisation_calls_total',
  help: 'AI personalisation API calls by result',
  labelNames: ['result'],
});

client.collectDefaultMetrics();

export async function pollQueueDepth(emailQueue: Queue): Promise<void> {
  try {
    const count = await emailQueue.getWaitingCount();
    queueDepth.set(count);
  } catch {
    // ignore polling errors
  }
}

export async function pollCircuitBreakerState(redis: Redis): Promise<void> {
  try {
    const state = await redis.get('circuit:sendgrid');
    const halfOpen = await redis.exists('circuit:sendgrid:half-open');
    if (state === 'open') {
      circuitBreakerState.set(1);
    } else if (halfOpen) {
      circuitBreakerState.set(2);
    } else {
      circuitBreakerState.set(0);
    }
  } catch {
    // ignore polling errors
  }
}

export { client };
