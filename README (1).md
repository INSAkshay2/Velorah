# 📬 Bulk Email Delivery Service

A production-grade, multi-provider bulk email delivery service built on BullMQ,
Express, and Redis. Designed to send **thousands of emails per minute** with
zero duplicates, automatic provider failover, rate limiting, and AI-powered
subject-line personalisation.

---

## Architecture

````
                    ┌─────────────┐
                    │   Client    │
                    │ (API / k6)  │
                    └──────┬──────┘
                           │ POST /api/campaigns
                           ▼
              ┌────────────────────────┐
              │   Express (src/)       │
              │  /health  /metrics     │
              │  /api/stats/*          │
              │  /api/campaigns        │
              └────────┬───────────────┘
                       │
              ┌────────▼───────────────┐
              │  BullMQ Queue          │
              │  (Upstash Redis)       │
              └────────┬───────────────┘
                       │ jobs
              ┌────────▼───────────────┐
              │  BullMQ Worker         │
              │  ┌─────────────────┐   │
              │  │ Idempotency     │   │  ← SET NX atomic guard
              │  │ (SHA-256 key)   │   │
              │  ├─────────────────┤   │
              │  │ Rate Limiter    │   │  ← Redis Lua EVAL sliding window
              │  │ (100/min)       │   │
              │  ├─────────────────┤   │
              │  │ AI Personaliser │   │  ← Anthropic Claude Haiku
              │  │ (token bucket)  │   │
              │  ├─────────────────┤   │
              │  │ SendGrid ───────x───│──→ Circuit OPENS after 5 failures
              │  │ Mailgun ────────▼───│──→ Fallback provider
              │  │ SMTP (last)     │   │
              │  └─────────────────┘   │
              # Email Bulk Delivery Service

              A production-grade bulk email platform built with Express, BullMQ, Redis, and Postgres. It is designed to send campaigns reliably at scale with provider failover, deduplication, rate limiting, AI-assisted subject personalization, and a live dashboard for ops visibility.

              ## Screenshots

              | Brand / hero screen | Observability dashboard |
              | --- | --- |
              | ![Brand hero screen](./WhatsApp%20Image%202026-07-04%20at%2016.25.38.jpeg) | ![Grafana-style observability dashboard](./WhatsApp%20Image%202026-07-04%20at%2016.25.39.jpeg) |
              | Runtime log stream | Campaign API request |
              | ![Server runtime logs](./2nd%20pic.jpeg) | ![Thunder Client campaign request](./WhatsApp%20Image%202026-07-09%20at%2013.05.29.jpeg) |

              ## What It Does

              - Accepts campaign creation requests through `POST /api/campaigns`.
              - Enqueues one BullMQ job per recipient and tracks delivery state in Postgres.
              - Prevents duplicate sends with Redis-backed idempotency keys.
              - Applies a Redis Lua sliding-window rate limiter before every send.
              - Sends through a failover chain of SendGrid, Mailgun, then SMTP.
              - Personalizes subject lines with Gemini, a Redis cache, and a token bucket.
              - Exposes health, metrics, and campaign stats endpoints for monitoring.
              - Ships with a React dashboard that visualizes delivery rate, queue depth, provider health, and recent failures.

              ## Architecture

              ```mermaid
              flowchart TD
                A[Client / API tool / Dashboard] --> B[Express API]
                B --> C[Postgres campaigns + delivery_events]
                B --> D[BullMQ Queue]
                D --> E[BullMQ Worker]
                E --> F[Idempotency guard\nRedis SET NX]
                E --> G[Rate limiter\nRedis Lua sliding window]
                E --> H[AI personalization\nGemini + cache]
                E --> I[SendGrid]
                I --> J[Mailgun]
                J --> K[SMTP fallback]
                E --> L[Metrics + queue depth]
                B --> M[/metrics]
                B --> N[/dashboard]
              ```

              ## Key Features

              ### Reliable delivery

              Each provider is wrapped in a circuit breaker with `CLOSED`, `OPEN`, and `HALF_OPEN` states. After 5 consecutive failures, a provider is skipped for a 30-second cooldown before a test request is allowed back through. That keeps the system moving even when one provider is down.

              ### No duplicate sends

              The worker uses an atomic Redis `SET NX` guard keyed by campaign and recipient email, so retries and queue re-deliveries do not create duplicate messages.

              ### Safe throttling

              The rate limiter uses a Redis sorted-set Lua script to enforce a 100 sends per minute sliding window. If Redis is temporarily unavailable, the limiter fails open so sending can continue.

              ### AI-powered subject lines

              The personalizer calls Gemini, caches successful responses for one hour, enforces a 10 req/s token bucket, and times out after 3 seconds. If anything goes wrong, the original subject line is used.

              ### Production metrics

              The `/metrics` endpoint exposes Prometheus-ready counters, histograms, and gauges for sent emails, failures, send latency, queue depth, circuit breaker state, rate-limit rejections, and AI usage.

              ### Live dashboard

              The dashboard shows total sent, delivery rate, failed messages, queue depth, provider health, recent failures, and an AI toggle. Summary data refreshes every 5 seconds and the hourly chart refreshes every 30 seconds.

              ## API

              | Method | Path | Description |
              | --- | --- | --- |
              | GET | `/health` | Liveness check with uptime and queue depth |
              | GET | `/metrics` | Prometheus metrics text output |
              | POST | `/api/campaigns` | Create a campaign and enqueue recipient jobs |
              | GET | `/api/campaigns/:id` | Fetch campaign status and delivery rate |
              | GET | `/api/stats/summary` | Total sent, delivery rate, failures, queue depth |
              | GET | `/api/stats/hourly` | 24-hour send volume |
              | GET | `/api/stats/providers` | Provider health and volume |
              | GET | `/api/stats/failures` | Most recent failed deliveries |
              | PATCH | `/api/settings/ai` | Toggle AI personalization on or off |

              ## Tech Stack

              - Node.js + Express
              - BullMQ + Redis
              - PostgreSQL
              - prom-client / Prometheus metrics
              - Vite + React dashboard
              - Recharts for the hourly chart
              - Tailwind CSS for styling

              ## Getting Started

              ### Prerequisites

              - Node.js 22+
              - Redis
              - PostgreSQL
              - At least one email provider credential set
              - Optional: Google API key for AI personalization

              ### Install

              ```bash
              npm install
              cd dashboard
              npm install
              ```

              ### Run locally

              ```bash
              # backend
              npm run dev

              # dashboard in a second terminal
              cd dashboard
              npm run dev
              ```

              ### Verify

              ```bash
              curl http://localhost:3000/health
              curl http://localhost:3000/metrics
              npm test
              ```

              ## Environment Variables

              | Variable | Purpose |
              | --- | --- |
              | `REDIS_URL` | Redis connection string used by the queue, limiter, idempotency, and AI cache |
              | `DATABASE_URL` | Postgres connection string |
              | `SENDGRID_API_KEY` | SendGrid API key |
              | `SENDGRID_FROM` | Verified SendGrid sender address |
              | `MAILGUN_API_KEY` | Mailgun API key |
              | `MAILGUN_DOMAIN` | Mailgun sending domain |
              | `MAILGUN_FROM` | Optional Mailgun sender address |
              | `SMTP_HOST` | SMTP server hostname |
              | `SMTP_PORT` | SMTP server port |
              | `SMTP_USER` | SMTP username |
              | `SMTP_PASS` | SMTP password |
              | `SMTP_FROM` | SMTP sender address |
              | `SMTP_SECURE` | `true` for implicit TLS, otherwise `false` |
              | `GOOGLE_API_KEY` | Gemini API key used for subject personalization |
              | `AI_PERSONALISATION_ENABLED` | `true` or `false` runtime toggle |
              | `PORT` | Server port, defaults to `3000` |

              ## Scripts

              ### Root

              ```bash
              npm run dev
              npm start
              npm test
              npm run metrics
              ```

              ### Dashboard

              ```bash
              cd dashboard
              npm run dev
              npm run build
              ```

              ## Load Testing

              The `load-tests/campaign.js` script exercises the campaign flow under realistic traffic. Run it against localhost or a deployed instance with k6.

              ```bash
              k6 run load-tests/campaign.js
              k6 run -e BASE_URL=https://your-app.example.com load-tests/campaign.js
              ```

              ## Project Structure

              ```text
              src/
              ├── db/              # Postgres pool and schema bootstrap
              ├── queues/          # BullMQ queue definition
              ├── routes/          # Health, stats, campaigns, and AI toggle routes
              ├── services/        # Rate limiting, metrics, failover, idempotency, AI
              ├── utils/           # Logger helpers
              └── workers/         # BullMQ worker that sends emails

              dashboard/           # Vite + React UI
              load-tests/          # k6 campaign load test
              tests/               # Integration and service tests
              ```

              ## Notes

              - The worker updates campaign status in `delivery_events` and marks a campaign `completed` when all recipients have been processed.
              - The dashboard reads directly from the API and is safe to run independently.
              - The screenshots in this README are stored alongside the project for easy reuse.

              ## License

              MIT
```bash
````
