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
    const out = await pollSearchStatus({ fetchImpl, sleep: noSleep, maxTries: 8 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(out).toEqual({ status: "error", detail: "boom" });
  });

  it("keeps polling while warming, then flips to error once tries are exhausted", async () => {
    // A HuggingFace Space stuck in a crashed/RUNTIME_ERROR state (not merely
    // asleep) returns 503 forever — probeSearch reports that as "warming"
    // indefinitely (regression: https://github.com/happyherp/philip, luther-mcp
    // wakeup issue). The client must eventually give up rather than tell the
    // reader the service is "warming up..." forever with no further action.
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "warming", detail: "Service is waking up (HTTP 503)." }));
    const updates = [];
    const out = await pollSearchStatus({
      fetchImpl,
      sleep: noSleep,
      maxTries: 3,
      onUpdate: (status, detail) => updates.push({ status, detail }),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(out.status).toBe("error");
    expect(out.detail).toMatch(/gave up/i);
    expect(updates).toHaveLength(3);
    expect(updates[0].status).toBe("warming");
    expect(updates[1].status).toBe("warming");
    expect(updates[2].status).toBe("error");
    expect(updates[2].detail).toMatch(/gave up/i);
  });

  it("stops polling early once the status leaves warming", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call === 1
        ? jsonResponse({ status: "warming", detail: "waking" })
        : jsonResponse({ status: "ready", detail: "up now" });
    });
    const out = await pollSearchStatus({ fetchImpl, sleep: noSleep, maxTries: 8 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ status: "ready", detail: "up now" });
  });

  it("sleeps between attempts using the given interval", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      return call < 2
        ? jsonResponse({ status: "warming", detail: "waking" })
        : jsonResponse({ status: "ready", detail: "up now" });
    });
    const sleep = vi.fn(async () => {});
    await pollSearchStatus({ fetchImpl, sleep, maxTries: 8, intervalMs: 3000 });
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
      maxTries: 8,
      isCancelled: () => {
        if (call >= 2) cancelled = true;
        return cancelled;
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out).toBeNull();
  });
});
