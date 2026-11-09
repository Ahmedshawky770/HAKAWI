import { describe, expect, it } from "vitest";

import { localeFromAcceptLanguage } from "@/lib/site-url";

describe("localeFromAcceptLanguage", () => {
  it("returns the default when there is no header", () => {
    expect(localeFromAcceptLanguage(null)).toBe("ar");
    expect(localeFromAcceptLanguage(undefined)).toBe("ar");
    expect(localeFromAcceptLanguage("")).toBe("ar");
  });

  it("picks the first supported language in quality order", () => {
    expect(localeFromAcceptLanguage("en-GB,en;q=0.9,ar;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("ar;q=0.9,en-GB;q=0.8")).toBe("ar");
  });

  it("matches a primary subtag with a region", () => {
    expect(localeFromAcceptLanguage("en-US")).toBe("en");
    expect(localeFromAcceptLanguage("en-GB")).toBe("en");
  });

  it("skips a quality of zero", () => {
    expect(localeFromAcceptLanguage("en;q=0,ar;q=0.9")).toBe("ar");
  });

  it("skips the wildcard", () => {
    expect(localeFromAcceptLanguage("*;q=1,ar;q=0.9")).toBe("ar");
  });

  it("ignores non-numeric quality", () => {
    expect(localeFromAcceptLanguage("en;q=high,ar;q=0.9")).toBe("ar");
  });

  it("keeps header order for equal quality", () => {
    expect(localeFromAcceptLanguage("ar;q=0.5,en;q=0.5")).toBe("ar");
  });
});
