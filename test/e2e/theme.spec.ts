import { test, expect } from "@playwright/test";

/**
 * Dark mode: default is resolved from the OS preference when one is expressed,
 * otherwise from the time of day. The reader can toggle it, and that choice is
 * remembered across reloads.
 */
test.describe("theme", () => {
  test("defaults to dark when the OS prefers dark", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("defaults to light when the OS prefers light", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });

  test("falls back to time of day when no OS preference is available", async ({
    page,
  }) => {
    // Simulate a browser that doesn't express a colour-scheme preference: every
    // prefers-color-scheme query reports no match, so the inline script has to
    // fall back to the clock.
    const stubNoPreference = `
      const real = window.matchMedia.bind(window);
      window.matchMedia = (q) =>
        /prefers-color-scheme/.test(q) ? { matches: false, media: q } : real(q);
    `;

    await page.clock.setFixedTime(new Date("2026-06-23T12:00:00"));
    await page.addInitScript(stubNoPreference);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.clock.setFixedTime(new Date("2026-06-23T23:00:00"));
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("the reader can toggle the theme and the choice persists", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // Even with a light OS preference, the saved choice wins after reload.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
