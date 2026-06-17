import { describe, it, expect } from "vitest";
import {
  mintContinuationToken,
  verifyContinuationToken,
} from "../../src/continuation.ts";

const SECRET = "test-turnstile-secret";

describe("continuation tokens", () => {
  it("verifies a freshly minted token", async () => {
    const token = await mintContinuationToken(SECRET, { ip: "1.2.3.4" });
    expect(await verifyContinuationToken(token, SECRET, { ip: "1.2.3.4" })).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await mintContinuationToken(SECRET, { ip: "1.2.3.4" });
    expect(await verifyContinuationToken(token, "other-secret", { ip: "1.2.3.4" })).toBe(false);
  });

  it("rejects a tampered payload", async () => {
    const token = await mintContinuationToken(SECRET, { ip: "1.2.3.4" });
    const [, sig] = token.split(".");
    const forged = `${btoa('{"exp":99999999999999,"ip":"1.2.3.4"}')}.${sig}`;
    expect(await verifyContinuationToken(forged, SECRET, { ip: "1.2.3.4" })).toBe(false);
  });

  it("rejects an expired token", async () => {
    const now = Date.now();
    const token = await mintContinuationToken(SECRET, { ip: "1.2.3.4", ttlMs: 1000, now });
    expect(await verifyContinuationToken(token, SECRET, { ip: "1.2.3.4", now: now + 999 })).toBe(true);
    expect(await verifyContinuationToken(token, SECRET, { ip: "1.2.3.4", now: now + 1000 })).toBe(false);
  });

  it("rejects a token presented from a different IP", async () => {
    const token = await mintContinuationToken(SECRET, { ip: "1.2.3.4" });
    expect(await verifyContinuationToken(token, SECRET, { ip: "9.9.9.9" })).toBe(false);
  });

  it("rejects malformed tokens", async () => {
    expect(await verifyContinuationToken("", SECRET)).toBe(false);
    expect(await verifyContinuationToken("nodot", SECRET)).toBe(false);
    expect(await verifyContinuationToken("a.b.c", SECRET)).toBe(false);
  });
});
