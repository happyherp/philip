import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import { createTestD1 } from "../helpers.ts";
import {
  generateShareId,
  createShare,
  getShare,
  DEFAULT_SHARE_TTL_MS,
} from "../../src/db.ts";

describe("db (shared-conversation persistence layer)", () => {
  let db: D1Database;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({ db, dispose } = await createTestD1());
  });

  afterAll(async () => {
    await dispose();
  });

  beforeEach(async () => {
    await db.exec("DELETE FROM shared_conversations;");
  });

  describe("generateShareId", () => {
    it("returns a 9-char string using only the expected alphabet", () => {
      const id = generateShareId();
      expect(id).toHaveLength(9);
      expect(id).toMatch(/^[0-9a-zA-Z]+$/);
    });

    it("produces different values across calls (statistically)", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) ids.add(generateShareId());
      expect(ids.size).toBeGreaterThan(1);
    });
  });

  describe("createShare + getShare", () => {
    it("stores a snapshot and roundtrips it", async () => {
      const messages = [
        { role: "user", content: "Let's start with John 3:16" },
        { role: "assistant", content: "For God so loved the world..." },
      ];
      const { id, expiresAt } = await createShare(db, messages, "en");
      expect(typeof id).toBe("string");

      const share = await getShare(db, id);
      expect(share).not.toBeNull();
      expect(share!.id).toBe(id);
      expect(share!.lang).toBe("en");
      expect(share!.messages).toEqual(messages);
      expect(share!.expiresAt).toBe(expiresAt);
      expect(share!.expiresAt).toBeGreaterThan(share!.createdAt);
    });

    it("defaults to a 30-day TTL", async () => {
      const { id } = await createShare(db, [{ role: "user", content: "hi" }], "en");
      const share = await getShare(db, id);
      const ttl = share!.expiresAt - share!.createdAt;
      expect(ttl).toBe(DEFAULT_SHARE_TTL_MS);
    });

    it("drops malformed messages on the way in", async () => {
      const { id } = await createShare(
        db,
        [
          { role: "user", content: "ok" },
          { role: "system", content: "nope" },
          { role: "assistant" },
          "garbage",
        ] as unknown[],
        "en",
      );
      const share = await getShare(db, id);
      expect(share!.messages).toEqual([{ role: "user", content: "ok" }]);
    });

    it("returns null for an unknown id", async () => {
      expect(await getShare(db, "definitely-not-real")).toBeNull();
    });

    it("returns null once expired", async () => {
      const { id, expiresAt } = await createShare(
        db,
        [{ role: "user", content: "hi" }],
        "en",
        1000, // 1s TTL
      );
      // Just before expiry: still readable.
      expect(await getShare(db, id, expiresAt - 1)).not.toBeNull();
      // At/after expiry: gone.
      expect(await getShare(db, id, expiresAt)).toBeNull();
      expect(await getShare(db, id, expiresAt + 60_000)).toBeNull();
    });
  });
});
