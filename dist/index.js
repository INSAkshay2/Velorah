"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const campaign_routes_1 = __importDefault(require("./routes/campaign.routes"));
const webhook_routes_1 = __importDefault(require("./routes/webhook.routes"));
const stats_routes_1 = __importDefault(require("./routes/stats.routes"));
const email_worker_1 = require("./workers/email.worker");
const redis_1 = require("./db/redis");
const sendgrid_provider_1 = require("./providers/sendgrid.provider");
const nodemailer_provider_1 = require("./providers/nodemailer.provider");
const mailgun_provider_1 = require("./providers/mailgun.provider");
const providerRouter_1 = require("./providers/providerRouter");
const email_queue_1 = require("./queue/email.queue");
const metrics_1 = require("./observability/metrics");
const app = (0, express_1.default)();
const PORT = process.env.PORT ?? 3000;
app.use(express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString();
    },
}));
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metrics_1.client.register.contentType);
    res.send(await metrics_1.client.register.metrics());
});
app.use('/campaigns', campaign_routes_1.default);
app.use('/webhooks', webhook_routes_1.default);
app.use('/api/stats', stats_routes_1.default);
app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
function startWorker() {
    const sendgridKey = process.env.SENDGRID_API_KEY;
    const sendgridFrom = process.env.SENDGRID_FROM_EMAIL;
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASS;
    const gmailFrom = process.env.GMAIL_FROM_EMAIL;
    const mailgunKey = process.env.MAILGUN_API_KEY;
    const mailgunDomain = process.env.MAILGUN_DOMAIN;
    const mailgunFrom = process.env.MAILGUN_FROM_EMAIL;
    let primary;
    let primaryName;
    if (sendgridKey && sendgridFrom) {
        primary = new sendgrid_provider_1.SendGridProvider(sendgridKey, sendgridFrom);
        primaryName = 'SendGrid';
    }
    else if (gmailUser && gmailPass && gmailFrom) {
        primary = new nodemailer_provider_1.NodemailerProvider(gmailFrom, gmailUser, gmailPass);
        primaryName = 'Gmail';
    }
    else {
        console.warn('No email provider configured (SendGrid or Gmail). Worker not started.');
        return;
    }
    const fallback = mailgunKey && mailgunDomain && mailgunFrom
        ? new mailgun_provider_1.MailgunProvider(mailgunKey, mailgunDomain, mailgunFrom)
        : primary;
    const router = new providerRouter_1.ProviderRouter(redis_1.redisConnection, primary, fallback, primaryName, mailgunFrom ? 'Mailgun' : primaryName, metrics_1.emailsSentTotal, metrics_1.emailsFailedTotal, metrics_1.emailSendDurationSeconds);
    (0, email_worker_1.createEmailWorker)(router);
    console.log(`Email worker started (primary: ${primaryName}), listening for jobs`);
    const emailQueue = (0, email_queue_1.createEmailQueue)();
    setInterval(async () => {
        await (0, metrics_1.pollQueueDepth)(emailQueue);
        await (0, metrics_1.pollCircuitBreakerState)(redis_1.redisConnection);
    }, 10000);
}
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startWorker();
});
exports.default = app;
//# sourceMappingURL=index.js.map