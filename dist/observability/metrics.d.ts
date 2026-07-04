import client from 'prom-client';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
export declare const registry: client.Registry<"text/plain; version=0.0.4; charset=utf-8">;
export declare const emailsSentTotal: client.Counter<"provider">;
export declare const emailsFailedTotal: client.Counter<"provider">;
export declare const emailSendDurationSeconds: client.Histogram<"provider">;
export declare const queueDepth: client.Gauge<string>;
export declare const circuitBreakerState: client.Gauge<string>;
export declare const rateLimiterRejectionsTotal: client.Counter<string>;
export declare const aiPersonalisationCallsTotal: client.Counter<"result">;
export declare function pollQueueDepth(emailQueue: Queue): Promise<void>;
export declare function pollCircuitBreakerState(redis: Redis): Promise<void>;
export { client };
//# sourceMappingURL=metrics.d.ts.map