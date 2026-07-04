import { logger } from "../utils/logger.js";

/*
 * ── Circuit Breaker ──
 *
 * Real-world analogy: an electrical breaker in your house.
 * When too many appliances draw current (failures), the breaker "trips"
 * (OPENS) and cuts power.  After a cooling-off period you flip it back
 * (HALF_OPEN) — if the fault is gone the breaker stays CLOSED; if not
 * it trips again immediately.
 *
 * State machine:
 *
 *         ┌──────────────────────────┐
 *         │                          │
 *         ▼   5 consecutive failures  │
 *     CLOSED ───────────────────► OPEN
 *         ▲                          │
 *         │     test succeeds         │  30 s timeout
 *         │◄───────────────────────── │
 *         │    (via HALF_OPEN)        │
 *         │                          ▼
 *         │                     HALF_OPEN
 *         │                          │
 *         └──────────────────────────┘
 *              test fails → back to OPEN
 *
 * States:
 *   CLOSED    – normal, calls pass through, failures are counted
 *   OPEN      – calls rejected immediately, cooldown timer running
 *   HALF_OPEN – one test call allowed; outcome decides next state
 *
 * Transitions:
 *   CLOSED  → OPEN      — failureCount reaches maxFailures
 *   OPEN    → HALF_OPEN — nextAttemptTime elapses (checked on next call)
 *   HALF_OPEN → CLOSED  — test call succeeds
 *   HALF_OPEN → OPEN    — test call fails (resets cooldown)
 *   CLOSED  → CLOSED    — success resets failureCount to 0
 *
 * Events emitted: 'open', 'close', 'half-open'
 *   Other services can listen and, e.g., update health-check endpoints or
 *   alert operators when a provider circuit opens.
 */

export class CircuitBreakerError extends Error {
  constructor(message) {
    super(message);
    this.name = "CircuitBreakerError";
  }
}

export class CircuitBreaker {
  /**
   * @param {string} name            – human-readable identifier (e.g. "sendgrid")
   * @param {object} [options]
   * @param {number} [options.maxFailures=5]     – consecutive failures before opening
   * @param {number} [options.resetTimeout=30000] – ms in OPEN before testing again
   */
  constructor(name, { maxFailures = 5, resetTimeout = 30000 } = {}) {
    this.name = name;
    this.maxFailures = maxFailures;
    this.resetTimeout = resetTimeout;
    this.state = "CLOSED";
    this.failureCount = 0;
    this.nextAttemptTime = 0; // epoch ms; 0 means "not scheduled"

    this._listeners = { open: [], close: [], "half-open": [] };
  }

  // ── Event helpers ──

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }

  _emit(event) {
    for (const fn of this._listeners[event] || []) {
      try {
        fn(this.name, this.state);
      } catch (_) {
        // Never let a listener throw; the circuit breaker must stay reliable.
      }
    }
  }

  // ── Core ──

  /**
   * Call a function through the circuit breaker.
   * @param {Function} fn – async function wrapping the external call
   * @returns {Promise<any>} – the return value of fn on success
   * @throws {CircuitBreakerError} – when the circuit is OPEN and in cooldown
   * @throws {Error} – the original error from fn on execution failure
   */
  async call(fn) {
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttemptTime) {
        throw new CircuitBreakerError(
          `Circuit "${this.name}" is OPEN — request rejected fast`,
        );
      }
      // Cooldown expired → transition to HALF_OPEN.
      // This request IS the test.
      this.state = "HALF_OPEN";
      this._emit("half-open");
      logger.info("Circuit half-open — allowing test request", {
        breaker: this.name,
      });
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  /** Reset the breaker to CLOSED with zero failures. */
  reset() {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.nextAttemptTime = 0;
  }

  // ── Internal state transitions ──

  _onSuccess() {
    this.failureCount = 0;

    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
      this._emit("close");
      logger.info("Circuit closed — test request succeeded", {
        breaker: this.name,
      });
    }
  }

  _onFailure() {
    this.failureCount++;
    this.nextAttemptTime = Date.now() + this.resetTimeout;

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this._emit("open");
      logger.warn("Circuit opened — test request failed", {
        breaker: this.name,
        failures: this.failureCount,
      });
    } else if (this.failureCount >= this.maxFailures) {
      this.state = "OPEN";
      this._emit("open");
      logger.warn("Circuit opened — consecutive failures exceeded", {
        breaker: this.name,
        failures: this.failureCount,
      });
    }
  }
}
