import "@testing-library/jest-dom";

import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * jsdom implements neither `matchMedia` nor `IntersectionObserver`, and the
 * product depends on both: the theme resolves the reader's system preference
 * before first paint, and the infinite feed watches a sentinel to know when to
 * load the next page.
 *
 * These are deliberately minimal fakes rather than a simulation. A test that
 * needs to assert behaviour *from* the media query sets its own implementation
 * per test; this default only has to keep the product's code from throwing.
 */
function installMatchMedia(): void {
  if (typeof window.matchMedia === "function") return;

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
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

function installIntersectionObserver(): void {
  if (typeof window.IntersectionObserver === "function") return;

  class NoopIntersectionObserver implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: readonly number[] = [];
    readonly scrollMargin: string = "";

    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  Object.defineProperty(window, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: NoopIntersectionObserver,
  });
  Object.defineProperty(globalThis, "IntersectionObserver", {
    writable: true,
    configurable: true,
    value: NoopIntersectionObserver,
  });
}

installMatchMedia();
installIntersectionObserver();

/**
 * The theme and the locale live on `<html>`, so a test that flips one leaks it
 * into every test that follows in the same file — a header test that switches to
 * English would silently change the labels the next test asserts on. Reset them
 * here, once, rather than in each file.
 */
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.setAttribute("data-theme", "dark");
  document.documentElement.setAttribute("lang", "ar");
  document.documentElement.setAttribute("dir", "rtl");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});
