// D1-backed usage limits for /api/chat. These are a hard backstop independent
// of Turnstile: Turnstile gates conversation creation, the caps here bound how
// much any single conversation or IP can spend on LLM calls.

export interface RateLimits {
  /** Max user messages allowed in a single conversation. */
  maxMessagesPerConversation: number;
  /** Max chat requests allowed per client IP per UTC day. */
  maxMessagesPerIpPerDay: number;
}

export const DEFAULT_LIMITS: RateLimits = {
  maxMessagesPerConversation: 200,
  maxMessagesPerIpPerDay: 300,
};

/** UTC day bucket, e.g. "2026-06-11". */
export function currentDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Record one chat request for this IP and return whether it is still within
 * the daily budget. Requests with no resolvable IP share an "unknown" bucket.
 */
export async function recordIpUsage(
  db: D1Database,
  ip: string | null,
  limit: number,
  day: string = currentDay(),
): Promise<{ allowed: boolean; count: number }> {
  const row = await db
    .prepare(
      `INSERT INTO ip_daily_usage (ip, day, count) VALUES (?, ?, 1)
       ON CONFLICT (ip, day) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(ip ?? "unknown", day)
    .first<{ count: number }>();

  const count = row?.count ?? 1;
  return { allowed: count <= limit, count };
}
