import { test, expect } from "@playwright/test";
import http from "node:http";
import type { AddressInfo } from "node:net";

// While Philip fetches a passage and then thinks about it, the pulsing activity
// indicator ("· · ·") must live INSIDE the assistant bubble — not float on the
// "Reading …" note line above it (which is where it used to leak out).
//
// A mocked route can only send a whole body at once, so we can't observe the
// mid-stream "read done, still thinking" state that way. Instead we stream from
// a real server we can hold open, and transparently redirect the app's
// same-origin POST /api/chat to it via route.continue({ url }).
test("thinking indicator stays inside the assistant bubble while reading", async ({
  page,
}) => {
  let openRes: http.ServerResponse | null = null;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    // Announce the read, then hold the stream open: the passage is fetched and
    // Philip is now "thinking", with no answer token yet.
    res.write(
      `data: ${JSON.stringify({
        status: {
          type: "reading",
          reference: "Matthew 5:1-12",
          translation: "Tischendorf",
        },
      })}\n\n`,
    );
    openRes = res;
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  await page.route("**/api/chat", (route) =>
    route.continue({ url: `http://localhost:${port}/api/chat` }),
  );

  await page.goto("/");
  await page.locator("#input").fill("Read Matthew 5 with me");
  await page.locator("#send").click();

  // The read note appears while the passage is fetched…
  const readNote = page.locator(".read-note");
  await expect(readNote).toContainText("Matthew 5:1-12");

  // …but the pulsing indicator belongs to the assistant bubble, not the note.
  await expect(page.locator(".msg-assistant .msg-body.thinking")).toBeVisible();
  await expect(readNote).not.toHaveClass(/\bthinking\b/);

  // Release the answer; the indicator clears once real text streams in.
  openRes!.write(
    `data: ${JSON.stringify({ token: "Blessed are the poor in spirit." })}\n\n`,
  );
  openRes!.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  openRes!.end();

  await expect(page.locator(".msg-assistant .msg-body").last()).toContainText(
    "Blessed are the poor",
  );
  await expect(page.locator(".msg-body.thinking")).toHaveCount(0);

  await new Promise<void>((resolve) => server.close(() => resolve()));
});
