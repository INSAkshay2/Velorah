import { jest } from "@jest/globals";
import { EmailProviderFailover } from "./emailProvider.js";
import { CircuitBreaker } from "./circuitBreaker.js";

// Helper: create a mock provider
const mockProvider = (name, shouldFail = false) => ({
  name,
  send: jest.fn(async () => {
    if (shouldFail) throw new Error(`${name} error`);
    return { provider: name, messageId: `msg-${name}` };
  }),
});

// ---------------------------------------------------------------------------
describe("EmailProviderFailover", () => {
  test("uses the first provider on success", async () => {
    const p1 = mockProvider("p1");
    const p2 = mockProvider("p2");
    const failover = new EmailProviderFailover([
      { provider: p1, breaker: new CircuitBreaker("p1") },
      { provider: p2, breaker: new CircuitBreaker("p2") },
    ]);

    const result = await failover.sendWithFailover({ to: "a@b.com", subject: "Hi", html: "<p>Hi</p>" });
    expect(result.provider).toBe("p1");
    expect(result.messageId).toBe("msg-p1");
    expect(p1.send).toHaveBeenCalledTimes(1);
    expect(p2.send).not.toHaveBeenCalled();
  });

  test("falls through to the next provider when the first fails", async () => {
    const p1 = mockProvider("p1", true);
    const p2 = mockProvider("p2");
    const failover = new EmailProviderFailover([
      { provider: p1, breaker: new CircuitBreaker("p1", { resetTimeout: 50 }) },
      { provider: p2, breaker: new CircuitBreaker("p2") },
    ]);

    const result = await failover.sendWithFailover({ to: "a@b.com", subject: "Hi", html: "<p>Hi</p>" });
    expect(result.provider).toBe("p2");
  });

  test("throws when all providers fail", async () => {
    const p1 = mockProvider("p1", true);
    const p2 = mockProvider("p2", true);

    // Reset timeout so circuit doesn't open after 1 failure (otherwise
    // the second call to a failed provider hits CircuitBreakerError, not the real error)
    const failover = new EmailProviderFailover([
      { provider: p1, breaker: new CircuitBreaker("p1", { maxFailures: 10, resetTimeout: 50 }) },
      { provider: p2, breaker: new CircuitBreaker("p2", { maxFailures: 10, resetTimeout: 50 }) },
    ]);

    await expect(
      failover.sendWithFailover({ to: "a@b.com", subject: "Hi", html: "<p>Hi</p>" }),
    ).rejects.toThrow("All email providers unavailable");
  });

  test("skips providers with open circuits", async () => {
    const p1 = mockProvider("p1", true);
    const p2 = mockProvider("p2");
    const b1 = new CircuitBreaker("p1", { maxFailures: 1, resetTimeout: 60000 });

    // Open the circuit for p1
    await b1.call(async () => { throw new Error("fail"); }).catch(() => {});
    expect(b1.state).toBe("OPEN");

    const failover = new EmailProviderFailover([
      { provider: p1, breaker: b1 },
      { provider: p2, breaker: new CircuitBreaker("p2") },
    ]);

    const result = await failover.sendWithFailover({ to: "a@b.com", subject: "Hi", html: "<p>Hi</p>" });
    expect(result.provider).toBe("p2");
    expect(p1.send).not.toHaveBeenCalled();
  });

  test("throws 'All email providers unavailable' when all circuits are open", async () => {
    const p1 = mockProvider("p1");
    const p2 = mockProvider("p2");
    const b1 = new CircuitBreaker("p1", { maxFailures: 1, resetTimeout: 60000 });
    const b2 = new CircuitBreaker("p2", { maxFailures: 1, resetTimeout: 60000 });

    await b1.call(async () => { throw new Error("x"); }).catch(() => {});
    await b2.call(async () => { throw new Error("x"); }).catch(() => {});

    const failover = new EmailProviderFailover([
      { provider: p1, breaker: b1 },
      { provider: p2, breaker: b2 },
    ]);

    await expect(
      failover.sendWithFailover({ to: "a@b.com", subject: "Hi", html: "<p>Hi</p>" }),
    ).rejects.toThrow("All email providers unavailable");
    expect(p1.send).not.toHaveBeenCalled();
    expect(p2.send).not.toHaveBeenCalled();
  });

  test("getBreaker() returns the correct breaker by name", () => {
    const b1 = new CircuitBreaker("sendgrid");
    const b2 = new CircuitBreaker("mailgun");
    const failover = new EmailProviderFailover([
      { provider: { name: "s", send: async () => {} }, breaker: b1 },
      { provider: { name: "m", send: async () => {} }, breaker: b2 },
    ]);

    expect(failover.getBreaker("sendgrid")).toBe(b1);
    expect(failover.getBreaker("mailgun")).toBe(b2);
    expect(failover.getBreaker("nonexistent")).toBeNull();
  });

  test("the default export is an EmailProviderFailover instance", async () => {
    const mod = await import("./emailProvider.js");
    expect(mod.default).toBeInstanceOf(EmailProviderFailover);
  });
});
