import { createHash } from "node:crypto";
import Redis from "ioredis";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../utils/logger.js";
import { aiPersonalisationCallsTotal } from "../observability/metrics";

const CACHE_TTL   = 3600;
const API_TIMEOUT = 3000;
const API_MODEL   = "gemini-1.5-flash";
const MAX_RPS     = 10;

const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

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

function buildKey(data) {
  const hash = createHash("sha256")
    .update(`${data.recipientName}\0${data.recipientEmail}\0${data.campaignTopic}\0${data.baseSubject}`)
    .digest("hex");
  return `ai:subject:${hash}`;
}

async function callGemini(data) {
  const model = genAI.getGenerativeModel({ model: API_MODEL });
  const prompt = [
    "Generate a personalised email subject for:",
    `Name: ${data.recipientName}`,
    `Email: ${data.recipientEmail}`,
    `Topic: ${data.campaignTopic}`,
    `Base: ${data.baseSubject}`,
    "",
    'Return JSON: {"subject":"...","reasoning":"..."}',
  ].join("\n");

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON from Gemini");
  }

  if (!parsed.subject || typeof parsed.subject !== "string") {
    throw new Error("Missing subject in response");
  }

  return parsed.subject;
}

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
    const subject = await callGemini(recipientData);
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
