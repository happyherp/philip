import { test, expect } from "@playwright/test";

/**
 * Helper: intercept /api/chat and stream back a canned SSE response built from
 * the supplied tokens array, then send the done sentinel.
 */
function mockChatStream(page: import("@playwright/test").Page, tokens: string[]) {
  return page.route("/api/chat", async (route) => {
    const lines = tokens.map((t) => `data: ${JSON.stringify({ token: t })}\n\n`);
    lines.push(`data: ${JSON.stringify({ done: true })}\n\n`);
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body: lines.join(""),
    });
  });
}

test.describe("text chat", () => {
  test("user sends a message and receives a streamed response", async ({
    page,
  }) => {
    await mockChatStream(page, ["Hello", ", ", "world!"]);
    await page.goto("/");

    // Type a message and submit.
    await page.locator("#input").fill("Hi there");
    await page.locator("#send").click();

    // The user bubble should appear with the sent text.
    const userBubble = page.locator(".msg-user .msg-body").last();
    await expect(userBubble).toHaveText("Hi there");

    // The assistant bubble should appear with the streamed tokens joined.
    const assistantBubble = page.locator(".msg-assistant .msg-body").last();
    await expect(assistantBubble).toContainText("Hello, world!");

    // The input should be cleared and re-enabled after the response.
    await expect(page.locator("#input")).toHaveValue("");
    await expect(page.locator("#input")).toBeEnabled();
    await expect(page.locator("#send")).toBeEnabled();
  });

  test("a streamed {{quote}} marker renders as a formatted bible quote", async ({
    page,
  }) => {
    await mockChatStream(page, [
      "{{quote John ",
      "8:31-32 @web}}",
      "\n\nNotice the chain: remain → know → free.",
    ]);
    await page.goto("/");

    await page.locator("#input").fill("Let's read John 8");
    await page.locator("#send").click();

    const bubble = page.locator(".msg-assistant .msg-body").last();
    // Verse text is fetched from the bundled /bible/ JSON, not the stream.
    const quote = bubble.locator("blockquote.quote-block");
    await expect(quote.locator(".quote-ref")).toHaveText("John 8:31–32");
    await expect(quote.locator(".quote-text")).toContainText(
      "the truth will make you free",
    );
    await expect(quote.locator(".quote-attrib")).toHaveText("— WEB");
    await expect(bubble).toContainText("Notice the chain");
    // The raw marker never shows.
    await expect(bubble).not.toContainText("{{");
  });

  test("an excerpt marker renders as a highlighted phrase with a verse popup", async ({
    page,
  }) => {
    await mockChatStream(page, [
      'Everything turns on {{q John 8:32 @web "the truth will make you free"}} — read it slowly.',
    ]);
    await page.goto("/");

    await page.locator("#input").fill("What does free mean here?");
    await page.locator("#send").click();

    const excerpt = page.locator(".quote-excerpt");
    await expect(excerpt).toHaveText("the truth will make you free");
    const bubble = page.locator(".msg-assistant .msg-body").last();
    await expect(bubble).not.toContainText("{{");
    await expect(bubble).not.toContainText("WEB"); // no visible attribution

    // Click: the whole verse pops up in block format.
    await excerpt.click();
    const popup = page.locator(".quote-popup");
    await expect(popup.locator(".quote-ref")).toHaveText("John 8:32");
    await expect(popup.locator(".quote-text")).toContainText("You will know the truth");
    await expect(popup.locator(".quote-attrib")).toHaveText("— WEB");

    // Escape closes it.
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
  });

  test("a reference mention shows the passage in a popup on click", async ({
    page,
  }) => {
    await mockChatStream(page, [
      "Compare {{ref Genesis 1:1 @web}}, where the same verb appears.",
    ]);
    await page.goto("/");

    await page.locator("#input").fill("tell me more");
    await page.locator("#send").click();

    const refmark = page.locator(".quote-refmark");
    await expect(refmark).toHaveText("Genesis 1:1");
    const bubble = page.locator(".msg-assistant .msg-body").last();
    await expect(bubble).not.toContainText("{{");

    await refmark.click();
    const popup = page.locator(".quote-popup");
    await expect(popup.locator(".quote-text")).toContainText("In the beginning");
    await expect(popup.locator(".quote-attrib")).toHaveText("— WEB");

    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
  });

  test("conversation is restored from the browser after a reload", async ({
    page,
  }) => {
    await mockChatStream(page, ["Peace ", "be with you."]);
    await page.goto("/");

    await page.locator("#input").fill("Hello Philip");
    await page.locator("#send").click();
    await expect(page.locator(".msg-assistant .msg-body").last()).toContainText(
      "Peace be with you.",
    );

    // Reload with no ?c= param — the conversation must come back from localStorage,
    // not the server (nothing is persisted server-side).
    await page.reload();
    await expect(page.locator(".msg-user .msg-body").last()).toHaveText(
      "Hello Philip",
    );
    await expect(page.locator(".msg-assistant .msg-body").last()).toContainText(
      "Peace be with you.",
    );
  });

  test("share is disabled until the first reply, then enabled", async ({ page }) => {
    await mockChatStream(page, ["A reply."]);
    await page.goto("/");

    // On a fresh start page, share is present but inert.
    const share = page.locator("#share-chat");
    await expect(share).toHaveClass(/disabled/);

    await page.locator("#input").fill("Hello");
    await page.locator("#send").click();
    await expect(page.locator(".msg-assistant .msg-body").last()).toContainText(
      "A reply.",
    );

    // After the first reply it becomes available.
    await expect(share).not.toHaveClass(/disabled/);
  });

  test("starting a new chat archives the current one with an LLM summary", async ({
    page,
  }) => {
    await mockChatStream(page, ["A reply about grace."]);
    await page.route("/api/summary", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Grace in Ephesians",
          summary: "Discussed grace in Ephesians 2:8.",
        }),
      });
    });
    await page.goto("/");

    // No saved-conversations list on a thin start page.
    await expect(page.locator("#conversations")).toBeHidden();

    await page.locator("#input").fill("Tell me about grace");
    await page.locator("#send").click();
    await expect(page.locator(".msg-assistant .msg-body").last()).toContainText(
      "A reply about grace.",
    );

    // Start a new conversation: the current one moves into the list.
    await page.locator("#new-chat").click();

    const item = page.locator(".conversation-item").first();
    await expect(page.locator("#conversations")).toBeVisible();
    await expect(item.locator(".conversation-name")).toHaveText("Grace in Ephesians");
    await expect(item.locator(".conversation-summary")).toHaveText(
      "Discussed grace in Ephesians 2:8.",
    );

    // The active log was reset to the welcome bubble only.
    await expect(page.locator(".msg-user")).toHaveCount(0);

    // Delete removes it from the list, hiding the (now empty) panel.
    page.once("dialog", (d) => d.accept());
    await item.locator(".conversation-action", { hasText: "delete" }).click();
    await expect(page.locator("#conversations")).toBeHidden();
  });

  test("share posts a snapshot and confirms with the user", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockChatStream(page, ["A reply."]);
    let sharedBody: any = null;
    await page.route("/api/share", async (route) => {
      sharedBody = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({
        status: 201,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "abc123", url: "https://example.test/?c=abc123" }),
      });
    });

    await page.goto("/");
    await page.locator("#input").fill("Share this");
    await page.locator("#send").click();
    await expect(page.locator(".msg-assistant .msg-body").last()).toContainText(
      "A reply.",
    );

    await page.locator("#share-chat").click();
    // The button flashes a confirmation, and the snapshot carried the history.
    await expect(page.locator("#share-chat")).toHaveText("link copied!");
    expect(sharedBody.messages.length).toBeGreaterThanOrEqual(2);
    expect(sharedBody.messages[0]).toEqual({ role: "user", content: "Share this" });
  });

  test("a wrong excerpt shows a BAD QUOTATION marker", async ({ page }) => {
    await mockChatStream(page, [
      'He says {{q John 8:32 @web "the truth will set you free"}} plainly.',
    ]);
    await page.goto("/");

    await page.locator("#input").fill("quote it");
    await page.locator("#send").click();

    const err = page.locator(".quote-bad");
    await expect(err).toHaveText("BAD QUOTATION (John 8:32, WEB)");
    await expect(page.locator(".quote-excerpt")).toHaveCount(0);
  });
});
