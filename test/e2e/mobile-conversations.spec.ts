import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 360, height: 720 } });

test("mobile: saved dropdown renders within the viewport", async ({ page }) => {
  await page.route("/api/chat", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body:
        `data: ${JSON.stringify({ token: "A reply." })}\n\n` +
        `data: ${JSON.stringify({ done: true })}\n\n`,
    });
  });
  await page.route("/api/summary", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Grace in Ephesians",
        summary: "Discussed grace in Ephesians 2:8, the gift of salvation by faith.",
      }),
    });
  });

  await page.goto("/");
  await page.locator("#input").fill("Tell me about grace");
  await page.locator("#send").click();
  await expect(page.locator(".msg-assistant .msg-body").last()).toContainText("A reply.");
  await page.locator("#new-chat").click();
  await page.locator("#toggle-conversations").click();

  const panel = page.locator("#conversations");
  await expect(panel).toBeVisible();

  // The dropdown must fit inside the viewport (no horizontal overflow).
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
});
