import type Redis from 'ioredis';
import type { Counter, Histogram } from 'prom-client';
import type { EmailProvider } from './email-provider.interface';
import { CircuitBreaker, CircuitState } from '../resilience/circuitBreaker';

export class ProviderRouter implements EmailProvider {
  private circuitBreaker: CircuitBreaker;
  private primaryName: string;
  private fallbackName: string;

  constructor(
    redis: Redis,
    private primary: EmailProvider,
    private fallback: EmailProvider,
    primaryName = 'SendGrid',
    fallbackName = 'Mailgun',
    private sentCounter?: Counter<string>,
    private failedCounter?: Counter<string>,
    private durationHistogram?: Histogram<string>,
  ) {
    this.circuitBreaker = new CircuitBreaker(redis);
    this.primaryName = primaryName;
    this.fallbackName = fallbackName;
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    const start = Date.now();
    const state = await this.circuitBreaker.getState();
    const stateName = CircuitState[state];
    console.log(`ProviderRouter.send(): state = ${stateName} (${state})`);

    if (state === CircuitState.OPEN) {
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
    } catch (err) {
      const stateAfterFailure = await this.circuitBreaker.getState();
      const stateAfterName = CircuitState[stateAfterFailure];
      console.log(
        `ProviderRouter.send(): post-failure state = ${stateAfterName} (${stateAfterFailure})`,
      );

      if (stateAfterFailure === CircuitState.OPEN) {
        console.log(
          `${this.primaryName} failed, circuit now open. Routing via ${this.fallbackName}`,
        );
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
