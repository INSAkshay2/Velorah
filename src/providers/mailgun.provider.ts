import Mailgun from 'mailgun.js';
import formData from 'form-data';
import type { EmailProvider } from './email-provider.interface';

export class MailgunProvider implements EmailProvider {
  private client: ReturnType<InstanceType<typeof Mailgun>['client']>;

  constructor(apiKey: string, domain: string, private fromEmail: string) {
    const mg = new Mailgun(formData);
    this.client = mg.client({ username: 'api', key: apiKey });
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    await this.client.messages.create(this.fromEmail.split('@')[1] ?? '', {
      from: this.fromEmail,
      to,
      subject,
      html,
    });
  }
}
