"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProviderRouter = void 0;
const circuitBreaker_1 = require("../resilience/circuitBreaker");
class ProviderRouter {
    constructor(redis, primary, fallback, primaryName = 'SendGrid', fallbackName = 'Mailgun', sentCounter, failedCounter, durationHistogram) {
        this.primary = primary;
        this.fallback = fallback;
        this.sentCounter = sentCounter;
        this.failedCounter = failedCounter;
        this.durationHistogram = durationHistogram;
        this.circuitBreaker = new circuitBreaker_1.CircuitBreaker(redis);
        this.primaryName = primaryName;
        this.fallbackName = fallbackName;
    }
    async send(to, subject, html) {
        const start = Date.now();
        const state = await this.circuitBreaker.getState();
        const stateName = circuitBreaker_1.CircuitState[state];
        console.log(`ProviderRouter.send(): state = ${stateName} (${state})`);
        if (state === circuitBreaker_1.CircuitState.OPEN) {
            console.log(`Circuit open, routing via ${this.fallbackName}`);
            await this.fallback.send(to, subject, html);
            const duration = (Date.now() - start) / 1000;
            this.sentCounter?.inc({ provider: this.fallbackName });
            this.durationHistogram?.observe({ provider: this.fallbackName }, duration);
            console.log(`Sent via ${this.fallbackName} (circuit breaker fallback)`);
            return;
        }
        try {
            await this.circuitBreaker.call(async () => {
                await this.primary.send(to, subject, html);
            });
            const duration = (Date.now() - start) / 1000;
            this.sentCounter?.inc({ provider: this.primaryName });
            this.durationHistogram?.observe({ provider: this.primaryName }, duration);
            console.log(`Sent via ${this.primaryName}`);
        }
        catch (err) {
            const stateAfterFailure = await this.circuitBreaker.getState();
            const stateAfterName = circuitBreaker_1.CircuitState[stateAfterFailure];
            console.log(`ProviderRouter.send(): post-failure state = ${stateAfterName} (${stateAfterFailure})`);
            if (stateAfterFailure === circuitBreaker_1.CircuitState.OPEN) {
                console.log(`${this.primaryName} failed, circuit now open. Routing via ${this.fallbackName}`);
                await this.fallback.send(to, subject, html);
                const duration = (Date.now() - start) / 1000;
                this.sentCounter?.inc({ provider: this.fallbackName });
                this.durationHistogram?.observe({ provider: this.fallbackName }, duration);
                console.log(`Sent via ${this.fallbackName} (circuit breaker fallback)`);
                return;
            }
            this.failedCounter?.inc({ provider: this.primaryName });
            throw err;
        }
    }
}
exports.ProviderRouter = ProviderRouter;
//# sourceMappingURL=providerRouter.js.map