"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const eventwebhook_1 = require("@sendgrid/eventwebhook");
const pool_1 = __importDefault(require("../db/pool"));
const redis_1 = require("../db/redis");
const router = (0, express_1.Router)();
const WEBHOOK_PROCESSED_PREFIX = 'webhook:processed:';
const IDEMPOTENCY_TTL_SEC = 86400;
const eventStatusMap = {
    delivered: 'delivered',
    bounce: 'bounced',
    spamreport: 'spam',
    open: 'opened',
    click: 'clicked',
};
router.post('/sendgrid', async (req, res) => {
    const secret = process.env.SENDGRID_WEBHOOK_SECRET;
    if (!secret) {
        console.warn('SENDGRID_WEBHOOK_SECRET not set, skipping signature verification');
    }
    else {
        const ew = new eventwebhook_1.EventWebhook();
        const publicKey = ew.convertPublicKeyToECDSA(secret);
        const payload = req.rawBody;
        const signature = req.headers['x-twilio-email-event-webhook-signature'];
        const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'];
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
    const events = req.body;
    if (!Array.isArray(events)) {
        res.status(200).json({ received: 0 });
        return;
    }
    for (const event of events) {
        if (!event.email || !event.event)
            continue;
        const eventId = event.sg_event_id ?? `${event.email}:${event.event}:${event.timestamp ?? Date.now()}`;
        const redisKey = `${WEBHOOK_PROCESSED_PREFIX}${eventId}`;
        const alreadyProcessed = await redis_1.redisConnection.get(redisKey);
        if (alreadyProcessed)
            continue;
        const status = eventStatusMap[event.event];
        if (!status)
            continue;
        const query = event.event === 'open'
            ? `UPDATE recipients SET status = $1, opened_at = to_timestamp($2) WHERE email = $3`
            : `UPDATE recipients SET status = $1 WHERE email = $2`;
        const params = event.event === 'open'
            ? [status, event.timestamp ?? Math.floor(Date.now() / 1000), event.email]
            : [status, event.email];
        await pool_1.default.query(query, params);
        await redis_1.redisConnection.setex(redisKey, IDEMPOTENCY_TTL_SEC, '1');
    }
    res.json({ received: events.length });
});
exports.default = router;
//# sourceMappingURL=webhook.routes.js.map