import nodemailer from 'nodemailer';
import type { EmailProvider } from './email-provider.interface';

export class NodemailerProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor(
    private fromEmail: string,
    user: string,
    pass: string,
  ) {
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.fromEmail,
      to,
      subject,
      html,
    });
  }
}
