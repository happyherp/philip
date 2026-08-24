import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildQuoteElement,
  clearQuoteCache,
  displayReference,
  findMarkers,
  parseReference,
  portalUrl,
  stripIncompleteTrailingMarker,
  translationForLang,
} from "../../../public/frontend/quotes.js";
import { TRANSLATIONS } from "../../../public/frontend/bible-data.gen.js";
import { renderMessageInto } from "../../../public/frontend/render.js";

const JOHN_WEB = {
  book: "John",
  translation: "WEB",
  chapters: {
    8: {
      31: "If you remain in my word, then you are truly my disciples.",
      32: "You will know the truth, and the truth will make you free.",
    },
  },
};

// WEB renders apostrophes/quotes typographically (U+2019 in "God’s").
const MATTHEW_WEB = {
  book: "Matthew",
  translation: "WEB",
  chapters: {
    6: {
      33: "But seek first God’s Kingdom, and his righteousness; and all these things will be given to you as well.",
    },
  },
};

// The verse uses the contraction "let’s" (curly apostrophe); the model tends to
// expand it to "Let us" — a meaning-preserving slip we tolerate.
const CORINTHIANS_WEB = {
  book: "1 Corinthians",
  translation: "WEB",
  chapters: {
    15: {
      32: "If I fought with animals at Ephesus for human purposes, what does it profit me? If the dead are not raised, then “let’s eat and drink, for tomorrow we die.”",
    },
  },
};

const GENESIS_WLC = {
  book: "Genesis",
  translation: "WLC",
  chapters: { 1: { 1: "בְּרֵאשִׁ֖ית בָּרָ֣א אֱלֹהִ֑ים" } },
};

/** A fetch stub serving canned book JSON and counting calls per URL. */
function fetchStub(routes) {
  const calls = [];
  const impl = vi.fn(async (url) => {
    calls.push(url);
    const json = routes[url];
    if (!json) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(json), { status: 200 });
  });
  return { impl, calls };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  clearQuoteCache();
  document.body.innerHTML = "";
});
afterEach(() => clearQuoteCache());

describe("findMarkers", () => {
  it("finds block and inline markers with and without a translation", () => {
    const text =
      "Read this:\n\n{{quote John 8:31-32 @web}}\n\nNote *menō* {{q John 8:31}} here.";
    const markers = findMarkers(text);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ mode: "block", refText: "John 8:31-32", translationId: "web" });
    expect(markers[1]).toMatchObject({ mode: "inline", refText: "John 8:31", translationId: null });
  });

  it("handles references with spaces and accents", () => {
    const [m] = findMarkers("{{quote 1 Juan 1:9 @rv1909}}");
    expect(m.refText).toBe("1 Juan 1:9");
    expect(parseReference(m.refText).book.name).toBe("1 John");
  });
});

describe("stripIncompleteTrailingMarker", () => {
  it("hides a half-streamed marker", () => {
    expect(stripIncompleteTrailingMarker("Read: {{quote Joh")).toBe("Read: ");
    expect(stripIncompleteTrailingMarker("Read: {{")).toBe("Read: ");
    expect(stripIncompleteTrailingMarker("Read: {")).toBe("Read: ");
  });

  it("leaves complete markers and ordinary text alone", () => {
    expect(stripIncompleteTrailingMarker("a {{q John 8:31}} b")).toBe("a {{q John 8:31}} b");
    expect(stripIncompleteTrailingMarker("no markers here")).toBe("no markers here");
  });
});

describe("displayReference / translationForLang", () => {
  it("uses an en-dash for ranges", () => {
    expect(displayReference(parseReference("John 8:31-32"))).toBe("John 8:31–32");
    expect(displayReference(parseReference("John 8:31"))).toBe("John 8:31");
  });

  it("shows the book name in the requested language", () => {
    expect(displayReference(parseReference("John 8:31"), "es")).toBe("Juan 8:31");
    expect(displayReference(parseReference("John 8:31"), "de")).toBe("Johannes 8:31");
    expect(displayReference(parseReference("Genesis 1:1"), "de")).toBe("1. Mose 1:1");
  });

  it("falls back to English when the language has no localized name", () => {
    expect(displayReference(parseReference("John 8:31"), "grc")).toBe("John 8:31");
    expect(displayReference(parseReference("John 8:31"))).toBe("John 8:31");
  });

  it("maps languages to reader translations, never scholarly ones", () => {
    expect(translationForLang("de").id).toBe("luther1545");
    expect(translationForLang("grc").id).toBe("web"); // scholarly lang has no reader default
    expect(translationForLang("xx").id).toBe("web");
  });
});

