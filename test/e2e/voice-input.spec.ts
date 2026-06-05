import { test, expect } from "@playwright/test";

// Runs in the browser before page scripts. Replaces SpeechRecognition with a
// controllable mock and exposes window._speechMock for tests to drive events.
function installSpeechMock() {
  let current: EventTarget | null = null;

  class MockRecognition extends EventTarget {
    continuous = false;
    interimResults = false;
    lang = "";
    start() {
      current = this;
      this.dispatchEvent(new Event("start"));
    }
    stop() {
      if (current) current.dispatchEvent(new Event("end"));
    }
  }

  (window as any).SpeechRecognition = MockRecognition;
  (window as any).webkitSpeechRecognition = MockRecognition;

  (window as any)._speechMock = {
    // Simulate a recognition result (and optionally the end event).
    fireResult(transcript: string, isFinal = true) {
      if (!current) return;
      const e = new Event("result") as any;
      e.results = [[{ transcript }]]; // Array.from()-compatible
      current.dispatchEvent(e);
      if (isFinal) current.dispatchEvent(new Event("end"));
    },
  };
}

// Runs in the browser before page scripts. Removes SpeechRecognition so the
// app treats voice input as unsupported.
function removeSpeechSupport() {
  (window as any).SpeechRecognition = undefined;
  (window as any).webkitSpeechRecognition = undefined;
}

test.describe("voice input", () => {
  test("mic button is visible in the composer", async ({ page }) => {
    await page.addInitScript(installSpeechMock);
    await page.goto("/");
    await expect(page.locator("#mic")).toBeVisible();
  });

  test("mic button is disabled when SpeechRecognition is unavailable", async ({
    page,
  }) => {
    await page.addInitScript(removeSpeechSupport);
    await page.goto("/");
    await expect(page.locator("#mic")).toBeDisabled();
  });

  test("mic button gets recording class when clicked", async ({ page }) => {
    await page.addInitScript(installSpeechMock);
    await page.goto("/");
    await page.locator("#mic").click();
    await expect(page.locator("#mic")).toHaveClass(/recording/);
  });

  test("transcript appears in the textarea", async ({ page }) => {
    await page.addInitScript(installSpeechMock);
    await page.goto("/");
    await page.locator("#mic").click();
    await page.evaluate(() =>
      (window as any)._speechMock.fireResult("In the beginning", true)
    );
    await expect(page.locator("#input")).toHaveValue("In the beginning");
  });

  test("recording class is removed after speech ends", async ({ page }) => {
    await page.addInitScript(installSpeechMock);
    await page.goto("/");
    const mic = page.locator("#mic");
    await mic.click();
    await expect(mic).toHaveClass(/recording/);
    await page.evaluate(() =>
      (window as any)._speechMock.fireResult("Amen", true)
    );
    await expect(mic).not.toHaveClass(/recording/);
  });

  test("appends to existing textarea content separated by a space", async ({
    page,
  }) => {
    await page.addInitScript(installSpeechMock);
    await page.goto("/");
    await page.locator("#input").fill("Hello");
    await page.locator("#mic").click();
    await page.evaluate(() =>
      (window as any)._speechMock.fireResult("world", true)
    );
    await expect(page.locator("#input")).toHaveValue("Hello world");
  });

  test("mic button is disabled while the assistant is streaming", async ({
    page,
  }) => {
    await page.addInitScript(installSpeechMock);
    // Hang the /api/chat response so the UI stays busy long enough to assert.
    let resolveBusy: () => void;
    const busyGate = new Promise<void>((r) => (resolveBusy = r));
    await page.route("/api/chat", async (route) => {
      await busyGate; // hold until we release
      await route.fulfill({ status: 200, body: "data: [DONE]\n\n" });
    });
    await page.goto("/");
    // Submit a message to enter the busy state.
    await page.locator("#input").fill("start");
    await page.locator("#send").click();
    await expect(page.locator("#mic")).toBeDisabled();
    // Release the held response so the page can finish cleanly.
    resolveBusy!();
  });
});
