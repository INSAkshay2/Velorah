import { Queue } from "bullmq";
import Redis from "ioredis";

// BullMQ requires a dedicated Redis connection per role (producer vs consumer).
// This connection is only used for the queue producer side (adding jobs).
// maxRetriesPerRequest: null + enableReadyCheck: false are required by BullMQ v5.
const connection = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const emailQueue = new Queue("emailQueue", { connection });

export async function closeEmailQueue() {
  await emailQueue.close();
  await connection.quit();
}
