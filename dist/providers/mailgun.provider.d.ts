import type { EmailProvider } from './email-provider.interface';
export declare class MailgunProvider implements EmailProvider {
    private fromEmail;
    private client;
    constructor(apiKey: string, domain: string, fromEmail: string);
    send(to: string, subject: string, html: string): Promise<void>;
}
//# sourceMappingURL=mailgun.provider.d.ts.map