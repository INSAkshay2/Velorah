"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlidingWindowRateLimiter = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const logger_js_1 = require("../utils/logger.js");
const LUA_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count < max then
  redis.call('ZADD', key, now, now)
  redis.call('PEXPIRE', key, window)
  return {1, max - count - 1, now + window}
else
  return {0, max - count, now + window}
end
`;
class SlidingWindowRateLimiter {
    constructor(redisClient, { windowMs = 60000, max = 100 } = {}) {
        if (!redisClient || typeof redisClient.eval !== "function") {
            throw new Error("SlidingWindowRateLimiter requires a Redis client with an eval() method");
        }
        this.redis = redisClient;
        this.windowMs = windowMs;
        this.max = max;
    }
    async isAllowed(identifier) {
        try {
            const now = Date.now();
            const result = await this.redis.eval(LUA_SCRIPT, 1, `ratelimit:${identifier}`, String(now), String(this.windowMs), String(this.max));
            const [allowed, remaining, resetAt] = result;
            return { allowed: allowed === 1, remaining, resetAt };
        }
        catch (err) {
            logger_js_1.logger.warn("Rate-limiter fail-open — Redis unavailable", {
                error: err.message,
                identifier,
            });
            return { allowed: true, remaining: this.max, resetAt: Date.now() + this.windowMs };
        }
    }
    async reset(identifier) {
        try {
            await this.redis.del(`ratelimit:${identifier}`);
        }
        catch (err) {
            logger_js_1.logger.warn("Rate-limiter reset error", { error: err.message, identifier });
        }
    }
    async close() {
        try {
            await this.redis.quit();
        }
        catch (err) {
            logger_js_1.logger.warn("Rate-limiter close error", { error: err.message });
        }
    }
}
exports.SlidingWindowRateLimiter = SlidingWindowRateLimiter;
//# sourceMappingURL=rateLimiter.js.map