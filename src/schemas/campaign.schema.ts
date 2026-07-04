import { z } from 'zod';

export const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

export const createCampaignSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  recipients: z.array(recipientSchema).min(1),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
