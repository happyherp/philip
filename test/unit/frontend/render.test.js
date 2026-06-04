import { describe, it, expect } from "vitest";
import { renderMarkdown, sanitizeHtml } from "../../../public/frontend/render.js";

describe("renderMarkdown", () => {
  it("renders scripture quotes as blockquotes", () => {
    const html = renderMarkdown("> If you remain in my word");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("If you remain in my word");
  });

  it("renders orientation headings", () => {
    const html = renderMarkdown("### orientation (8:31-32)");
    expect(html).toMatch(/<h3>.*orientation/);
  });

  it("renders emphasis", () => {
    expect(renderMarkdown("this is *important*")).toContain("<em>important</em>");
  });
});

describe("sanitizeHtml", () => {
  it("strips script tags", () => {
    const html = sanitizeHtml("<p>ok</p><script>alert(1)</script>");
    expect(html).toContain("<p>ok</p>");
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("strips event-handler attributes", () => {
    const html = sanitizeHtml('<a href="#" onclick="steal()">x</a>');
    expect(html).not.toContain("onclick");
  });

  it("neutralizes javascript: links", () => {
    const html = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(html).not.toContain("javascript:");
  });

  it("keeps safe links and adds rel/target", () => {
    const html = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("does not let markdown smuggle scripts", () => {
    const html = renderMarkdown("Hello <script>alert(1)</script> world");
    expect(html.toLowerCase()).not.toContain("<script");
  });
});
