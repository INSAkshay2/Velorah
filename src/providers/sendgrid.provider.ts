import sgMail from '@sendgrid/mail';
import type { EmailProvider } from './email-provider.interface';

export class SendGridProvider implements EmailProvider {
  constructor(apiKey: string, private fromEmail: string) {
    sgMail.setApiKey(apiKey);
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    await sgMail.send({ to, from: this.fromEmail, subject, html });
  }
}
