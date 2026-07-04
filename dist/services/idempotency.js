"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAsSent = markAsSent;
exports.wasSent = wasSent;
exports.closeIdempotencyClient = closeIdempotencyClient;
const node_crypto_1 = require("node:crypto");
const ioredis_1 = __importDefault(require("ioredis"));
const logger_js_1 = require("../utils/logger.js");
const TTL_SECONDS = 86400;
const redis = new ioredis_1.default(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});
function buildKey(campaignId, email) {
    const hash = (0, node_crypto_1.createHash)("sha256")
        .update(`${campaignId}\0${email}`)
        .digest("hex");
    return `idempotency:${hash}`;
}
async function markAsSent(campaignId, email) {
    try {
        const key = buildKey(campaignId, email);
        const result = await redis.set(key, "1", "NX", "EX", TTL_SECONDS);
        return result === "OK";
    }
    catch (err) {
        logger_js_1.logger.warn("Idempotency markAsSent error — failing open", {
            error: err.message,
            campaignId,
            email,
        });
        return true;
    }
}
async function wasSent(campaignId, email) {
    try {
        const key = buildKey(campaignId, email);
        const exists = await redis.exists(key);
        return exists === 1;
    }
    catch (err) {
        logger_js_1.logger.warn("Idempotency wasSent error", {
            error: err.message,
            campaignId,
            email,
        });
        return false;
    }
}
async function closeIdempotencyClient() {
    try {
        await redis.quit();
    }
    catch (err) {
        logger_js_1.logger.warn("Idempotency Redis close error", { error: err.message });
    }
}
//# sourceMappingURL=idempotency.js.map