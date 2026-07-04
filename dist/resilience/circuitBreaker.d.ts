import type Redis from 'ioredis';
export declare enum CircuitState {
    CLOSED = 0,
    OPEN = 1,
    HALF_OPEN = 2
}
export declare class CircuitBreaker {
    private redis;
    constructor(redis: Redis);
    getState(): Promise<CircuitState>;
    recordFailure(): Promise<void>;
    reset(): Promise<void>;
    call<T>(fn: () => Promise<T>): Promise<T>;
}
//# sourceMappingURL=circuitBreaker.d.ts.map