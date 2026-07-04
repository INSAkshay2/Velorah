import { Queue } from 'bullmq';
export declare const EMAIL_QUEUE = "email";
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
export declare function createEmailQueue(): Queue<EmailJobData, any, string, EmailJobData, any, string>;
//# sourceMappingURL=email.queue.d.ts.map