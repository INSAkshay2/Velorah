import express, { Request, Response, NextFunction } from 'express';
import campaignRoutes from './routes/campaign.routes';
import webhookRoutes from './routes/webhook.routes';
import statsRoutes from './routes/stats.routes';
import { createEmailWorker } from './workers/email.worker';
import { redisConnection } from './db/redis';
import { SendGridProvider } from './providers/sendgrid.provider';
import { NodemailerProvider } from './providers/nodemailer.provider';
import { MailgunProvider } from './providers/mailgun.provider';
import { ProviderRouter } from './providers/providerRouter';
import { createEmailQueue } from './queue/email.queue';
import {
  client,
  emailsSentTotal,
  emailsFailedTotal,
  emailSendDurationSeconds,
  pollQueueDepth,
  pollCircuitBreakerState,
} from './observability/metrics';

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json({
  verify: (req: Request, _res, buf: Buffer) => {
    (req as any).rawBody = buf.toString();
  },
}));

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', client.register.contentType);
  res.send(await client.register.metrics());
});

app.use('/campaigns', campaignRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/api/stats', statsRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

function startWorker() {
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const sendgridFrom = process.env.SENDGRID_FROM_EMAIL;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASS;
  const gmailFrom = process.env.GMAIL_FROM_EMAIL;
  const mailgunKey = process.env.MAILGUN_API_KEY;
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const mailgunFrom = process.env.MAILGUN_FROM_EMAIL;

  let primary: SendGridProvider | NodemailerProvider;
  let primaryName: string;

  if (sendgridKey && sendgridFrom) {
    primary = new SendGridProvider(sendgridKey, sendgridFrom);
    primaryName = 'SendGrid';
  } else if (gmailUser && gmailPass && gmailFrom) {
    primary = new NodemailerProvider(gmailFrom, gmailUser, gmailPass);
    primaryName = 'Gmail';
  } else {
    console.warn('No email provider configured (SendGrid or Gmail). Worker not started.');
    return;
  }

  const fallback =
    mailgunKey && mailgunDomain && mailgunFrom
      ? new MailgunProvider(mailgunKey, mailgunDomain, mailgunFrom)
      : primary;

  const router = new ProviderRouter(
    redisConnection,
    primary,
    fallback,
    primaryName,
    mailgunFrom ? 'Mailgun' : primaryName,
    emailsSentTotal,
    emailsFailedTotal,
    emailSendDurationSeconds,
  );

  createEmailWorker(router);
  console.log(`Email worker started (primary: ${primaryName}), listening for jobs`);

  const emailQueue = createEmailQueue();

  setInterval(async () => {
    await pollQueueDepth(emailQueue);
    await pollCircuitBreakerState(redisConnection);
  }, 10000);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startWorker();
});

export default app;
