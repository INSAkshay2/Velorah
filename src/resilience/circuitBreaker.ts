import type Redis from 'ioredis';

const STATE_KEY = 'circuit:sendgrid';
const FAILURE_KEY = 'circuit:sendgrid:failures';
const HALF_OPEN_KEY = 'circuit:sendgrid:half-open';

const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_SEC = 60;
const OPEN_TIMEOUT_SEC = 30;
const HALF_OPEN_TIMEOUT_SEC = 35;

export enum CircuitState {
  CLOSED,
  OPEN,
  HALF_OPEN,
}

export class CircuitBreaker {
  constructor(private redis: Redis) {}

  async getState(): Promise<CircuitState> {
    const raw = await this.redis.get(STATE_KEY);
    console.log(`CircuitBreaker.getState(): raw value from Redis = ${JSON.stringify(raw)}`);

    if (raw === 'open') return CircuitState.OPEN;

    const halfOpen = await this.redis.exists(HALF_OPEN_KEY);
    if (halfOpen) return CircuitState.HALF_OPEN;

    return CircuitState.CLOSED;
  }

  async recordFailure(): Promise<void> {
    const count = await this.redis.incr(FAILURE_KEY);
    if (count === 1) {
      await this.redis.expire(FAILURE_KEY, FAILURE_WINDOW_SEC);
    }

    if (count >= FAILURE_THRESHOLD) {
      await this.redis.setex(STATE_KEY, OPEN_TIMEOUT_SEC, 'open');
      await this.redis.setex(HALF_OPEN_KEY, HALF_OPEN_TIMEOUT_SEC, '1');
    }
  }

  async reset(): Promise<void> {
    await this.redis.del(STATE_KEY, HALF_OPEN_KEY, FAILURE_KEY);
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    const state = await this.getState();

    if (state === CircuitState.OPEN) {
      throw new Error('Circuit breaker is open');
    }

    if (state === CircuitState.HALF_OPEN) {
      try {
        const result = await fn();
        await this.reset();
        return result;
      } catch (err) {
        await this.redis.setex(STATE_KEY, OPEN_TIMEOUT_SEC, 'open');
        await this.redis.setex(HALF_OPEN_KEY, HALF_OPEN_TIMEOUT_SEC, '1');
        throw err;
      }
    }

    try {
      return await fn();
    } catch (err) {
      await this.recordFailure();
      throw err;
    }
  }
}
