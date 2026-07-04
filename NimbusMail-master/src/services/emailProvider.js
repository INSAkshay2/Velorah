import { logger } from "../utils/logger.js";
import { CircuitBreaker } from "./circuitBreaker.js";
import { emailsSentTotal, emailsFailedTotal, emailSendDuration, circuitBreakerState } from "./metrics.js";

const STATE_VAL = { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 };

/*
 * ── Multi-provider email failover layer ──
 *
 * Three providers are tried in this order on every send:
 *   1. SendGrid  (fastest, highest deliverability)
 *   2. Mailgun   (good deliverability, different IP pool)
 *   3. SMTP      (Nodemailer — generic fallback)
 *
 * Each provider is wrapped in its own CircuitBreaker.  If a provider's
 * circuit is OPEN (and still in cooldown) it is skipped.  When the
 * cooldown expires, the next request transitions it to HALF_OPEN and
 * serves as a health-check probe.
 *
 * If every circuit is OPEN, `sendWithFailover` throws
 * "All email providers unavailable".
 *
 * SDKs are imported dynamically so that missing npm packages for one
 * provider (e.g. @sendgrid/mail) do not crash the entire service.
 * A missing SDK is treated as an immediate failure for that provider.
 */

// ── Provider implementations ──

class SendGridProvider {
  name = "sendgrid";

  async send(to, subject, html) {
    let sgMail;
    try {
      sgMail = (await import("@sendgrid/mail")).default;
    } catch {
      throw new Error(
        '@sendgrid/mail not installed — run: npm install @sendgrid/mail',
      );
    }
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const [response] = await sgMail.send({
      to,
      from: process.env.SENDGRID_FROM || "noreply@example.com",
      subject,
      html,
    });
    return {
      provider: "sendgrid",
      messageId: response.headers["x-message-id"] || response.headers["x-message-id"]?.toString() || null,
    };
  }
}

class MailgunProvider {
  name = "mailgun";

  async send(to, subject, html) {
    let mgModule, formData;
    try {
      mgModule = await import("mailgun.js");
      formData = (await import("form-data")).default;
    } catch {
      throw new Error(
        'mailgun.js / form-data not installed — run: npm install mailgun.js form-data',
      );
    }
    const Mailgun = mgModule.default || mgModule;
    const mailgun = new Mailgun(formData);
    const client = mailgun.client({
      username: "api",
      key: process.env.MAILGUN_API_KEY,
    });

    const domain = process.env.MAILGUN_DOMAIN;
    const response = await client.messages.create(domain, {
      from: process.env.MAILGUN_FROM || `noreply@${domain}`,
      to,
      subject,
      html,
    });
    return { provider: "mailgun", messageId: response.id || response.messageId || null };
  }
}

class SMTPProvider {
  name = "smtp";

  constructor() {
    this._transporter = null;
  }

  async _getTransporter() {
    if (this._transporter) return this._transporter;

    let nodemailer;
    try {
      nodemailer = (await import("nodemailer")).default;
    } catch {
      throw new Error(
        'nodemailer not installed — run: npm install nodemailer',
      );
    }

    const auth =
      process.env.SMTP_USER || process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined;

    this._transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth,
    });
    return this._transporter;
  }

  async send(to, subject, html) {
    const transporter = await this._getTransporter();
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || "noreply@example.com",
      to,
      subject,
      html,
    });
    return { provider: "smtp", messageId: info.messageId || null };
  }
}

// ── Failover orchestrator ──

export class EmailProviderFailover {
  /**
   * @param {Array<{provider: {name:string, send:Function}, breaker: CircuitBreaker}>} [providers]
   *   Optional custom list, used for testing.  Defaults to SendGrid → Mailgun → SMTP.
   */
  constructor(providers) {
    this.providers = providers ?? [
      { provider: new SendGridProvider(), breaker: new CircuitBreaker("sendgrid") },
      { provider: new MailgunProvider(),  breaker: new CircuitBreaker("mailgun") },
      { provider: new SMTPProvider(),     breaker: new CircuitBreaker("smtp") },
    ];
    for (const { breaker } of this.providers) {
      circuitBreakerState.set({ provider: breaker.name }, STATE_VAL[breaker.state]);
      breaker.on("open",    (n) => circuitBreakerState.set({ provider: n }, 2));
      breaker.on("close",   (n) => circuitBreakerState.set({ provider: n }, 0));
      breaker.on("half-open", (n) => circuitBreakerState.set({ provider: n }, 1));
    }
  }

  /**
   * Send an email by trying providers in order: SendGrid → Mailgun → SMTP.
   *
   * @param {object} job
   * @param {string} job.to      – recipient email
   * @param {string} job.subject – email subject
   * @param {string} job.html    – HTML body
   * @returns {Promise<{provider: string, messageId: string|null}>}
   * @throws {Error} when every provider circuit is OPEN
   */
  async sendWithFailover(job) {
    const { to, subject, html } = job;
    const errors = [];

    for (const { provider, breaker } of this.providers) {
      const endTimer = emailSendDuration.startTimer({ provider: provider.name });
      try {
        const result = await breaker.call(() => provider.send(to, subject, html));
        endTimer();
        emailsSentTotal.inc({ provider: provider.name });
        logger.info("Email sent", {
          provider: provider.name,
          to,
          subject,
          messageId: result.messageId,
        });
        return result;
      } catch (err) {
        endTimer();
        if (err.name === "CircuitBreakerError") {
          logger.warn("Skipping provider — circuit open", { provider: provider.name });
          continue;
        }
        emailsFailedTotal.inc({ provider: provider.name, reason: (err.message || "unknown").slice(0, 100) });
        logger.warn("Provider send failed, trying next", {
          provider: provider.name,
          error: err.message,
        });
        errors.push({ provider: provider.name, error: err.message });
      }
    }

    // Every provider exhausted or circuit-open
    throw new Error(
      `All email providers unavailable. Attempted: ${this.providers.map((p) => p.provider.name).join(", ")}. Errors: ${errors.map((e) => `${e.provider}=${e.error}`).join("; ")}`,
    );
  }

  /** Expose circuit breakers so consumers can attach event listeners. */
  getBreaker(name) {
    return this.providers.find((p) => p.breaker.name === name)?.breaker ?? null;
  }
}

// ── Default singleton ──
export default new EmailProviderFailover();
