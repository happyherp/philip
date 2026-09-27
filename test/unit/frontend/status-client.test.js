import { describe, it, expect, vi } from "vitest";
import { fetchSearchStatus, pollSearchStatus } from "../../../public/frontend/status-client.js";

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe("fetchSearchStatus (client)", () => {
  it("GETs the status endpoint and returns status + detail", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: "ready", detail: "Semantic search ready (120 ms)." }),
    );
    const out = await fetchSearchStatus({ fetchImpl });
    expect(out).toEqual({ status: "ready", detail: "Semantic search ready (120 ms)." });

    expect(fetchImpl.mock.calls[0][0]).toBe("/api/search/status");
    expect(fetchImpl.mock.calls[0][1].method).toBe("GET");
  });

  it("passes through a warming status", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "warming", detail: "waking" }));
    expect(await fetchSearchStatus({ fetchImpl })).toEqual({ status: "warming", detail: "waking" });
  });

  it("returns error on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 500));
    const out = await fetchSearchStatus({ fetchImpl });
    expect(out.status).toBe("error");
  });

  it("returns error when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });
    const out = await fetchSearchStatus({ fetchImpl });
    expect(out.status).toBe("error");
  });

  it("coerces an unrecognized status to error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "banana" }));
    const out = await fetchSearchStatus({ fetchImpl });
    expect(out.status).toBe("error");
  });
});

describe("pollSearchStatus", () => {
  const noSleep = vi.fn(async () => {});

  it("stops immediately and reports ready", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "ready", detail: "fast" }));
    const updates = [];
    const out = await pollSearchStatus({
      fetchImpl,
      sleep: noSleep,
      onUpdate: (status, detail) => updates.push({ status, detail }),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ status: "ready", detail: "fast" });
    expect(updates).toEqual([{ status: "ready", detail: "fast" }]);
  });

  it("stops immediately and reports a hard error without retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "error", detail: "boom" }));
    const out = await pollSearchStatus({ fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ status: "error", detail: "boom" });
  });

  it("backs off between warm-up attempts, growing the interval up to a cap", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call < 6
        ? jsonResponse({ status: "warming", detail: "waking" })
        : jsonResponse({ status: "ready", detail: "up now" });
    });
    const sleep = vi.fn(async () => {});
    const out = await pollSearchStatus({
      fetchImpl,
      sleep,
      initialIntervalMs: 3000,
      backoffFactor: 2,
      maxIntervalMs: 20000,
    });
    expect(out).toEqual({ status: "ready", detail: "up now" });
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([3000, 6000, 12000, 20000, 20000]);
  });

  it("keeps warming up for the whole budget (a cold HF Space takes ~2 min), not ~30 s", async () => {
    // Regression: the old 8 x 3 s loop gave up long before a sleeping
    // HuggingFace Space finished its ~2 minute cold start, so the reader who
    // woke it never got search. With the defaults, a Space that becomes ready
    // after 150 s of (simulated) waiting must still be picked up in the
    // warm-up phase.
    let waited = 0;
    const sleep = vi.fn(async (ms) => {
      waited += ms;
    });
    const fetchImpl = vi.fn(async () =>
      waited >= 150_000
        ? jsonResponse({ status: "ready", detail: "up now" })
        : jsonResponse({ status: "warming", detail: "waking" }),
    );
    const updates = [];
    const out = await pollSearchStatus({
      fetchImpl,
      sleep,
      onUpdate: (status) => updates.push(status),
    });
    expect(out).toEqual({ status: "ready", detail: "up now" });
    expect(updates.every((s) => s === "warming" || s === "ready")).toBe(true);
    // Every sleep so far was a warm-up sleep (background checks are 60 s apart
    // and only start once the 180 s warm-up budget is spent).
    expect(waited).toBeLessThan(180_000);
  });

  it("after the warm-up budget, keeps checking in the background and flips to ready later", async () => {
    let waited = 0;
    const sleep = vi.fn(async (ms) => {
      waited += ms;
    });
    const fetchImpl = vi.fn(async () =>
      waited >= 400_000
        ? jsonResponse({ status: "ready", detail: "finally up" })
        : jsonResponse({ status: "warming", detail: "Service is waking up (HTTP 503)." }),
    );
    const updates = [];
    const out = await pollSearchStatus({
      fetchImpl,
      sleep,
      warmupBudgetMs: 30_000,
      backgroundIntervalMs: 60_000,
      onUpdate: (status, detail) => updates.push({ status, detail }),
    });
    expect(out).toEqual({ status: "ready", detail: "finally up" });
    // Never shown as a hard error while background checks are still running.
    expect(updates.some((u) => u.status === "error")).toBe(false);
    expect(updates.some((u) => /background/i.test(u.detail))).toBe(true);
    // Background sleeps use the slow interval.
    expect(sleep).toHaveBeenCalledWith(60_000);
  });

  it("gives up with an error once the background checks are also exhausted", async () => {
    // A Space stuck crashed (not merely asleep) returns 503 forever, reported
    // as "warming". The indicator must not claim "warming up" indefinitely.
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: "warming", detail: "Service is waking up (HTTP 503)." }),
    );
    const updates = [];
    const out = await pollSearchStatus({
      fetchImpl,
      sleep: noSleep,
      warmupBudgetMs: 10_000,
      initialIntervalMs: 5000,
      backgroundIntervalMs: 60_000,
      backgroundMaxTries: 3,
      onUpdate: (status, detail) => updates.push({ status, detail }),
    });
    // 2 warm-up probes (5 s + 5 s = budget) + 1 at budget + 3 background probes.
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(out.status).toBe("error");
    expect(out.detail).toMatch(/gave up/i);
    expect(updates.at(-1).status).toBe("error");
    expect(updates.slice(0, -1).every((u) => u.status === "warming")).toBe(true);
  });

  it("stops polling early once the status leaves warming", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1
        ? jsonResponse({ status: "warming", detail: "waking" })
        : jsonResponse({ status: "ready", detail: "up now" });
    });
    const out = await pollSearchStatus({ fetchImpl, sleep: noSleep });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ status: "ready", detail: "up now" });
  });

  it("sleeps between attempts using the initial interval", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call < 2
        ? jsonResponse({ status: "warming", detail: "waking" })
        : jsonResponse({ status: "ready", detail: "up now" });
    });
    const sleep = vi.fn(async () => {});
    await pollSearchStatus({ fetchImpl, sleep, initialIntervalMs: 3000 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("stops calling the backend once cancelled", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return jsonResponse({ status: "warming", detail: "waking" });
    });
    let cancelled = false;
    const out = await pollSearchStatus({
      fetchImpl,
      sleep: noSleep,
      isCancelled: () => {
        if (call >= 2) cancelled = true;
        return cancelled;
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out).toBeNull();
  });
});
