import { createHash } from "node:crypto";
import Redis from "ioredis";
import { logger } from "../utils/logger.js";

const TTL_SECONDS = 86_400;

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

function buildKey(campaignId, email) {
  const hash = createHash("sha256")
    .update(`${campaignId}\0${email}`)
    .digest("hex");
  return `idempotency:${hash}`;
}

export async function markAsSent(campaignId, email) {
  try {
    const key = buildKey(campaignId, email);
    const result = await redis.set(key, "1", "NX", "EX", TTL_SECONDS);
    return result === "OK";
  } catch (err) {
    logger.warn("Idempotency markAsSent error — failing open", {
      error: err.message,
      campaignId,
      email,
    });
    return true;
  }
}

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

export async function closeIdempotencyClient() {
  try {
    await redis.quit();
  } catch (err) {
    logger.warn("Idempotency Redis close error", { error: err.message });
  }
}
