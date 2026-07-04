"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.client = exports.aiPersonalisationCallsTotal = exports.rateLimiterRejectionsTotal = exports.circuitBreakerState = exports.queueDepth = exports.emailSendDurationSeconds = exports.emailsFailedTotal = exports.emailsSentTotal = exports.registry = void 0;
exports.pollQueueDepth = pollQueueDepth;
exports.pollCircuitBreakerState = pollCircuitBreakerState;
const prom_client_1 = __importDefault(require("prom-client"));
exports.client = prom_client_1.default;
exports.registry = prom_client_1.default.register;
exports.emailsSentTotal = new prom_client_1.default.Counter({
    name: 'emails_sent_total',
    help: 'Total number of emails sent successfully',
    labelNames: ['provider'],
});
exports.emailsFailedTotal = new prom_client_1.default.Counter({
    name: 'emails_failed_total',
    help: 'Total number of failed email sends',
    labelNames: ['provider'],
});
exports.emailSendDurationSeconds = new prom_client_1.default.Histogram({
    name: 'email_send_duration_seconds',
    help: 'Duration of email send operations',
    labelNames: ['provider'],
    buckets: [0.1, 0.5, 1, 2, 5],
});
exports.queueDepth = new prom_client_1.default.Gauge({
    name: 'queue_depth',
    help: 'Number of jobs waiting in the email queue',
});
exports.circuitBreakerState = new prom_client_1.default.Gauge({
    name: 'circuit_breaker_state',
    help: 'Circuit breaker state: 0=closed, 1=open, 2=half-open',
});
exports.rateLimiterRejectionsTotal = new prom_client_1.default.Counter({
    name: 'rate_limiter_rejections_total',
    help: 'Total rate-limited rejections',
});
exports.aiPersonalisationCallsTotal = new prom_client_1.default.Counter({
    name: 'ai_personalisation_calls_total',
    help: 'AI personalisation API calls by result',
    labelNames: ['result'],
});
prom_client_1.default.collectDefaultMetrics();
async function pollQueueDepth(emailQueue) {
    try {
        const count = await emailQueue.getWaitingCount();
        exports.queueDepth.set(count);
    }
    catch {
        // ignore polling errors
    }
}
async function pollCircuitBreakerState(redis) {
    try {
        const state = await redis.get('circuit:sendgrid');
        const halfOpen = await redis.exists('circuit:sendgrid:half-open');
        if (state === 'open') {
            exports.circuitBreakerState.set(1);
        }
        else if (halfOpen) {
            exports.circuitBreakerState.set(2);
        }
        else {
            exports.circuitBreakerState.set(0);
        }
    }
    catch {
        // ignore polling errors
    }
}
//# sourceMappingURL=metrics.js.map