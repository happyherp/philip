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
});
