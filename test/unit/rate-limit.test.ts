import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestD1 } from "../helpers.ts";
import { currentDay, recordIpUsage } from "../../src/rate-limit.ts";
import type { D1Database } from "@cloudflare/workers-types";

let db: D1Database;
let dispose: () => Promise<void>;

beforeAll(async () => {
  ({ db, dispose } = await createTestD1());
});

afterAll(async () => {
  await dispose();
});

describe("currentDay", () => {
  it("formats the UTC day as YYYY-MM-DD", () => {
    expect(currentDay(new Date("2026-06-11T23:59:59Z"))).toBe("2026-06-11");
    expect(currentDay(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01-01");
  });
});

describe("recordIpUsage", () => {
  it("counts requests per IP and allows up to the limit", async () => {
    const limit = 3;
    for (let i = 1; i <= limit; i++) {
      const res = await recordIpUsage(db, "10.0.0.1", limit, "2026-06-11");
      expect(res).toEqual({ allowed: true, count: i });
    }
    const blocked = await recordIpUsage(db, "10.0.0.1", limit, "2026-06-11");
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(limit + 1);
  });

  it("tracks different IPs independently", async () => {
    await recordIpUsage(db, "10.0.0.2", 5, "2026-06-11");
    const other = await recordIpUsage(db, "10.0.0.3", 5, "2026-06-11");
    expect(other.count).toBe(1);
  });

  it("resets per day", async () => {
    await recordIpUsage(db, "10.0.0.4", 1, "2026-06-11");
    const blockedToday = await recordIpUsage(db, "10.0.0.4", 1, "2026-06-11");
    expect(blockedToday.allowed).toBe(false);

    const tomorrow = await recordIpUsage(db, "10.0.0.4", 1, "2026-06-12");
    expect(tomorrow).toEqual({ allowed: true, count: 1 });
  });

  it("buckets requests without an IP under 'unknown'", async () => {
    const res = await recordIpUsage(db, null, 5, "2026-06-11");
    expect(res.allowed).toBe(true);
    const row = await db
      .prepare("SELECT count FROM ip_daily_usage WHERE ip = 'unknown' AND day = '2026-06-11'")
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });
});
