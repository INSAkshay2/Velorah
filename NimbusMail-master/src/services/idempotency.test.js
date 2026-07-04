import { jest } from "@jest/globals";

// ── ioredis mock ──
class MockRedis {
  constructor() {
    this.data = new Map();
  }
  on() { return this; }
  async set(key, value, ...args) {
    // NX mode: do not overwrite existing key
    if (args.includes("NX")) {
      if (this.data.has(key)) return null;
      this.data.set(key, value);
      return "OK";
    }
    this.data.set(key, value);
    return "OK";
  }
  async exists(key) {
    return this.data.has(key) ? 1 : 0;
  }
  async quit() {
    this.data.clear();
    return "OK";
  }
}

jest.unstable_mockModule("ioredis", () => ({ default: MockRedis }));

const idempotency = await import("./idempotency.js");

// ---------------------------------------------------------------------------
describe("idempotency – markAsSent", () => {
  test("returns true on first call (first time)", async () => {
    const result = await idempotency.markAsSent("camp-1", "a@b.com");
    expect(result).toBe(true);
  });

  test("returns false on second call (duplicate)", async () => {
    // Each test gets a fresh MockRedis instance because the module
    // was loaded once; the data is shared within a describe block.
    // We use unique campaign+email combos.
    await idempotency.markAsSent("dup-camp", "dup@b.com");
    const result = await idempotency.markAsSent("dup-camp", "dup@b.com");
    expect(result).toBe(false);
  });

  test("same email in different campaigns are independent", async () => {
    const r1 = await idempotency.markAsSent("camp-a", "same@b.com");
    const r2 = await idempotency.markAsSent("camp-b", "same@b.com");
    expect(r1).toBe(true);
    expect(r2).toBe(true);
  });

  test("returns true when Redis errors (fail-open)", async () => {
    // Temporarily break the underlying redis mock for this test.
    // Since the mock is shared, we simulate the break differently:
    // inject a broken mock via the module's internal ref... not easily done.
    // Instead, we verify the catch-logic by inducing a throw on the mock.
    // We'll patch the mock's set method for one call.
    const origSet = MockRedis.prototype.set;
    MockRedis.prototype.set = async () => { throw new Error("ECONNREFUSED"); };

    const result = await idempotency.markAsSent("err-camp", "err@b.com");
    expect(result).toBe(true);

    MockRedis.prototype.set = origSet;
  });
});

// ---------------------------------------------------------------------------
describe("idempotency – wasSent", () => {
  test("returns false for an unsent pair", async () => {
    const result = await idempotency.wasSent("camp-x", "x@b.com");
    expect(result).toBe(false);
  });

  test("returns true after markAsSent", async () => {
    await idempotency.markAsSent("camp-y", "y@b.com");
    const result = await idempotency.wasSent("camp-y", "y@b.com");
    expect(result).toBe(true);
  });

  test("returns false when Redis errors (fail-open)", async () => {
    const origExists = MockRedis.prototype.exists;
    MockRedis.prototype.exists = async () => { throw new Error("timeout"); };

    const result = await idempotency.wasSent("err-camp", "err@b.com");
    expect(result).toBe(false);

    MockRedis.prototype.exists = origExists;
  });
});

// ---------------------------------------------------------------------------
describe("idempotency – closeIdempotencyClient", () => {
  test("resolves without error", async () => {
    await expect(idempotency.closeIdempotencyClient()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("idempotency – exports", () => {
  test("exports all expected functions", () => {
    expect(typeof idempotency.markAsSent).toBe("function");
    expect(typeof idempotency.wasSent).toBe("function");
    expect(typeof idempotency.closeIdempotencyClient).toBe("function");
  });
});
