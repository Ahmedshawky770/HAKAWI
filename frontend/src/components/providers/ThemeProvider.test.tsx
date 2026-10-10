/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeProvider, useTheme } from "@/components/providers/ThemeProvider";
import { THEME_STORAGE_KEY } from "@/lib/preferences";
import { render } from "@testing-library/react";

function Probe() {
  const { theme, setTheme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme("light")}>
        to light
      </button>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
    </div>
  );
}

describe("ThemeProvider", () => {
  it("reads the theme from the document rather than from a copy in state", () => {
    document.documentElement.setAttribute("data-theme", "light");

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("defaults to dark when the document says nothing", () => {
    document.documentElement.removeAttribute("data-theme");

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("writes the attribute when the reader picks a theme", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "to light" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("remembers the choice, so the bootstrap finds it on the next visit", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "to light" }));

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("toggles between the two themes", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    await user.click(screen.getByRole("button", { name: "toggle" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  });

  it("lets two mounted consumers agree, because they read the same attribute", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <Probe />
        <Probe />
      </ThemeProvider>,
    );

    await user.click(screen.getAllByRole("button", { name: "to light" })[0]);

    for (const readout of screen.getAllByTestId("theme")) {
      expect(readout).toHaveTextContent("light");
    }
  });

  it("follows the system preference, then stops following it once a theme is chosen", () => {
    const listeners: ((event: MediaQueryListEvent) => void)[] = [];
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => listeners.push(listener),
        removeEventListener: vi.fn(),
      }),
    });

    try {
      render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      );

      // No stored preference: the system decides, and it decides live.
      act(() => {
        listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
      });
      expect(screen.getByTestId("theme")).toHaveTextContent("light");

      // An explicit choice outranks the system from then on: the reader picks
      // dark, and the system reporting "light" no longer moves anything.
      act(() => {
        window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
      });
      act(() => {
        screen.getByRole("button", { name: "toggle" }).click();
      });
      expect(screen.getByTestId("theme")).toHaveTextContent("dark");

      act(() => {
        listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
      });
      expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    } finally {
      Object.defineProperty(window, "matchMedia", { writable: true, configurable: true, value: original });
    }
  });

  it("refuses to be used outside the provider, with a message that names it", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    function Orphan() {
      useTheme();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/useTheme must be used inside <ThemeProvider>/);

    consoleError.mockRestore();
  });
});