describe("buildQuoteElement", () => {
  it("renders a placeholder, then fills the block quote when the fetch lands", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [marker] = findMarkers("{{quote John 8:31-32 @web}}");
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);

    expect(el.classList.contains("quote-pending")).toBe(true);
    expect(el.textContent).toBe("John 8:31–32");

    await flush();
    expect(el.classList.contains("quote-pending")).toBe(false);
    expect(el.querySelector(".quote-ref").textContent).toBe("John 8:31–32");
    expect(el.querySelector(".quote-text").textContent).toContain("the truth will make you free");
    expect(el.querySelector(".quote-attrib").textContent).toBe("— WEB");
  });

  it("shows the book name in the language of the quoted translation", async () => {
    const genesisLuther = {
      book: "Genesis",
      translation: "Luther 1545",
      chapters: { 1: { 1: "Am Anfang schuf Gott Himmel und Erde." } },
    };
    const { impl } = fetchStub({ "/bible/luther1545/genesis.json": genesisLuther });
    const [marker] = findMarkers("{{quote Genesis 1:1 @luther1545}}");
    const el = buildQuoteElement(marker, "luther1545", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector(".quote-ref").textContent).toBe("1. Mose 1:1");
  });

  it("keeps the English book name for scholarly translations", async () => {
    const { impl } = fetchStub({ "/bible/wlc/genesis.json": GENESIS_WLC });
    const [marker] = findMarkers("{{quote Genesis 1:1 @wlc}}");
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector(".quote-ref").textContent).toBe("Genesis 1:1");
  });

  it("prefixes each verse with its number on block quotes", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [marker] = findMarkers("{{quote John 8:31-32 @web}}");
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();

    const nums = [...el.querySelectorAll(".quote-versenum")].map((n) => n.textContent);
    expect(nums).toEqual(["31", "32"]);
    // The counter sits right before its verse, not woven into the scripture text.
    expect(el.querySelector(".quote-text").textContent).toBe(
      "31If you remain in my word, then you are truly my disciples. " +
        "32You will know the truth, and the truth will make you free.",
    );
  });

  it("does not show verse counters on inline quotes", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [marker] = findMarkers("{{q John 8:32 @web}}");
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector(".quote-versenum")).toBeNull();
  });

  it("fills synchronously from the cache and fetches each book once", async () => {
    const { impl, calls } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [marker] = findMarkers("{{q John 8:32 @web}}");

    const first = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(first);
    await flush();

    const second = buildQuoteElement(marker, "web", impl);
    expect(second.classList.contains("quote-pending")).toBe(false);
    expect(second.querySelector(".quote-text").textContent).toContain("You will know the truth");
    expect(second.querySelector(".quote-ref").textContent).toBe("John 8:32, WEB");
    expect(second.textContent).toContain("(John 8:32, WEB)");
    expect(calls).toHaveLength(1);
  });

  it("sets lang and dir for original-language texts", async () => {
    const { impl } = fetchStub({ "/bible/wlc/genesis.json": GENESIS_WLC });
    const [marker] = findMarkers("{{quote Genesis 1:1 @wlc}}");
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();
    const text = el.querySelector(".quote-text");
    expect(text.getAttribute("lang")).toBe("hbo");
    expect(text.getAttribute("dir")).toBe("rtl");
    expect(text.getAttribute("data-translation")).toBe("wlc");
  });

  it("falls back to a plain-reference span for unparseable references", () => {
    const el = buildQuoteElement(
      { mode: "inline", refText: "Nonexistent 99:1", translationId: "web" },
      "web",
    );
    expect(el.className).toBe("quote-error");
    expect(el.textContent).toBe("Nonexistent 99:1");
  });

  it("degrades gracefully for coverage gaps and missing verses", async () => {
    // Genesis is not in the Greek NT.
    const [otInNt] = findMarkers("{{q Genesis 1:1 @tisch}}");
    expect(buildQuoteElement(otInNt, "web").className).toBe("quote-error");

    // Verse out of range in an otherwise valid book.
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [missing] = findMarkers("{{q John 99:1 @web}}");
    const el = buildQuoteElement(missing, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(document.querySelector(".quote-error").textContent).toBe("John 99:1 (WEB)");
  });

  it("keeps XSS attempts in verse text inert", async () => {
    const evil = {
      book: "John",
      translation: "WEB",
      chapters: { 8: { 31: '<img src=x onerror="window.pwned=1">' } },
    };
    const { impl } = fetchStub({ "/bible/web/john.json": evil });
    const [marker] = findMarkers("{{q John 8:31 @web}}");
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img");
  });
});

