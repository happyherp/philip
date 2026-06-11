-- Per-IP daily request counters for /api/chat rate limiting.

CREATE TABLE IF NOT EXISTS ip_daily_usage (
  ip TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, day)
);
