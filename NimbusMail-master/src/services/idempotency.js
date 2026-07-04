import { createHash } from "node:crypto";
import Redis from "ioredis";
import { logger } from "../utils/logger.js";

/*
 * ── Why idempotency matters in a distributed queue ──
 *
 * BullMQ guarantees at-least-once delivery.  Under normal operation a
 * job is processed exactly once, but during worker crashes, Redis
 * fail-overs, or network blips the same job may be delivered again —
 * the worker reconnects, picks up unacknowledged jobs, and processes
 * them a second time.  Without idempotency the recipient gets a
 * duplicate email, which damages sender reputation and annoys users.
 *
 * The idempotency filter ensures that even if the same
 * (campaignId, email) pair is enqueued or processed multiple times,
 * the send only happens once.
 *
 * ── Why we use SET NX (atomic check-and-set) instead of GET then SET ──
 *
 * A naive approach:
 *   1. GET key             → null   (not sent yet)
 *   2. SET key "1" NX EX … → "OK"   (mark as sent)
 * Between steps 1 and 2 another worker could also GET and see null,
 * resulting in two workers both sending the same email.  SET NX is
 * atomic: Redis will only write the key if it does NOT already exist.
 * The return value tells us whether the write happened:
 *   "OK"  → first time (proceed with send)
 *   null  → already recorded (skip)
 *
 * ── Why 24h TTL is appropriate ──
 *
 * Bulk email campaigns typically finish within minutes or hours.
 * A 24-hour TTL covers the longest-running send plus a generous
 * margin for delayed retries, while automatically evicting old
 * entries so Redis memory never grows unbounded.  If the same
 * campaign+mapping is reused a day later that is intentional (a
 * different send), so the expiry is correct.
 */

const TTL_SECONDS = 86_400; // 24 hours

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * Derive a deterministic Redis key from (campaignId, email).
 * SHA-256 ensures the key is fixed-length and has no collisions
 * for reasonable input sizes.
 */
function buildKey(campaignId, email) {
  const hash = createHash("sha256")
    .update(`${campaignId}\0${email}`)
    .digest("hex");
  return `idempotency:${hash}`;
}

/**
 * Atomically record that `email` has been sent in `campaignId`.
 *
 * @returns {boolean} `true`  — first recorded entry, caller should send
 *                    `false` — already recorded, caller must skip (duplicate)
 */
export async function markAsSent(campaignId, email) {
  try {
    const key = buildKey(campaignId, email);
    // SET NX succeeds only when the key is absent.
    // EX sets a 24-hour TTL so old entries auto-evict.
    const result = await redis.set(key, "1", "NX", "EX", TTL_SECONDS);
    return result === "OK";
  } catch (err) {
    // If Redis is unavailable we fail open — better to risk a duplicate
    // than to block a legitimate send.
    logger.warn("Idempotency markAsSent error — failing open", {
      error: err.message,
      campaignId,
      email,
    });
    return true;
  }
}

/**
 * Check whether `email` was already recorded for `campaignId`.
 * Useful for diagnostics or pre-checks outside the worker flow.
 */
export async function wasSent(campaignId, email) {
  try {
    const key = buildKey(campaignId, email);
    const exists = await redis.exists(key);
    return exists === 1;
  } catch (err) {
    logger.warn("Idempotency wasSent error", {
      error: err.message,
      campaignId,
      email,
    });
    return false;
  }
}

/** Close the underlying Redis connection during graceful shutdown. */
export async function closeIdempotencyClient() {
  try {
    await redis.quit();
  } catch (err) {
    logger.warn("Idempotency Redis close error", { error: err.message });
  }
}
