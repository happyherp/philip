import { test, expect } from "@playwright/test";

/**
 * The About overlay: opened from the "about" chip, it explains what Philip is
 * for, lists its features, the languages it speaks, and the bundled Bible
 * translations, and links out to the project on GitHub. It closes on the close
 * button, a backdrop click, or Escape.
 */
test.describe("about", () => {
  test("opens from the chip and shows the key sections", async ({ page }) => {
    // The underlying model is served by a Pages Function that `serve` doesn't
    // run, so stub it to confirm the About panel names the configured model.
    await page.route("**/api/model", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ model: "anthropic/claude-sonnet-4" }),
      }),
    );

    await page.goto("/");

    const overlay = page.locator("#about");
    await expect(overlay).toBeHidden();

    await page.locator("#about-link").click();
    await expect(overlay).toBeVisible();

    // What it is (not a pastor replacement) and the section headings.
    await expect(overlay).toContainText("does not");
    await expect(overlay.locator(".about-section-title")).toContainText([
      "What it does",
      "Languages Philip speaks",
      "Bible translations",
      "Underlying model",
      "Open source",
    ]);

    // Faithful-to-the-text ("bibeltreu"): quotes come from the real text.
    await expect(overlay.locator(".about-features")).toContainText(
      "Faithful to the text",
    );

    // The bundled translations are listed from the generated data.
    await expect(overlay).toContainText("World English Bible");
    await expect(overlay).toContainText("Reina-Valera 1909");
    await expect(overlay).toContainText("Luther Bibel 1545");

    // The underlying model, named from /api/model.
    await expect(overlay.locator(".about-model-id")).toHaveText(
      "anthropic/claude-sonnet-4",
    );

    // Links out to the repository.
    await expect(overlay.locator(".about-github")).toHaveAttribute(
      "href",
      "https://github.com/happyherp/philip",
    );
  });

  test("closes via the close button, backdrop, and Escape", async ({ page }) => {
    await page.goto("/");
    const overlay = page.locator("#about");

    // Close button.
    await page.locator("#about-link").click();
    await expect(overlay).toBeVisible();
    await overlay.locator(".about-close").click();
    await expect(overlay).toBeHidden();

    // Escape.
    await page.locator("#about-link").click();
    await expect(overlay).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(overlay).toBeHidden();

    // Backdrop click (top-left corner is outside the centered panel).
    await page.locator("#about-link").click();
    await expect(overlay).toBeVisible();
    await overlay.click({ position: { x: 5, y: 5 } });
    await expect(overlay).toBeHidden();
  });
});
