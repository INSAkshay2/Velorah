import "dotenv/config";
import express from "express";
import { logger } from "./utils/logger.js";
import { emailQueue, closeEmailQueue } from "./queues/emailQueue.js";
import { emailWorker, closeEmailWorker } from "./workers/emailWorker.js";
import { pool } from "./db/index.js";
import routes from "./routes/index.js";
import { emailQueueDepth } from "./services/metrics.js";

const app = express();
app.use(express.json());
app.use(routes);

// ── Queue depth gauge (updated every 10s) ──
const queueDepthTimer = setInterval(async () => {
  try {
    const count = await emailQueue.getWaitingCount();
    emailQueueDepth.set(count);
  } catch (_) {
    // will retry next interval
  }
}, 10_000);

// ── Graceful shutdown ──
const shutdown = async (signal) => {
  logger.info(`${signal} received — starting graceful shutdown`);

  server.close(async () => {
    logger.info("HTTP server closed");

    clearInterval(queueDepthTimer);

    await closeEmailWorker();
    logger.info("Worker shut down");

    await closeEmailQueue();
    logger.info("Queue connection closed");

    await pool.end();
    logger.info("Database pool closed");

    logger.info("Goodbye");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ── Start ──
const PORT = process.env.PORT ?? 3000;
const server = app.listen(PORT, () => {
  logger.info("Service started", { port: PORT, queue: emailQueue.name });
});
