import { describe, it, expect, vi } from "vitest";
import { fetchSearchStatus } from "../../../public/frontend/status-client.js";

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
