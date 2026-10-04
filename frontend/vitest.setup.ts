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

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.setAttribute("data-theme", "dark");
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});
