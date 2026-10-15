/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleProvider, useLocale } from "@/components/providers/LocaleProvider";
import { TitleMirror } from "@/components/providers/TitleMirror";
import { stringsFor } from "@/lib/i18n";

/**
 * The router reports a pathname; a test moves it to navigate.
 *
 * `usePathname` reads `PathnameContext`, whose default value outside the App
 * Router is `null`. Twenty-five suites mock `next/navigation` without exporting
 * the hook at all, and 23 of those mount `LocaleProvider` — an effect inside the
 * provider that calls it would break every one of them, but the mirror renders
 * only in the root layout, which no page test renders. That is the whole reason
 * the mirror is a leaf component instead of an effect inside `LocaleProvider`.
 */
let pathname: string | null = "/stories";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

/** The locale flip is executed through the real provider, not simulated. */
function Probe() {
  const { setLocale } = useLocale();
  return (
    <button type="button" onClick={() => setLocale("en")}>
      to english
    </button>
  );
}

function mirror() {
  return render(
    <LocaleProvider>
      <TitleMirror />
      <Probe />
    </LocaleProvider>,
  );
}

/** Renders the tree again after a route moved, so the effect sees the new path. */
function navigate(result: ReturnType<typeof mirror>, next: string | null) {
  pathname = next;
  result.rerender(
    <LocaleProvider>
      <TitleMirror />
      <Probe />
    </LocaleProvider>,
  );
}

function touchMeta(content: string) {
  const meta = document.head.appendChild(document.createElement("meta"));
  meta.setAttribute("name", "description");
  meta.setAttribute("content", content);
  return meta;
}

describe("TitleMirror", () => {
  it("leaves the route's own title and description alone, on mount and on a toggle", async () => {
    const user = userEvent.setup();

    // The four `generateMetadata` routes (comments, reactions, followers,
    // following) ship a route-specific `<title>` in the server HTML.
    document.title = "التعليقات - القصة abc123";
    const meta = touchMeta("route description");

    const render1 = mirror();

    // A root provider's effect runs last, so an unconditional write here would
    // be the one that destroys the title the route owns. It must not happen.
    expect(document.title).toBe("التعليقات - القصة abc123");

    await user.click(render1.getByRole("button", { name: "to english" }));

    // And it must not happen on a toggle either: no server metadata is
    // locale-aware, so there is no localized route title to write. Replacing the
    // route's title with the site name is not a translation.
    expect(document.title).toBe("التعليقات - القصة abc123");
    expect(meta.getAttribute("content")).toBe("route description");

    render1.unmount();
    meta.remove();
  });

  it("mirrors the chrome title into the active locale on the mount pass too", () => {
    // The root layout's metadata is static Arabic, so an English reader's server
    // HTML carries the Arabic title and description. The chrome owns both, so
    // the mount pass is exactly where they belong in the reader's language —
    // the write is destructive only when a route owns the title.
    document.title = stringsFor("ar").shell.appTitle;
    document.documentElement.setAttribute("lang", "en");
    document.documentElement.setAttribute("dir", "ltr");
    const meta = touchMeta(stringsFor("ar").shell.appDescription);

    const render1 = mirror();

    expect(document.title).toBe(stringsFor("en").shell.appTitle);
    expect(meta.getAttribute("content")).toBe(stringsFor("en").shell.appDescription);

    document.title = "";
    document.documentElement.setAttribute("lang", "ar");
    document.documentElement.setAttribute("dir", "rtl");
    render1.unmount();
    meta.remove();
  });

  it("mirrors the chrome title again after the reader navigates", async () => {
    // The regression this component exists for. Next re-applies the route's
    // metadata on every route commit, and for a route that owns none of its own
    // that metadata is the root layout's static Arabic title — so a reader who
    // flipped to English and then clicked a nav link got `حكاوي` back in the
    // tab, above an English page, until the next full page load.
    const user = userEvent.setup();
    document.documentElement.setAttribute("lang", "en");
    document.documentElement.setAttribute("dir", "ltr");

    const render1 = mirror();
    await user.click(render1.getByRole("button", { name: "to english" }));

    expect(document.title).toBe(stringsFor("en").shell.appTitle);

    // The router commits a new route and the head manager writes its title:
    document.title = stringsFor("ar").shell.appTitle;
    navigate(render1, "/books");

    expect(pathname).toBe("/books");
    expect(document.title).toBe(stringsFor("en").shell.appTitle);

    navigate(render1, "/stories");
    render1.unmount();
    document.title = "";
    document.documentElement.setAttribute("lang", "ar");
    document.documentElement.setAttribute("dir", "rtl");
  });

  it("stops mirroring once a route with its own metadata is navigated to", () => {
    document.title = stringsFor("ar").shell.appTitle;
    document.documentElement.setAttribute("lang", "en");
    document.documentElement.setAttribute("dir", "ltr");

    const render1 = mirror();
    expect(document.title).toBe(stringsFor("en").shell.appTitle);

    // The route now owns its title, so the mirror steps aside and leaves it —
    // the same ownership rule, applied after a navigation instead of on mount.
    document.title = "المتابعون — مستخدم";
    navigate(render1, "/users/user-1/followers");

    expect(document.title).toBe("المتابعون — مستخدم");

    render1.unmount();
    document.title = "";
    document.documentElement.setAttribute("lang", "ar");
    document.documentElement.setAttribute("dir", "rtl");
  });

  it("mirrors the title even when the page carries no description meta", async () => {
    const user = userEvent.setup();

    const render1 = mirror();

    await user.click(render1.getByRole("button", { name: "to english" }));

    expect(document.title).toBe(stringsFor("en").shell.appTitle);
    expect(document.querySelector('meta[name="description"]')).toBeNull();

    render1.unmount();
  });

  it("renders nothing", () => {
    const render1 = mirror();

    expect(render1.container.firstElementChild).not.toBeNull();
    expect(render1.container.querySelector("main, aside, nav, header")).toBeNull();
    // The only element in the tree is the probe the suite uses to flip the locale.
    expect(render1.container.textContent).toBe("to english");

    render1.unmount();
  });
});
