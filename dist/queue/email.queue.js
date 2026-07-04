"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_QUEUE = void 0;
exports.createEmailQueue = createEmailQueue;
const bullmq_1 = require("bullmq");
exports.EMAIL_QUEUE = 'email';
function createEmailQueue() {
    return new bullmq_1.Queue(exports.EMAIL_QUEUE, {
        connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
        defaultJobOptions: {
            attempts: 5,
            backoff: { type: 'custom' },
        },
    });
}
//# sourceMappingURL=email.queue.js.map