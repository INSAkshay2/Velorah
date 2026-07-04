import { describe, it, after } from "node:test";
import assert from "node:assert/strict";

// ── Environment ──
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.AI_PERSONALISATION_ENABLED = "true";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.REDIS_URL = "redis://localhost:16379"; // unlikely to have a real Redis there

const { logger }         = await import("./src/utils/logger.js");
const { emailQueue, closeEmailQueue } = await import("./src/queues/emailQueue.js");
const { emailWorker, closeEmailWorker } = await import("./src/workers/emailWorker.js");
const { send, sendBatch } = await import("./src/services/emailService.js");
const { personalise }    = await import("./src/services/aiService.js");
const { SlidingWindowRateLimiter, default: defaultLimiter } = await import("./src/services/rateLimiter.js");
const { CircuitBreaker, CircuitBreakerError } = await import("./src/services/circuitBreaker.js");
const { EmailProviderFailover } = await import("./src/services/emailProvider.js");
const idempotency      = await import("./src/services/idempotency.js");
const aiPersonaliser   = await import("./src/services/aiPersonaliser.js");
const { pool }           = await import("./src/db/index.js");

// Close idempotency and AI personaliser Redis connections immediately to stop reconnect spam.
idempotency.closeIdempotencyClient().catch(() => {});
aiPersonaliser.closeAiPersonaliser().catch(() => {});
const { default: routes } = await import("./src/routes/index.js");

// Close the default limiter's Redis connection immediately to stop reconnect spam.
// The rate-limiter test below will hit the fail-open path, which is fine.
defaultLimiter.close().catch(() => {});

// ────────────────────────────────────────────────────────
// 1. Logger
// ────────────────────────────────────────────────────────
describe("utils / logger", () => {
  for (const level of ["debug", "info", "warn", "error"])
    it(`exports logger.${level} as function`, () =>
      assert.equal(typeof logger[level], "function"));
});

// ────────────────────────────────────────────────────────
// 2. Routes
// ────────────────────────────────────────────────────────
describe("routes / index", () => {
  it("GET /health returns 200 with status ok", async () => {
    const express = (await import("express")).default;
    const app = express();
    app.use(routes);
    const server = app.listen(0);
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.status, "ok");
    assert.ok(body.timestamp);
    server.close();
  });
});

// ────────────────────────────────────────────────────────
// 3. BullMQ Queue
// ────────────────────────────────────────────────────────
describe("queues / emailQueue", () => {
  it("name is emailQueue",         () => assert.equal(emailQueue.name, "emailQueue"));
  it("closeEmailQueue is async function", () => assert.equal(typeof closeEmailQueue, "function"));
});

// ────────────────────────────────────────────────────────
// 4. BullMQ Worker
// ────────────────────────────────────────────────────────
describe("workers / emailWorker", () => {
  it("name is emailQueue",       () => assert.equal(emailWorker.name, "emailQueue"));
  it("closeEmailWorker is async function", () => assert.equal(typeof closeEmailWorker, "function"));
});

// ────────────────────────────────────────────────────────
// 5. emailService
// ────────────────────────────────────────────────────────
describe("services / emailService", () => {
  it("send() returns accepted:true", async () => {
    const r = await send({ to: "a@b.com", subject: "Hi" });
    assert.equal(r.accepted, true);
  });

  it("sendBatch() returns succeeded/failed counts", async () => {
    const r = await sendBatch([
      { data: { to: "a@b.com", subject: "t1" } },
      { data: { to: "b@b.com", subject: "t2" } },
    ]);
    assert.equal(r.succeeded, 2);
    assert.equal(r.failed, 0);
  });

  it("does not throw when SENDGRID_API_KEY is set", () => {
    process.env.SENDGRID_API_KEY = "SG.test";
    assert.doesNotThrow(() => send({ to: "a@b.com", subject: "x" }));
    delete process.env.SENDGRID_API_KEY;
  });
});

// ────────────────────────────────────────────────────────
// 6. aiService
// ────────────────────────────────────────────────────────
describe("services / aiService", () => {
  it("personalise() returns baseContent when enabled", async () => {
    assert.equal(await personalise("u@t.com", "Hello"), "Hello");
  });

  it("skips AI when AI_PERSONALISATION_ENABLED=false", async () => {
    process.env.AI_PERSONALISATION_ENABLED = "false";
    assert.equal(await personalise("u@t.com", "Hello"), "Hello");
    process.env.AI_PERSONALISATION_ENABLED = "true";
  });
});

