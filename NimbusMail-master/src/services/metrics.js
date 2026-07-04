import { Registry, Counter, Gauge, Histogram } from "prom-client";

const registry = new Registry();

export const emailsSentTotal = new Counter({
  name: "emails_sent_total",
  help: "Total emails sent by provider",
  labelNames: ["provider"],
  registers: [registry],
});

export const emailsFailedTotal = new Counter({
  name: "emails_failed_total",
  help: "Total email failures by provider and reason",
  labelNames: ["provider", "reason"],
  registers: [registry],
});

export const emailSendDuration = new Histogram({
  name: "email_send_duration_seconds",
  help: "Duration of email send operations",
  buckets: [0.1, 0.25, 0.5, 1, 2.5],
  labelNames: ["provider"],
  registers: [registry],
});

export const circuitBreakerState = new Gauge({
  name: "circuit_breaker_state",
  help: "Circuit breaker state: 0=CLOSED, 1=HALF_OPEN, 2=OPEN",
  labelNames: ["provider"],
  registers: [registry],
});

export const emailQueueDepth = new Gauge({
  name: "email_queue_depth",
  help: "Number of jobs waiting in the email queue",
  registers: [registry],
});

export const rateLimiterRejectionsTotal = new Counter({
  name: "rate_limiter_rejections_total",
  help: "Total rate-limited rejections",
  registers: [registry],
});

export const aiPersonalisationCallsTotal = new Counter({
  name: "ai_personalisation_calls_total",
  help: "AI personalisation API calls by result",
  labelNames: ["result"],
  registers: [registry],
});

export function getMetrics() {
  return registry.metrics();
}

export default registry;
