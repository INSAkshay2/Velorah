import type { EmailProvider } from './email-provider.interface';
export declare class SendGridProvider implements EmailProvider {
    private fromEmail;
    constructor(apiKey: string, fromEmail: string);
    send(to: string, subject: string, html: string): Promise<void>;
}
//# sourceMappingURL=sendgrid.provider.d.ts.map