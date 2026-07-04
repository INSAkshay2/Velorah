import { Router } from "express";
import { getMetrics, emailQueueDepth } from "../services/metrics.js";
import { pool } from "../db/index.js";
import { emailQueue } from "../queues/emailQueue.js";
import emailProvider from "../services/emailProvider.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

router.get("/metrics", async (_req, res) => {
  res.set("Content-Type", "text/plain; charset=utf-8");
  res.send(await getMetrics());
});

router.get("/api/stats/summary", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total, COALESCE(SUM(CASE WHEN status=$1 THEN 1 ELSE 0 END),0)::int AS sent, COALESCE(SUM(CASE WHEN status=$2 THEN 1 ELSE 0 END),0)::int AS failed FROM delivery_events",
      ["sent", "failed"],
    );
    const { total, sent, failed } = rows[0];
    const deliveryRate = total > 0 ? parseFloat(((sent / total) * 100).toFixed(2)) : 100;
    let queueDepth = 0;
    try {
      queueDepth = await emailQueue.getWaitingCount();
    } catch (_) {}
    emailQueueDepth.set(queueDepth);
    res.json({ totalSent: sent, deliveryRate, failed, queueDepth });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/stats/hourly", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD\"T\"HH24:00:00\"Z\"') AS hour, COUNT(*)::int AS count FROM delivery_events WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY hour ORDER BY hour",
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/stats/providers", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT provider, COUNT(*)::int AS total, COALESCE(SUM(CASE WHEN status=$1 THEN 1 ELSE 0 END),0)::int AS sent_count, COALESCE(SUM(CASE WHEN status=$2 THEN 1 ELSE 0 END),0)::int AS fail_count FROM delivery_events WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY provider",
      ["sent", "failed"],
    );
    const providerMap = {};
    for (const r of rows) providerMap[r.provider] = { sentCount: r.sent_count, failCount: r.fail_count };
    const result = emailProvider.providers.map(({ provider, breaker }) => ({
      name: provider.name,
      state: breaker.state,
      sentCount: providerMap[provider.name]?.sentCount ?? 0,
      failCount: providerMap[provider.name]?.failCount ?? 0,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/stats/failures", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, campaign_id, recipient, provider, error, created_at FROM delivery_events WHERE status=$1 ORDER BY created_at DESC LIMIT 20",
      ["failed"],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/settings/ai", (req, res) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }
  process.env.AI_PERSONALISATION_ENABLED = enabled ? "true" : "false";
  res.json({ enabled });
});

export default router;
