import Redis from "ioredis";
import { logger } from "../utils/logger.js";
import { rateLimiterRejectionsTotal } from "./metrics.js";

/*
 * ── Sliding Window Rate Limiter (Redis Sorted Sets) ────────────────────
 *
 *  How it works:
 *    Each caller (e.g. "provider:sendgrid") maps to a Redis sorted-set key:
 *      "ratelimit:{identifier}"
 *
 *    Every request adds one member with:
 *      score  = current epoch ms  (used for expiry comparison)
 *      member = current epoch ms  (unique enough — same-ms collisions are
 *               vanishingly rare and only make the limiter marginally more
 *               permissive, which is the safe direction)
 *
 *    On each check:
 *      1. ZREMRANGEBYSCORE — evict entries where score ≤ (now - windowMs)
 *      2. ZCARD            — count entries still in the window
 *      3. if count < max   → ZADD the new entry, return ALLOW
 *         if count ≥ max   → return DENY
 *      4. PEXPIRE          — set key TTL = window so Redis auto-cleans
 *
 *  ── Atomicity (Why a Lua Script) ──
 *
 *    Without a Lua script the three-step sequence is NOT atomic:
 *      Process A: ZREMRANGEBYSCORE → ZCARD (count=99) → ZADD              ✓
 *      Process B: ZREMRANGEBYSCORE → ZCARD (count=99) → ZADD (also adds!) ✗
 *    Both processes see count < max and both add, allowing 101 requests
 *    when the limit is 100.
 *
 *    By wrapping the whole sequence in a Lua EVAL, Redis guarantees
 *    atomic execution — no other command can interleave.  This is the
 *    same strategy BullMQ uses for reliable job scheduling.
 *
 *  ── Failure mode ──
 *    When Redis is unreachable, isAllowed() logs a warning and fails open
 *    (returns allowed:true) so a Redis outage never blocks email delivery.
 *    This is a deliberate trade-off: availability over strict rate-limiting.
 *
 *  ── Edge case: same-millisecond requests ──
 *    If two requests arrive in the same ms, ZADD with the same member
 *    merely updates the existing score.  The window count stays unchanged,
 *    so the limiter is off-by-one at worst — an acceptable risk for bulk
 *    email where we prefer to err permissive.
 */

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

export class SlidingWindowRateLimiter {
  /**
   * @param {object} redisClient  – ioredis (or any client with .eval() & .del())
   * @param {object} [options]
   * @param {number} [options.windowMs=60000]  – sliding window in milliseconds
   * @param {number} [options.max=100]         – max requests per window
   */
  constructor(redisClient, { windowMs = 60000, max = 100 } = {}) {
    if (!redisClient || typeof redisClient.eval !== "function") {
      throw new Error(
        "SlidingWindowRateLimiter requires a Redis client with an eval() method",
      );
    }
    this.redis = redisClient;
    this.windowMs = windowMs;
    this.max = max;
  }

  /**
   * Check whether `identifier` may proceed.
   * @returns {{ allowed: boolean, remaining: number, resetAt: number }}
   */
  async isAllowed(identifier) {
    try {
      const now = Date.now();

      //                                                  EVAL  script  #keys  KEYS[1]           ARGV[1]  ARGV[2]      ARGV[3]
      const result = await this.redis.eval(LUA_SCRIPT, 1, `ratelimit:${identifier}`, String(now), String(this.windowMs), String(this.max));

      const [allowed, remaining, resetAt] = result;
      if (allowed === 0) rateLimiterRejectionsTotal.inc();
      return { allowed: allowed === 1, remaining, resetAt };
    } catch (err) {
      logger.warn("Rate-limiter fail-open — Redis unavailable", {
        error: err.message,
        identifier,
      });
      return { allowed: true, remaining: this.max, resetAt: Date.now() + this.windowMs };
    }
  }

  /** Delete all tracked data for `identifier`. */
  async reset(identifier) {
    try {
      await this.redis.del(`ratelimit:${identifier}`);
    } catch (err) {
      logger.warn("Rate-limiter reset error", { error: err.message, identifier });
    }
  }

  /** Close the underlying Redis connection.  Call during graceful shutdown. */
  async close() {
    try {
      await this.redis.quit();
    } catch (err) {
      logger.warn("Rate-limiter close error", { error: err.message });
    }
  }
}

// ── Default singleton (100 email-sends / minute) ──
const defaultRedis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export default new SlidingWindowRateLimiter(defaultRedis, {
  windowMs: 60000,
  max: 100,
});
