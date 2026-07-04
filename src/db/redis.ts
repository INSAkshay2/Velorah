import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const redisConnection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
