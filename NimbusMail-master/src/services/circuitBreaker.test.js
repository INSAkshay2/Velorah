import { jest } from "@jest/globals";
import { CircuitBreaker, CircuitBreakerError } from "./circuitBreaker.js";

// ---------------------------------------------------------------------------
describe("CircuitBreaker – initial state", () => {
  test("starts CLOSED with zero failures", () => {
    const cb = new CircuitBreaker("test");
    expect(cb.state).toBe("CLOSED");
    expect(cb.failureCount).toBe(0);
    expect(cb.name).toBe("test");
  });

  test("uses default maxFailures (5) and resetTimeout (30000)", () => {
    const cb = new CircuitBreaker("test");
    expect(cb.maxFailures).toBe(5);
    expect(cb.resetTimeout).toBe(30000);
  });

  test("accepts custom maxFailures and resetTimeout", () => {
    const cb = new CircuitBreaker("test", { maxFailures: 2, resetTimeout: 1000 });
    expect(cb.maxFailures).toBe(2);
    expect(cb.resetTimeout).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
describe("CircuitBreaker – CLOSED state", () => {
  test("call() resolves when the wrapped function succeeds", async () => {
    const cb = new CircuitBreaker("test");
    const result = await cb.call(async () => "ok");
    expect(result).toBe("ok");
  });

  test("keeps failureCount at 0 on success", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 3 });
    await cb.call(async () => "ok");
    expect(cb.failureCount).toBe(0);
    expect(cb.state).toBe("CLOSED");
  });

  test("resets failureCount to 0 on success after a failure", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 5 });

    await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    expect(cb.failureCount).toBe(1);

    await cb.call(async () => "ok");
    expect(cb.failureCount).toBe(0);
    expect(cb.state).toBe("CLOSED");
  });

  test("counts consecutive failures but stays CLOSED below threshold", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 3 });

    for (let i = 0; i < 2; i++) {
      await cb.call(async () => { throw new Error("fail"); }).catch(() => {});
    }

    expect(cb.state).toBe("CLOSED");
    expect(cb.failureCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe("CircuitBreaker – CLOSED → OPEN transition", () => {
  test("opens after maxFailures consecutive failures", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 3, resetTimeout: 60000 });

    for (let i = 0; i < 3; i++) {
      await cb.call(async () => { throw new Error("boom"); }).catch(() => {});
    }

    expect(cb.state).toBe("OPEN");
    expect(cb.failureCount).toBe(3);
    expect(cb.nextAttemptTime).toBeGreaterThan(Date.now());
  });

  test("emits 'open' event on transition", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 2, resetTimeout: 60000 });
    const spy = jest.fn();
    cb.on("open", spy);

    for (let i = 0; i < 2; i++) {
      await cb.call(async () => { throw new Error("x"); }).catch(() => {});
    }

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("test", "OPEN");
  });
});

// ---------------------------------------------------------------------------
describe("CircuitBreaker – OPEN state", () => {
  test("rejects calls immediately with CircuitBreakerError", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 1, resetTimeout: 60000 });
    await cb.call(async () => { throw new Error("x"); }).catch(() => {});

    await expect(cb.call(async () => "should not run")).rejects.toThrow(CircuitBreakerError);
    expect(cb.state).toBe("OPEN");
  });

  test("rejected calls do not change failureCount", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 1, resetTimeout: 60000 });
    await cb.call(async () => { throw new Error("x"); }).catch(() => {});

    await cb.call(async () => "nope").catch(() => {});
    expect(cb.failureCount).toBe(1); // still 1 from the original failure
  });
});

// ---------------------------------------------------------------------------
describe("CircuitBreaker – OPEN → HALF_OPEN transition", () => {
  test("transitions to HALF_OPEN when resetTimeout elapses", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 1, resetTimeout: 30 });
    await cb.call(async () => { throw new Error("x"); }).catch(() => {});

    expect(cb.state).toBe("OPEN");

    // Wait for cooldown
    await new Promise((r) => setTimeout(r, 35));

    // The next call triggers HALF_OPEN and acts as the test
    await cb.call(async () => "recovered").catch(() => {});
    expect(cb.state).toBe("CLOSED"); // transition: HALF_OPEN → CLOSED
  });
});

