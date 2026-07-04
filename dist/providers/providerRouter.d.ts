import type Redis from 'ioredis';
import type { Counter, Histogram } from 'prom-client';
import type { EmailProvider } from './email-provider.interface';
export declare class ProviderRouter implements EmailProvider {
    private primary;
    private fallback;
    private sentCounter?;
    private failedCounter?;
    private durationHistogram?;
    private circuitBreaker;
    private primaryName;
    private fallbackName;
    constructor(redis: Redis, primary: EmailProvider, fallback: EmailProvider, primaryName?: string, fallbackName?: string, sentCounter?: Counter<string> | undefined, failedCounter?: Counter<string> | undefined, durationHistogram?: Histogram<string> | undefined);
    send(to: string, subject: string, html: string): Promise<void>;
}
//# sourceMappingURL=providerRouter.d.ts.map