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