describe("copy to clipboard", () => {
  let writeText;

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function buildFilledBlock() {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [marker] = findMarkers("{{quote John 8:31-32 @web}}");
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();
    return el;
  }

  it("puts a copy button with the standard copy icon on block quotes", async () => {
    const el = await buildFilledBlock();
    const btn = el.querySelector("button.quote-copy");
    expect(btn).not.toBeNull();
    // Accessible name + a tooltip, and an inline SVG icon (no image request).
    expect(btn.getAttribute("aria-label")).toBeTruthy();
    expect(btn.getAttribute("title")).toBeTruthy();
    expect(btn.querySelector("svg")).not.toBeNull();
  });

  it("does not put a copy button on inline quotes", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [marker] = findMarkers("{{q John 8:32 @web}}");
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.querySelector(".quote-copy")).toBeNull();
  });

  it("copies the clean verse text and reference on click, without verse numbers", async () => {
    const el = await buildFilledBlock();
    el.querySelector("button.quote-copy").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await flush();

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0];
    expect(copied).toContain("If you remain in my word, then you are truly my disciples.");
    expect(copied).toContain("You will know the truth, and the truth will make you free.");
    expect(copied).toContain("John 8:31–32");
    expect(copied).toContain("WEB");
    // The superscript verse counters shown on screen are not part of the copy.
    expect(copied).not.toContain("31If you");
  });

  it("shows a “copied to clipboard” message that clears after 3 seconds", async () => {
    const el = await buildFilledBlock();
    vi.useFakeTimers();

    el.querySelector("button.quote-copy").dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    const msg = el.querySelector(".quote-copied-msg");
    expect(msg).not.toBeNull();
    expect(msg.hidden).toBe(false);
    expect(msg.textContent).toBeTruthy();

    vi.advanceTimersByTime(2999);
    expect(msg.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(msg.hidden).toBe(true);
  });

  it("survives a blocked clipboard without throwing", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const el = await buildFilledBlock();
    expect(() =>
      el.querySelector("button.quote-copy").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      ),
    ).not.toThrow();
    await flush();
  });
});

