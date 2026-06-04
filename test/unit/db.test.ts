import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  createTestD1,
} from "../helpers.ts";
import {
  generateConversationId,
  createConversation,
  appendMessage,
  getConversationMessages,
  getConversation,
} from "../../src/db.ts";

describe("db (D1 persistence layer)", () => {
  let db: D1Database;
  let dispose: () => Promise<void>;

  beforeAll(async () => {
    ({ db, dispose } = await createTestD1());
  });

  afterAll(async () => {
    await dispose();
  });

  beforeEach(async () => {
    // Fresh data per test while reusing the (cheap) in-memory D1 instance.
    await db.exec("DELETE FROM messages; DELETE FROM conversations;");
  });

  describe("generateConversationId", () => {
    it("returns a 9-char string using only the expected alphabet", () => {
      const id = generateConversationId();
      expect(typeof id).toBe("string");
      expect(id).toHaveLength(9);
      expect(id).toMatch(/^[0-9a-zA-Z]+$/);
    });

    it("produces different values across calls (statistically)", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(generateConversationId());
      }
      // Extremely unlikely to collide 50 times if working.
      expect(ids.size).toBeGreaterThan(1);
    });
  });

  describe("createConversation + getConversation", () => {
    it("creates an empty conversation and roundtrips via getConversation", async () => {
      const id = await createConversation(db);
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);

      const conv = await getConversation(db, id);
      expect(conv).not.toBeNull();
      expect(conv!.id).toBe(id);
      expect(conv!.messages).toEqual([]);
      expect(typeof conv!.createdAt).toBe("number");
      expect(typeof conv!.updatedAt).toBe("number");
      expect(conv!.createdAt).toBe(conv!.updatedAt);
      // Reasonable timestamp (not year 1970 or far future)
      const now = Date.now();
      expect(conv!.createdAt).toBeGreaterThan(now - 60_000);
      expect(conv!.createdAt).toBeLessThan(now + 60_000);
    });
  });

  describe("appendMessage + get* queries", () => {
    it("appends messages and returns them in order via getConversationMessages and getConversation", async () => {
      const id = await createConversation(db);

      await appendMessage(db, id, "user", "Let's start with John 3:16");
      await appendMessage(db, id, "assistant", "For God so loved the world...");

      const msgs = await getConversationMessages(db, id);
      expect(msgs).toHaveLength(2);
      expect(msgs[0]).toEqual({ role: "user", content: "Let's start with John 3:16" });
      expect(msgs[1]).toEqual({ role: "assistant", content: "For God so loved the world..." });

      const conv = await getConversation(db, id);
      expect(conv).not.toBeNull();
      expect(conv!.messages).toEqual(msgs);
      expect(conv!.updatedAt).toBeGreaterThanOrEqual(conv!.createdAt);
    });

    it("bumps updated_at on each append (at least non-decreasing)", async () => {
      const id = await createConversation(db);
      const before = (await getConversation(db, id))!.updatedAt;

      await appendMessage(db, id, "user", "first");

      const after1 = (await getConversation(db, id))!.updatedAt;
      expect(after1).toBeGreaterThanOrEqual(before);

      await appendMessage(db, id, "assistant", "second");

      const after2 = (await getConversation(db, id))!.updatedAt;
      expect(after2).toBeGreaterThanOrEqual(after1);
    });

    it("preserves insert order for rapid appends (exercises created_at + id ordering)", async () => {
      const id = await createConversation(db);

      // Fire several appends quickly; some may share the same ms timestamp.
      const contents = ["m1", "m2", "m3", "m4"];
      for (const c of contents) {
        await appendMessage(db, id, "user", c);
      }

      const msgs = await getConversationMessages(db, id);
      expect(msgs.map((m) => m.content)).toEqual(contents);
    });
  });

  describe("unknown / missing conversation IDs", () => {
    it("getConversation returns null for unknown id", async () => {
      const conv = await getConversation(db, "definitely-not-a-real-id-123");
      expect(conv).toBeNull();
    });

    it("getConversationMessages returns [] for unknown id", async () => {
      const msgs = await getConversationMessages(db, "definitely-not-a-real-id-456");
      expect(msgs).toEqual([]);
    });
  });

  describe("error paths (schema constraints)", () => {
    it("rejects appendMessage when conversation does not exist (FK)", async () => {
      await expect(
        appendMessage(db, "non-existent-conv-id", "user", "hello"),
      ).rejects.toThrow();
    });

    it("rejects appendMessage with invalid role (CHECK constraint)", async () => {
      const id = await createConversation(db);
      await expect(
        // @ts-expect-error - testing runtime CHECK
        appendMessage(db, id, "invalid-role", "text"),
      ).rejects.toThrow();
    });
  });
});
