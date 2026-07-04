import type { EmailProvider } from './email-provider.interface';
export declare class NodemailerProvider implements EmailProvider {
    private fromEmail;
    private transporter;
    constructor(fromEmail: string, user: string, pass: string);
    send(to: string, subject: string, html: string): Promise<void>;
}
//# sourceMappingURL=nodemailer.provider.d.ts.map