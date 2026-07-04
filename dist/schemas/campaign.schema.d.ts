import { z } from 'zod';
export declare const recipientSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
}, z.core.$strip>;
export declare const createCampaignSchema: z.ZodObject<{
    name: z.ZodString;
    subject: z.ZodString;
    body: z.ZodString;
    recipients: z.ZodArray<z.ZodObject<{
        email: z.ZodString;
        name: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
//# sourceMappingURL=campaign.schema.d.ts.map