describe("excerpt quotes", () => {
  it("parses an excerpt in straight or curly quotes, on either keyword", () => {
    const [a] = findMarkers('{{quote John 8:32 @web "the truth will make you free"}}');
    expect(a.excerpt).toBe("the truth will make you free");
    const [b] = findMarkers("{{q John 8:32 @web “the truth”}}");
    expect(b.excerpt).toBe("the truth");
    const [c] = findMarkers("{{q John 8:32 @web}}");
    expect(c.excerpt).toBeNull();
  });

  it("renders a verified excerpt as a highlighted phrase without reference text", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [marker] = findMarkers('{{q John 8:32 @web "the truth will make you free"}}');
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();

    expect(el.className).toContain("quote-excerpt");
    expect(el.textContent).toBe("the truth will make you free");
    expect(el.textContent).not.toContain("WEB");
    expect(el.getAttribute("title")).toBe("John 8:32 (WEB)");
    expect(el.getAttribute("role")).toBe("button");
    expect(el.querySelector(".quote-text").getAttribute("data-translation")).toBe("web");
  });

  it("tolerates case and whitespace differences, showing the verse's own text", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [ok] = findMarkers('{{q John 8:32 @web "you will know  the truth"}}');
    const el = buildQuoteElement(ok, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.className).toContain("quote-excerpt");
    // Display is the translation's wording (capital "You", single space).
    expect(el.querySelector(".quote-text").textContent).toBe("You will know the truth");
  });

  it("accepts a straight ASCII apostrophe and displays the verse's curly one", async () => {
    const { impl } = fetchStub({ "/bible/web/matthew.json": MATTHEW_WEB });
    // Model emits "God's" (U+0027); the verse has "God’s" (U+2019).
    const [ok] = findMarkers(
      `{{q Matthew 6:33 @web "seek first God's Kingdom, and his righteousness"}}`,
    );
    const el = buildQuoteElement(ok, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.className).toContain("quote-excerpt");
    expect(document.querySelector(".quote-bad")).toBeNull();
    expect(el.querySelector(".quote-text").textContent).toBe(
      "seek first God’s Kingdom, and his righteousness",
    );
  });

  it("tolerates a contraction the model expanded, showing the verse's contraction", async () => {
    const { impl } = fetchStub({ "/bible/web/1corinthians.json": CORINTHIANS_WEB });
    // Verse: "let’s eat and drink…"; model wrote the expansion "Let us eat…".
    const [ok] = findMarkers(
      '{{q 1 Corinthians 15:32 @web "Let us eat and drink, for tomorrow we die"}}',
    );
    const el = buildQuoteElement(ok, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.className).toContain("quote-excerpt");
    expect(document.querySelector(".quote-bad")).toBeNull();
    expect(el.querySelector(".quote-text").textContent).toBe(
      "let’s eat and drink, for tomorrow we die",
    );
  });

  it("tolerates a single-character typo and snaps to the whole word", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    // "fee" → the verse's "free": one edit, and the clipped word is restored.
    const [ok] = findMarkers('{{q John 8:32 @web "the truth will make you fee"}}');
    const el = buildQuoteElement(ok, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.className).toContain("quote-excerpt");
    expect(el.querySelector(".quote-text").textContent).toBe("the truth will make you free");
  });

  // Misquotes that must STILL be flagged — the tolerance is a safety net for
  // trivial slips, not a license to paraphrase.
  it.each([
    ["a swapped key word", "the truth will make you rich"],
    ["a paraphrase that keeps the gist", "the truth shall liberate your soul"],
    ["words from a different verse", "blessed are the peacemakers"],
  ])("shows BAD QUOTATION for %s", async (_label, excerpt) => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [bad] = findMarkers(`{{q John 8:32 @web "${excerpt}"}}`);
    const el = buildQuoteElement(bad, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(document.querySelector(".quote-bad")).not.toBeNull();
    expect(document.querySelector(".quote-excerpt")).toBeNull();
  });

  it("shows BAD QUOTATION when the words are not in the verse", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [bad] = findMarkers('{{q John 8:32 @web "the truth will set you free"}}');
    const el = buildQuoteElement(bad, "web", impl);
    document.body.appendChild(el);
    await flush();

    const err = document.querySelector(".quote-bad");
    expect(err).not.toBeNull();
    expect(err.textContent).toBe("BAD QUOTATION (John 8:32, WEB)");
    expect(err.getAttribute("title")).toContain("the truth will set you free");
    expect(document.body.textContent).not.toContain("{{");
  });

  it("opens a comparison popup on click showing the claim and the real text", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [bad] = findMarkers('{{q John 8:32 @web "the truth will set you free"}}');
    document.body.appendChild(buildQuoteElement(bad, "web", impl));
    await flush();

    const el = document.querySelector(".quote-bad");
    expect(el.getAttribute("role")).toBe("button");
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const popup = document.querySelector(".quote-popup");
    expect(popup).not.toBeNull();
    // The model's claimed wording is shown verbatim...
    expect(popup.querySelector(".quote-compare-claimed").textContent).toContain(
      "the truth will set you free",
    );
    // ...alongside the passage's actual text from the bundled translation.
    const block = popup.querySelector("blockquote.quote-block");
    expect(block.querySelector(".quote-ref").textContent).toBe("John 8:32");
    expect(block.querySelector(".quote-text").textContent).toContain("the truth will make you free");

    // Toggling closed, then Escape after reopening.
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".quote-popup")).toBeNull();
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".quote-popup")).toBeNull();
  });

  it("excerpts spanning a verse boundary are accepted", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [marker] = findMarkers(
      '{{q John 8:31-32 @web "truly my disciples. You will know the truth"}}',
    );
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();
    expect(el.className).toContain("quote-excerpt");
  });

  it("opens a popup with the whole passage in block format on click, and closes it again", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [marker] = findMarkers('{{q John 8:31-32 @web "the truth will make you free"}}');
    const el = buildQuoteElement(marker, "web", impl);
    document.body.appendChild(el);
    await flush();

    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const popup = document.querySelector(".quote-popup");
    expect(popup).not.toBeNull();
    const block = popup.querySelector("blockquote.quote-block");
    expect(block.querySelector(".quote-ref").textContent).toBe("John 8:31–32");
    expect(block.querySelector(".quote-text").textContent).toContain("If you remain in my word");
    expect(block.querySelector(".quote-attrib").textContent).toBe("— WEB");
    expect(block.querySelector("a.quote-ref").getAttribute("href")).toContain("biblegateway.com");

    // Click the excerpt again: popup toggles closed.
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".quote-popup")).toBeNull();

    // Reopen, then Escape closes.
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector(".quote-popup")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(document.querySelector(".quote-popup")).toBeNull();
  });

  it("shows BAD QUOTATION even when the book is already cached (synchronous path)", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    // Warm the cache with a good quote first (as happens after any prior quote
    // from the same book — e.g. the block quote earlier in the conversation).
    const [good] = findMarkers("{{q John 8:32 @web}}");
    document.body.appendChild(buildQuoteElement(good, "web", impl));
    await flush();

    // The bad excerpt now resolves synchronously, before insertion.
    const [bad] = findMarkers('{{q John 8:32 @web "the truth will set you free"}}');
    const el = buildQuoteElement(bad, "web", impl);
    document.body.appendChild(el);

    expect(el.className).toContain("quote-bad");
    expect(el.textContent).toBe("BAD QUOTATION (John 8:32, WEB)");
    expect(document.querySelector(".quote-excerpt:empty")).toBeNull();
  });

  it("shows an error for missing verses even when the book is already cached", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [good] = findMarkers("{{q John 8:32 @web}}");
    document.body.appendChild(buildQuoteElement(good, "web", impl));
    await flush();

    const [missing] = findMarkers("{{q John 99:1 @web}}");
    const el = buildQuoteElement(missing, "web", impl);
    document.body.appendChild(el);
    expect(el.className).toBe("quote-error");
    expect(el.textContent).toBe("John 99:1 (WEB)");
  });

  it("hides a half-streamed excerpt marker", () => {
    expect(stripIncompleteTrailingMarker('Read {{q John 8:32 @web "the tru')).toBe("Read ");
  });
});

