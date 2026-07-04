import { jest } from "@jest/globals";

// ─────────────────────────────────────────────────────────────────────────────
// In ESM, jest.mock() is not available.  Instead we use jest.unstable_mockModule
// which must be called before the dynamic import() of the module under test.
// The factory receives the original module specifier and must return a module-
// shaped object (here: { default: MockRedisConstructor }).
// ─────────────────────────────────────────────────────────────────────────────

class MockRedis {
  constructor() {
    this.data = new Map();
  }
  on() {
    return this;
  }
  eval(_script, _numKeys, ...args) {
    const key = args[0];
    const now = parseInt(args[1], 10);
    const windowMs = parseInt(args[2], 10);
    const max = parseInt(args[3], 10);

    let set = this.data.get(key) || [];
    set = set.filter((e) => e.score > now - windowMs);

    if (set.length < max) {
      set.push({ score: now, member: String(now) });
      this.data.set(key, set);
      return Promise.resolve([1, max - set.length, now + windowMs]);
    }
    this.data.set(key, set);
    return Promise.resolve([0, max - set.length, now + windowMs]);
  }
  del(key) {
    this.data.delete(key);
    return Promise.resolve(1);
  }
}

jest.unstable_mockModule("ioredis", () => ({ default: MockRedis }));

// Dynamic import — runs AFTER the mock is registered.
const { SlidingWindowRateLimiter, default: defaultLimiter } = await import("./rateLimiter.js");

// ---------------------------------------------------------------------------
describe("SlidingWindowRateLimiter – constructor", () => {
  test("throws when Redis client is missing", () => {
    expect(() => new SlidingWindowRateLimiter(null)).toThrow("eval()");
    expect(() => new SlidingWindowRateLimiter()).toThrow("eval()");
    expect(() => new SlidingWindowRateLimiter({})).toThrow("eval()");
  });

  test("applies default windowMs (60000) and max (100)", () => {
    const r = new SlidingWindowRateLimiter(new MockRedis());
    expect(r.windowMs).toBe(60000);
    expect(r.max).toBe(100);
  });

  test("accepts custom windowMs and max", () => {
    const r = new SlidingWindowRateLimiter(new MockRedis(), { windowMs: 5000, max: 10 });
    expect(r.windowMs).toBe(5000);
    expect(r.max).toBe(10);
  });
});

// ---------------------------------------------------------------------------
describe("SlidingWindowRateLimiter – isAllowed", () => {
  let redis;
  let limiter;

  beforeEach(() => {
    redis = new MockRedis();
    limiter = new SlidingWindowRateLimiter(redis, { windowMs: 1000, max: 5 });
  });

  test("allows requests up to the limit", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(limiter.isAllowed("u:1")).resolves.toMatchObject({ allowed: true });
    }
  });

  test("blocks the (N+1)th request inside the window", async () => {
    for (let i = 0; i < 5; i++) await limiter.isAllowed("u:2");
    const res = await limiter.isAllowed("u:2");
    expect(res.allowed).toBe(false);
    expect(res.remaining).toBe(0);
  });

  test("decrements remaining on each allowed request", async () => {
    expect((await limiter.isAllowed("u:3")).remaining).toBe(4);
    expect((await limiter.isAllowed("u:3")).remaining).toBe(3);
    expect((await limiter.isAllowed("u:3")).remaining).toBe(2);
  });

  test("resetAt is a future timestamp", async () => {
    const res = await limiter.isAllowed("u:4");
    expect(typeof res.resetAt).toBe("number");
    expect(res.resetAt).toBeGreaterThan(Date.now());
  });

  test("sliding window expires old entries", async () => {
    const fast = new SlidingWindowRateLimiter(redis, { windowMs: 30, max: 2 });
    await fast.isAllowed("u:5");
    await fast.isAllowed("u:5");
    expect((await fast.isAllowed("u:5")).allowed).toBe(false);

    await new Promise((r) => setTimeout(r, 40));

    expect((await fast.isAllowed("u:5")).allowed).toBe(true);
  });

  test("different identifiers have independent counters", async () => {
    const l = new SlidingWindowRateLimiter(redis, { windowMs: 1000, max: 2 });
    expect((await l.isAllowed("a")).allowed).toBe(true);
    expect((await l.isAllowed("a")).allowed).toBe(true);
    expect((await l.isAllowed("a")).allowed).toBe(false);

    expect((await l.isAllowed("b")).allowed).toBe(true);
    expect((await l.isAllowed("b")).allowed).toBe(true);
    expect((await l.isAllowed("b")).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("SlidingWindowRateLimiter – reset", () => {
  test("clears all tracked entries for an identifier", async () => {
    const redis = new MockRedis();
    const limiter = new SlidingWindowRateLimiter(redis, { windowMs: 1000, max: 2 });

    await limiter.isAllowed("u:r");
    await limiter.isAllowed("u:r");
    expect((await limiter.isAllowed("u:r")).allowed).toBe(false);

    await limiter.reset("u:r");
    const after = await limiter.isAllowed("u:r");
    expect(after.allowed).toBe(true);
    expect(after.remaining).toBe(1);
  });

  test("does not affect other identifiers", async () => {
    const redis = new MockRedis();
    const limiter = new SlidingWindowRateLimiter(redis, { windowMs: 1000, max: 1 });

    await limiter.isAllowed("u:x");
    expect((await limiter.isAllowed("u:x")).allowed).toBe(false);
    await limiter.reset("u:x");

    await limiter.isAllowed("u:y");
    expect((await limiter.isAllowed("u:y")).allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("SlidingWindowRateLimiter – error handling (fail-open)", () => {
  test("returns allowed=true when Redis is unreachable", async () => {
    const broken = { eval: () => Promise.reject(new Error("ECONNREFUSED")) };
    const limiter = new SlidingWindowRateLimiter(broken, { windowMs: 1000, max: 10 });
    const res = await limiter.isAllowed("u:e");
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(10);
    expect(typeof res.resetAt).toBe("number");
  });

  test("reset swallows Redis errors gracefully", async () => {
    const broken = {
      eval: () => Promise.resolve([1, 99, 99999]),
      del: () => Promise.reject(new Error("timeout")),
    };
    const limiter = new SlidingWindowRateLimiter(broken);
    await expect(limiter.reset("u:e")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("SlidingWindowRateLimiter – default singleton", () => {
  test("is a SlidingWindowRateLimiter instance", () => {
    expect(defaultLimiter).toBeInstanceOf(SlidingWindowRateLimiter);
  });

  test("defaults to 100 max / 60000 ms window", () => {
    expect(defaultLimiter.max).toBe(100);
    expect(defaultLimiter.windowMs).toBe(60000);
  });

  test("has isAllowed and reset methods", () => {
    expect(typeof defaultLimiter.isAllowed).toBe("function");
    expect(typeof defaultLimiter.reset).toBe("function");
  });
});