// ────────────────────────────────────────────────────────
// 7. rateLimiter
// ────────────────────────────────────────────────────────
describe("services / rateLimiter", () => {
  it("isAllowed() returns { allowed, remaining, resetAt }", async () => {
    const r = await defaultLimiter.isAllowed("smoke:test");
    assert.equal(typeof r.allowed, "boolean");
    assert.equal(typeof r.remaining, "number");
    assert.equal(typeof r.resetAt, "number");
  });

  it("default singleton is a SlidingWindowRateLimiter instance", () => {
    assert.ok(defaultLimiter instanceof SlidingWindowRateLimiter);
  });
});

// ────────────────────────────────────────────────────────
// 8. Circuit breaker
// ────────────────────────────────────────────────────────
describe("services / circuitBreaker", () => {
  it("starts CLOSED and opens after maxFailures", async () => {
    const cb = new CircuitBreaker("smoke", { maxFailures: 2, resetTimeout: 50 });
    assert.equal(cb.state, "CLOSED");
    await cb.call(() => Promise.reject(new Error("x"))).catch(() => {});
    await cb.call(() => Promise.reject(new Error("x"))).catch(() => {});
    assert.equal(cb.state, "OPEN");
  });

  it("rejects with CircuitBreakerError when OPEN", async () => {
    const cb = new CircuitBreaker("smoke2", { maxFailures: 1, resetTimeout: 60000 });
    await cb.call(() => Promise.reject(new Error("x"))).catch(() => {});
    await assert.rejects(
      () => cb.call(() => Promise.resolve("ok")),
      CircuitBreakerError,
    );
  });
});

// ────────────────────────────────────────────────────────
// 9. Email provider failover
// ────────────────────────────────────────────────────────
describe("services / emailProvider", () => {
  it("falls through to second provider when first fails", async () => {
    const mockOk  = { name: "ok",  send: () => Promise.resolve({ provider: "ok", messageId: "m1" }) };
    const mockBad = { name: "bad", send: () => Promise.reject(new Error("fail")) };
    const failover = new EmailProviderFailover([
      { provider: mockBad, breaker: new CircuitBreaker("bad", { maxFailures: 2 }) },
      { provider: mockOk,  breaker: new CircuitBreaker("ok") },
    ]);
    const result = await failover.sendWithFailover({ to: "t@t.com", subject: "s", html: "h" });
    assert.equal(result.provider, "ok");
  });

  it("throws when all providers fail", async () => {
    const mockBad1 = { name: "b1", send: () => Promise.reject(new Error("fail")) };
    const mockBad2 = { name: "b2", send: () => Promise.reject(new Error("fail")) };
    const failover = new EmailProviderFailover([
      { provider: mockBad1, breaker: new CircuitBreaker("b1", { maxFailures: 5 }) },
      { provider: mockBad2, breaker: new CircuitBreaker("b2", { maxFailures: 5 }) },
    ]);
    await assert.rejects(
      () => failover.sendWithFailover({ to: "t@t.com", subject: "s", html: "h" }),
      /All email providers unavailable/,
    );
  });
});

// ────────────────────────────────────────────────────────
// 10. Idempotency
// ────────────────────────────────────────────────────────
describe("services / idempotency", () => {
  it("exports markAsSent, wasSent, closeIdempotencyClient", () => {
    assert.equal(typeof idempotency.markAsSent, "function");
    assert.equal(typeof idempotency.wasSent, "function");
    assert.equal(typeof idempotency.closeIdempotencyClient, "function");
  });
});

// ────────────────────────────────────────────────────────
// 11. AI Personaliser
// ────────────────────────────────────────────────────────
describe("services / aiPersonaliser", () => {
  it("exports personalise and closeAiPersonaliser", () => {
    assert.equal(typeof aiPersonaliser.personalise, "function");
    assert.equal(typeof aiPersonaliser.closeAiPersonaliser, "function");
  });
});

// ────────────────────────────────────────────────────────
// 12. Database pool
// ────────────────────────────────────────────────────────
describe("db / index", () => {
  it("exports pg.Pool with .query and .end", () => {
    assert.equal(typeof pool.query, "function");
    assert.equal(typeof pool.end, "function");
  });
});

// ────────────────────────────────────────────────────────
// Cleanup — close open handles so the process can exit
// ────────────────────────────────────────────────────────
after(async () => {
  await closeEmailWorker().catch(() => {});
  await closeEmailQueue().catch(() => {});
  await pool.end().catch(() => {});
  await defaultLimiter.close().catch(() => {});
});