describe("reference mentions ({{ref …}})", () => {
  it("parses ref markers and ignores any excerpt on them", () => {
    const [m] = findMarkers("Compare {{ref Genesis 1:1 @web}} here.");
    expect(m).toMatchObject({ mode: "ref", refText: "Genesis 1:1", translationId: "web" });
    const [withQuotes] = findMarkers('{{ref Genesis 1:1 @web "whatever"}}');
    expect(withQuotes.excerpt).toBeNull();
  });

  it("renders just the reference text without fetching anything", () => {
    const { impl, calls } = fetchStub({});
    const [m] = findMarkers("{{ref Genesis 1:1 @web}}");
    const el = buildQuoteElement(m, "web", impl);
    document.body.appendChild(el);

    expect(el.className).toBe("quote-refmark");
    expect(el.textContent).toBe("Genesis 1:1");
    expect(el.getAttribute("role")).toBe("button");
    expect(el.getAttribute("title")).toBe("WEB");
    expect(calls).toHaveLength(0); // lazy: nothing fetched until clicked
  });

  it("loads the book on first click and shows the passage popup", async () => {
    const genesis = {
      book: "Genesis",
      translation: "WEB",
      chapters: { 1: { 1: "In the beginning, God created the heavens and the earth." } },
    };
    const { impl, calls } = fetchStub({ "/bible/web/genesis.json": genesis });
    const [m] = findMarkers("{{ref Genesis 1:1 @web}}");
    const el = buildQuoteElement(m, "web", impl);
    document.body.appendChild(el);

    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();

    expect(calls).toHaveLength(1);
    const popup = document.querySelector(".quote-popup");
    expect(popup).not.toBeNull();
    expect(popup.querySelector(".quote-ref").textContent).toBe("Genesis 1:1");
    expect(popup.querySelector(".quote-text").textContent).toContain("In the beginning");
    expect(popup.querySelector(".quote-attrib").textContent).toBe("— WEB");

    // Second click toggles the popup closed without refetching.
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(document.querySelector(".quote-popup")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("degrades to an error span when the verse does not exist", async () => {
    const genesis = { book: "Genesis", translation: "WEB", chapters: { 1: { 1: "text" } } };
    const { impl } = fetchStub({ "/bible/web/genesis.json": genesis });
    const [m] = findMarkers("{{ref Genesis 99:1 @web}}");
    const el = buildQuoteElement(m, "web", impl);
    document.body.appendChild(el);

    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(document.querySelector(".quote-refmark")).toBeNull();
    expect(document.querySelector(".quote-error").textContent).toBe("Genesis 99:1 (WEB)");
    expect(document.querySelector(".quote-popup")).toBeNull();
  });

  it("still respects translation coverage", () => {
    const [m] = findMarkers("{{ref Genesis 1:1 @tisch}}");
    const el = buildQuoteElement(m, "web");
    expect(el.className).toBe("quote-error");
  });
});

describe("portal links", () => {
  const byId = new Map(TRANSLATIONS.map((t) => [t.id, t]));

  it("builds BibleGateway URLs from the human reference", () => {
    const url = portalUrl(byId.get("web"), parseReference("John 8:31-32"));
    expect(url).toBe(
      "https://www.biblegateway.com/passage/?search=John%208%3A31-32&version=WEB",
    );
    expect(portalUrl(byId.get("wlc"), parseReference("Genesis 1:1"))).toContain("version=WLC");
  });

  it("builds dotted STEP references with space-free book names", () => {
    expect(portalUrl(byId.get("tisch"), parseReference("John 8:31-32"))).toBe(
      "https://www.stepbible.org/?q=version=Tisch%7Creference=John.8.31-32",
    );
    expect(portalUrl(byId.get("tisch"), parseReference("1 John 1:9"))).toContain(
      "reference=1John.1.9",
    );
    expect(portalUrl(byId.get("lxx"), parseReference("Psalm 23"))).toContain(
      "reference=Psalms.23",
    );
  });

  it("links the reference in both quote modes, opening in a new tab", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const [block] = findMarkers("{{quote John 8:31-32 @web}}");
    const el = buildQuoteElement(block, "web", impl);
    document.body.appendChild(el);
    await flush();

    const a = el.querySelector("a.quote-ref");
    expect(a.getAttribute("href")).toContain("biblegateway.com");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");

    const [inline] = findMarkers("{{q John 8:31 @web}}");
    const inlineEl = buildQuoteElement(inline, "web", impl);
    expect(inlineEl.querySelector("a.quote-ref").getAttribute("href")).toContain(
      "search=John%208%3A31&version=WEB",
    );
  });
});

describe("renderMessageInto", () => {
  it("replaces a block marker with a quote element, never showing the raw marker", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderMessageInto(el, "{{quote John 8:31-32 @web}}\n\nNotice the chain.", {
      lang: "en",
      fetchImpl: impl,
    });

    expect(el.innerHTML).not.toContain("{{");
    // Block marker alone in a paragraph is hoisted out of the <p>.
    const bq = el.querySelector("blockquote.quote-block");
    expect(bq).not.toBeNull();
    expect(bq.parentElement).toBe(el);
    await flush();
    expect(bq.querySelector(".quote-text").textContent).toContain("If you remain in my word");
    expect(el.textContent).toContain("Notice the chain.");
  });

  it("renders inline markers inside the sentence", async () => {
    const { impl } = fetchStub({ "/bible/web/john.json": JOHN_WEB });
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderMessageInto(el, "The verb is *menō* {{q John 8:31 @web}} — to remain.", {
      lang: "en",
      fetchImpl: impl,
    });
    await flush();
    const p = el.querySelector("p");
    expect(p.querySelector(".quote-inline")).not.toBeNull();
    expect(p.textContent).toContain("to remain");
    expect(p.querySelector("em").textContent).toBe("menō");
  });

  it("hides a marker that is still streaming in", () => {
    const el = document.createElement("div");
    renderMessageInto(el, "Here it comes: {{quote John 8:3", { lang: "en" });
    expect(el.textContent).not.toContain("{{");
    expect(el.textContent).toContain("Here it comes:");
  });

  it("uses the language default when the marker has no @translation", async () => {
    const john1545 = {
      book: "John",
      translation: "Luther 1545",
      chapters: { 8: { 31: "So ihr bleiben werdet an meiner Rede" } },
    };
    const { impl, calls } = fetchStub({ "/bible/luther1545/john.json": john1545 });
    const el = document.createElement("div");
    document.body.appendChild(el);
    renderMessageInto(el, "{{q John 8:31}}", { lang: "de", fetchImpl: impl });
    await flush();
    expect(calls[0]).toBe("/bible/luther1545/john.json");
    expect(el.querySelector(".quote-text").textContent).toContain("bleiben");
  });
});
