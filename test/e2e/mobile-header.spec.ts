import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 360, height: 720 } });

// On mobile the header tucks itself away while the reader scrolls down through a
// reply, and reappears the moment they scroll back up.
test("mobile: header hides on scroll-down and returns on scroll-up", async ({
  page,
}) => {
  // A reply long enough to make the log overflow and scroll.
  const longReply = Array.from(
    { length: 60 },
    (_, i) => `Line ${i + 1} of a long reading for scrolling.`,
  ).join(" ");

  await page.route("/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body:
        `data: ${JSON.stringify({ token: longReply })}\n\n` +
        `data: ${JSON.stringify({ done: true })}\n\n`,
    });
  });

  await page.goto("/");
  await page.locator("#input").fill("Read with me");
  await page.locator("#send").click();
  await expect(page.locator(".msg-assistant .msg-body").last()).toContainText(
    "Line 1 of a long reading",
  );

  const body = page.locator("body");

  // Start from the top, where the header is shown.
  await page.locator("#log").evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(body).not.toHaveClass(/header-hidden/);

  // Scroll the log down: the header should tuck away.
  await page.locator("#log").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(body).toHaveClass(/header-hidden/);

  // Scroll back up: the header should return.
  await page.locator("#log").evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(body).not.toHaveClass(/header-hidden/);
});
