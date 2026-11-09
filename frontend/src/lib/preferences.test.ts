import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  directionFor,
  isLocale,
  isTheme,
  localeFromSystem,
  themeFromSystem,
} from "@/lib/preferences";

const originalMatchMedia = window.matchMedia;

function installMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  });
}

beforeEach(() => {
  installMatchMedia(false);
});

afterEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

describe("isTheme", () => {
  it("accepts 'dark'", () => {
    expect(isTheme("dark")).toBe(true);
  });

  it("accepts 'light'", () => {
    expect(isTheme("light")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme("")).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme(42)).toBe(false);
  });
});

describe("isLocale", () => {
  it("accepts 'ar' and 'en'", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("en")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isLocale("fr")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("directionFor", () => {
  it("returns 'rtl' for Arabic", () => {
    expect(directionFor("ar")).toBe("rtl");
  });

  it("returns 'ltr' for English", () => {
    expect(directionFor("en")).toBe("ltr");
  });
});

describe("themeFromSystem", () => {
  it("returns 'dark' when the system prefers dark", () => {
    installMatchMedia(false);
    expect(themeFromSystem()).toBe("dark");
  });

  it("returns 'light' when the system prefers light", () => {
    installMatchMedia(true);
    expect(themeFromSystem()).toBe("light");
  });
});

describe("localeFromSystem", () => {
  it("always returns Arabic as the default", () => {
    expect(localeFromSystem()).toBe("ar");
  });
});
