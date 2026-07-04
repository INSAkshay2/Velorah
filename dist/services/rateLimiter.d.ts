export class SlidingWindowRateLimiter {
    constructor(redisClient: any, { windowMs, max }?: {
        windowMs?: number | undefined;
        max?: number | undefined;
    });
    redis: any;
    windowMs: number;
    max: number;
    isAllowed(identifier: any): Promise<{
        allowed: boolean;
        remaining: any;
        resetAt: any;
    }>;
    reset(identifier: any): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=rateLimiter.d.ts.map