import { describe, it, expect } from "vitest";
import { clientIp, parsePositiveInt, resolveLang } from "../../src/http.ts";

describe("parsePositiveInt", () => {
  it("parses positive integers and rejects the rest", () => {
    expect(parsePositiveInt("200")).toBe(200);
    expect(parsePositiveInt("0")).toBeUndefined();
    expect(parsePositiveInt("-5")).toBeUndefined();
    expect(parsePositiveInt("abc")).toBeUndefined();
    expect(parsePositiveInt(undefined)).toBeUndefined();
    expect(parsePositiveInt("")).toBeUndefined();
  });
});

describe("resolveLang", () => {
  it("prefers an explicit supported language", () => {
    expect(resolveLang("es")).toBe("es");
    expect(resolveLang("de-DE")).toBe("de");
  });

  it("falls back to Accept-Language, then to en", () => {
    expect(resolveLang(null, "fr-FR,es;q=0.9")).toBe("es");
    expect(resolveLang("klingon", "pt-BR")).toBe("en");
    expect(resolveLang(null, null)).toBe("en");
  });
});

describe("clientIp", () => {
  it("reads Cloudflare's edge header", () => {
    const req = new Request("https://example.com", {
      headers: { "CF-Connecting-IP": "1.2.3.4" },
    });
    expect(clientIp(req)).toBe("1.2.3.4");
    expect(clientIp(new Request("https://example.com"))).toBeNull();
  });
});
