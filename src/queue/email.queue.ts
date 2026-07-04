import { Queue } from 'bullmq';

export const EMAIL_QUEUE = 'email';

export interface EmailJobData {
  jobId: number;
  campaignId: number;
  recipientId: number;
  to: string;
  subject: string;
  html: string;
  recipientName?: string;
  campaignTopic?: string;
}

export function createEmailQueue() {
  return new Queue<EmailJobData>(EMAIL_QUEUE, {
    connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'custom' },
    },
  });
}
