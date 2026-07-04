import pg from "pg";

// Neon Postgres connection pool created from the single DATABASE_URL supplied by
// the Railway / Neon dashboard.  ENGINEER A: swap the Pool constructor if you
// need SSL-override options or a custom schema search path.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected pool error — aborting", err);
  process.exit(1);
});
