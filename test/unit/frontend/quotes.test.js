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
