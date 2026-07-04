"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = exports.CircuitState = void 0;
const STATE_KEY = 'circuit:sendgrid';
const FAILURE_KEY = 'circuit:sendgrid:failures';
const HALF_OPEN_KEY = 'circuit:sendgrid:half-open';
const FAILURE_THRESHOLD = 5;
const FAILURE_WINDOW_SEC = 60;
const OPEN_TIMEOUT_SEC = 30;
const HALF_OPEN_TIMEOUT_SEC = 35;
var CircuitState;
(function (CircuitState) {
    CircuitState[CircuitState["CLOSED"] = 0] = "CLOSED";
    CircuitState[CircuitState["OPEN"] = 1] = "OPEN";
    CircuitState[CircuitState["HALF_OPEN"] = 2] = "HALF_OPEN";
})(CircuitState || (exports.CircuitState = CircuitState = {}));
class CircuitBreaker {
    constructor(redis) {
        this.redis = redis;
    }
    async getState() {
        const raw = await this.redis.get(STATE_KEY);
        console.log(`CircuitBreaker.getState(): raw value from Redis = ${JSON.stringify(raw)}`);
        if (raw === 'open')
            return CircuitState.OPEN;
        const halfOpen = await this.redis.exists(HALF_OPEN_KEY);
        if (halfOpen)
            return CircuitState.HALF_OPEN;
        return CircuitState.CLOSED;
    }
    async recordFailure() {
        const count = await this.redis.incr(FAILURE_KEY);
        if (count === 1) {
            await this.redis.expire(FAILURE_KEY, FAILURE_WINDOW_SEC);
        }
        if (count >= FAILURE_THRESHOLD) {
            await this.redis.setex(STATE_KEY, OPEN_TIMEOUT_SEC, 'open');
            await this.redis.setex(HALF_OPEN_KEY, HALF_OPEN_TIMEOUT_SEC, '1');
        }
    }
    async reset() {
        await this.redis.del(STATE_KEY, HALF_OPEN_KEY, FAILURE_KEY);
    }
    async call(fn) {
        const state = await this.getState();
        if (state === CircuitState.OPEN) {
            throw new Error('Circuit breaker is open');
        }
        if (state === CircuitState.HALF_OPEN) {
            try {
                const result = await fn();
                await this.reset();
                return result;
            }
            catch (err) {
                await this.redis.setex(STATE_KEY, OPEN_TIMEOUT_SEC, 'open');
                await this.redis.setex(HALF_OPEN_KEY, HALF_OPEN_TIMEOUT_SEC, '1');
                throw err;
            }
        }
        try {
            return await fn();
        }
        catch (err) {
            await this.recordFailure();
            throw err;
        }
    }
}
exports.CircuitBreaker = CircuitBreaker;
//# sourceMappingURL=circuitBreaker.js.map