// ---------------------------------------------------------------------------
describe("CircuitBreaker – HALF_OPEN state", () => {
  test("transitions to CLOSED when test succeeds", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 1, resetTimeout: 30 });
    await cb.call(async () => { throw new Error("x"); }).catch(() => {});
    await new Promise((r) => setTimeout(r, 35));

    await cb.call(async () => "ok");
    expect(cb.state).toBe("CLOSED");
    expect(cb.failureCount).toBe(0);
  });

  test("emits 'close' event when test succeeds", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 1, resetTimeout: 30 });
    await cb.call(async () => { throw new Error("x"); }).catch(() => {});
    await new Promise((r) => setTimeout(r, 35));

    const spy = jest.fn();
    cb.on("close", spy);
    await cb.call(async () => "ok");
    expect(spy).toHaveBeenCalledWith("test", "CLOSED");
  });

  test("transitions back to OPEN when test fails (resets timer)", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 1, resetTimeout: 30 });
    await cb.call(async () => { throw new Error("x"); }).catch(() => {});
    await new Promise((r) => setTimeout(r, 35));

    const before = Date.now();
    await cb.call(async () => { throw new Error("still failing"); }).catch(() => {});
    expect(cb.state).toBe("OPEN");
    // failureCount resets to 1 on OPEN (not 2) because the test call
    // in HALF_OPEN records 1 more failure
    expect(cb.failureCount).toBe(2);
    // nextAttemptTime should be reset to ~30 ms from now
    expect(cb.nextAttemptTime).toBeGreaterThanOrEqual(before + 30);
  });

  test("emits 'open' event when test fails", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 1, resetTimeout: 30 });
    await cb.call(async () => { throw new Error("x"); }).catch(() => {});
    await new Promise((r) => setTimeout(r, 35));

    const spy = jest.fn();
    cb.on("open", spy);
    await cb.call(async () => { throw new Error("again"); }).catch(() => {});
    expect(spy).toHaveBeenCalledWith("test", "OPEN");
  });
});

// ---------------------------------------------------------------------------
describe("CircuitBreaker – events", () => {
  test("emits 'half-open' on transition to HALF_OPEN", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 1, resetTimeout: 30 });
    await cb.call(async () => { throw new Error("x"); }).catch(() => {});
    await new Promise((r) => setTimeout(r, 35));

    const spy = jest.fn();
    cb.on("half-open", spy);
    await cb.call(async () => "ok").catch(() => {});
    expect(spy).toHaveBeenCalledWith("test", "HALF_OPEN");
  });

  test("listener errors do not break the circuit breaker", async () => {
    const cb = new CircuitBreaker("test", { maxFailures: 1, resetTimeout: 60000 });
    cb.on("open", () => { throw new Error("listener oops"); });

    // Should not throw
    await expect(
      cb.call(async () => { throw new Error("fail"); }),
    ).rejects.toThrow("fail");

    expect(cb.state).toBe("OPEN");
  });
});

// ---------------------------------------------------------------------------
describe("CircuitBreaker – reset()", () => {
  test("resets state to CLOSED with zero failures", () => {
    const cb = new CircuitBreaker("test", { maxFailures: 2 });
    cb.failureCount = 5;
    cb.state = "OPEN";
    cb.nextAttemptTime = 999999;

    cb.reset();

    expect(cb.state).toBe("CLOSED");
    expect(cb.failureCount).toBe(0);
    expect(cb.nextAttemptTime).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("CircuitBreaker – CircuitBreakerError", () => {
  test("has name CircuitBreakerError", () => {
    const err = new CircuitBreakerError("boom");
    expect(err.name).toBe("CircuitBreakerError");
    expect(err.message).toBe("boom");
  });

  test("is instanceof Error", () => {
    expect(new CircuitBreakerError("x")).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
describe("CircuitBreaker – on() returns this for chaining", () => {
  test("supports fluent API", () => {
    const cb = new CircuitBreaker("test");
    const ret = cb.on("open", () => {});
    expect(ret).toBe(cb);
  });
});
