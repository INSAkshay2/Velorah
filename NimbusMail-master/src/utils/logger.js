const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const log = (level, message, meta) => {
  if (LEVELS[level] < currentLevel) return;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    env: process.env.NODE_ENV,
    message,
    ...meta,
  };
  const output = JSON.stringify(entry);
  if (level === "error") process.stderr.write(output + "\n");
  else process.stdout.write(output + "\n");
};

export const logger = {
  debug: (msg, meta) => log("debug", msg, meta),
  info:  (msg, meta) => log("info",  msg, meta),
  warn:  (msg, meta) => log("warn",  msg, meta),
  error: (msg, meta) => log("error", msg, meta),
};
