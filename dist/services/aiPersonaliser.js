"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.personalise = personalise;
exports.closeAiPersonaliser = closeAiPersonaliser;
const node_crypto_1 = require("node:crypto");
const ioredis_1 = __importDefault(require("ioredis"));
const generative_ai_1 = require("@google/generative-ai");
const logger_js_1 = require("../utils/logger.js");
const metrics_1 = require("../observability/metrics");
const CACHE_TTL = 3600;
const API_TIMEOUT = 3000;
const API_MODEL = "gemini-1.5-flash";
const MAX_RPS = 10;
const redis = new ioredis_1.default(process.env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");
let tokens = MAX_RPS;
let lastRefill = Date.now();
function refill() {
    const now = Date.now();
    const add = ((now - lastRefill) / 1000) * MAX_RPS;
    if (add >= 0.1) {
        tokens = Math.min(MAX_RPS, tokens + add);
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
    const hash = (0, node_crypto_1.createHash)("sha256")
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
    }
    catch {
        throw new Error("Invalid JSON from Gemini");
    }
    if (!parsed.subject || typeof parsed.subject !== "string") {
        throw new Error("Missing subject in response");
    }
    return parsed.subject;
}
async function personalise(recipientData) {
    if (process.env.AI_PERSONALISATION_ENABLED !== "true")
        return recipientData.baseSubject;
    const { recipientEmail, baseSubject } = recipientData;
    const cacheKey = buildKey(recipientData);
    try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
            logger_js_1.logger.info("AI subject generated", { email: recipientEmail, subject: cached });
            return cached;
        }
    }
    catch (err) {
        logger_js_1.logger.warn("AI cache error", { error: err.message, email: recipientEmail });
    }
    await acquireToken();
    try {
        const subject = await callGemini(recipientData);
        try {
            await redis.set(cacheKey, subject, "EX", CACHE_TTL);
        }
        catch (err) {
            logger_js_1.logger.warn("AI cache set error", { error: err.message, email: recipientEmail });
        }
        metrics_1.aiPersonalisationCallsTotal.inc({ result: "success" });
        logger_js_1.logger.info("AI subject generated", { email: recipientEmail, subject });
        return subject;
    }
    catch (err) {
        metrics_1.aiPersonalisationCallsTotal.inc({ result: "fallback" });
        logger_js_1.logger.warn("AI fallback used", { error: err.message, email: recipientEmail });
        return baseSubject;
    }
}
async function closeAiPersonaliser() {
    try {
        await redis.quit();
    }
    catch (err) {
        logger_js_1.logger.warn("AI personaliser Redis close error", { error: err.message });
    }
}
//# sourceMappingURL=aiPersonaliser.js.map