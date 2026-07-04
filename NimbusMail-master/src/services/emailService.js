import { logger } from "../utils/logger.js";

// SENDGRID_API_KEY and MAILGUN_API_KEY are loaded from env by dotenv.
// ENGINEER A: require("@sendgrid/mail") or formdata + Mailgun SDK here
// and initialise the client with the corresponding key.

export async function send(payload) {
  // payload: { to, subject, body, provider?: "sendgrid" | "mailgun" }
  const provider = payload.provider ?? (process.env.SENDGRID_API_KEY ? "sendgrid" : "mailgun");
  logger.info("emailService.send called", { to: payload.to, subject: payload.subject, provider });
  // TODO: integrate with the chosen provider's SDK
  return { accepted: true, messageId: null };
}

export async function sendBatch(jobs) {
  const results = await Promise.allSettled(jobs.map((j) => send(j.data)));
  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  logger.info("Batch send completed", { succeeded, failed });
  return { succeeded, failed };
}
