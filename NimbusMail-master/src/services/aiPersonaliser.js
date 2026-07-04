import { createHash } from "node:crypto";
import Redis from "ioredis";
import { logger } from "../utils/logger.js";
import { aiPersonalisationCallsTotal } from "./metrics.js";

const CACHE_TTL   = 3600;
const API_TIMEOUT = 3000;
const API_URL     = "https://api.anthropic.com/v1/messages";
const API_MODEL   = "claude-3-haiku-20240307";
const MAX_RPS     = 10;

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// ── Token bucket rate limiter (in-process, 10 req/s) ──
let tokens    = MAX_RPS;
let lastRefill = Date.now();

function refill() {
  const now  = Date.now();
  const add  = ((now - lastRefill) / 1000) * MAX_RPS;
  if (add >= 0.1) {
    tokens     = Math.min(MAX_RPS, tokens + add);
    lastRefill = now;
  }
}

function acquireToken() {
  refill();
  if (tokens >= 1) {
    tokens -= 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(() => resolve(acquireToken()), Math.ceil(1000 / MAX_RPS));
  });
}

// ── Cache key ──
function buildKey(data) {
  const hash = createHash("sha256")
    .update(`${data.recipientName}\0${data.recipientEmail}\0${data.campaignTopic}\0${data.baseSubject}`)
    .digest("hex");
  return `ai:subject:${hash}`;
}

// ── Anthropic API call ──
async function callAnthropic(data) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: API_MODEL,
      max_tokens: 150,
      system: "You are an expert email copywriter. Return ONLY valid JSON.",
      messages: [
        {
          role: "user",
          content: [
            "Generate a personalised email subject for:",
            `Name: ${data.recipientName}`,
            `Email: ${data.recipientEmail}`,
            `Topic: ${data.campaignTopic}`,
            `Base: ${data.baseSubject}`,
            "",
            'Return JSON: {"subject":"...","reasoning":"..."}',
          ].join("\n"),
        },
      ],
    }),
    signal: AbortSignal.timeout(API_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`Anthropic ${response.status}`);
  }

  const body    = await response.json();
  const text    = body.content?.[0]?.text;
  if (!text) throw new Error("Empty Anthropic response");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON from Anthropic");
  }

  if (!parsed.subject || typeof parsed.subject !== "string") {
    throw new Error("Missing subject in response");
  }

  return parsed.subject;
}

// ── Main export ──
export async function personalise(recipientData) {
  if (process.env.AI_PERSONALISATION_ENABLED !== "true") return recipientData.baseSubject;

  const { recipientEmail, baseSubject } = recipientData;
  const cacheKey = buildKey(recipientData);

  try {
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      logger.info("AI subject generated", { email: recipientEmail, subject: cached });
      return cached;
    }
  } catch (err) {
    logger.warn("AI cache error", { error: err.message, email: recipientEmail });
  }

  await acquireToken();

  try {
    const subject = await callAnthropic(recipientData);
    try {
      await redis.set(cacheKey, subject, "EX", CACHE_TTL);
    } catch (err) {
      logger.warn("AI cache set error", { error: err.message, email: recipientEmail });
    }
    aiPersonalisationCallsTotal.inc({ result: "success" });
    logger.info("AI subject generated", { email: recipientEmail, subject });
    return subject;
  } catch (err) {
    aiPersonalisationCallsTotal.inc({ result: "fallback" });
    logger.warn("AI fallback used", { error: err.message, email: recipientEmail });
    return baseSubject;
  }
}

export async function closeAiPersonaliser() {
  try {
    await redis.quit();
  } catch (err) {
    logger.warn("AI personaliser Redis close error", { error: err.message });
  }
}
