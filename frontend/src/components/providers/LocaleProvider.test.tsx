/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider, useLocale, useStrings } from "@/components/providers/LocaleProvider";
import { stringsFor, type AppStrings } from "@/lib/i18n";
import { LOCALE_STORAGE_KEY } from "@/lib/preferences";
import { render } from "@testing-library/react";

function Probe() {
  const { locale, direction, strings, intl, setLocale, toggleLocale } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="direction">{direction}</span>
      <span data-testid="stories-label">{strings.shell.navStories}</span>
      <span data-testid="intl">{intl}</span>
      <button type="button" onClick={() => setLocale("en")}>
        to english
      </button>
      <button type="button" onClick={toggleLocale}>
        toggle
      </button>
    </div>
  );
}

describe("LocaleProvider", () => {
  it("reads the locale from the document, the same way the theme does", () => {
    document.documentElement.setAttribute("lang", "en");

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
  });

  it("defaults to Arabic, right-to-left", () => {
    document.documentElement.setAttribute("lang", "ar");

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("locale")).toHaveTextContent("ar");
    expect(screen.getByTestId("direction")).toHaveTextContent("rtl");
  });

  it("mirrors the whole document when the language changes", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "to english" }));

    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
    expect(screen.getByTestId("direction")).toHaveTextContent("ltr");
  });

  it("mirrors back to Arabic on the way home", async () => {
    const user = userEvent.setup();
    document.documentElement.setAttribute("lang", "en");
    document.documentElement.setAttribute("dir", "ltr");

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "toggle" }));

    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
    expect(document.documentElement.getAttribute("lang")).toBe("ar");
  });

  it("remembers the choice for the next visit", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "to english" }));

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
  });

  it("serves shell copy in the active locale", async () => {
    const user = userEvent.setup();
    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    expect(screen.getByTestId("stories-label")).toHaveTextContent("القصص");

    await user.click(screen.getByRole("button", { name: "to english" }));

    expect(screen.getByTestId("stories-label")).toHaveTextContent("Stories");
    expect(screen.getByTestId("intl")).toHaveTextContent("en-GB");
  });

  it("refuses to be used outside the provider, with a message that names it", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    function Orphan() {
      useLocale();
      return null;
    }

    expect(() => render(<Orphan />)).toThrow(/useLocale must be used inside <LocaleProvider>/);

    consoleError.mockRestore();
  });

  it("keeps its own concern: the locale store, not the document title", async () => {
    const user = userEvent.setup();
    // The document is not this provider's business: the `<title>` and its
    // description meta are mirrored by `TitleMirror`, a sibling the root layout
    // renders, because mirroring them means listening to the route — and a
    // provider that every mocked-router suite mounts must not grow that hook.
    // Capturing the title around the flip is what proves no effect HERE writes
    // to the document; the locale assertions alone cannot fail for that reason.
    const titleBefore = document.title;

    render(
      <LocaleProvider>
        <Probe />
      </LocaleProvider>,
    );

    await user.click(screen.getByRole("button", { name: "to english" }));

    expect(screen.getByTestId("locale")).toHaveTextContent("en");
    expect(document.title).toBe(titleBefore);
  });


  it("serves the very same dictionary through the strings-only hook", () => {
    const seen: AppStrings[] = [];

    function AliasProbe() {
      seen.push(useStrings());
      return null;
    }

    render(
      <LocaleProvider>
        <AliasProbe />
      </LocaleProvider>,
    );

    expect(seen[0]).toBe(stringsFor("ar"));
  });
});
