"use client";

import { useSyncExternalStore } from "react";

import { getStoredUser, type StoredUser } from "@/lib/api";
import { onSessionChanged } from "@/lib/session-events";

/**
 * The session, read the one way a React component is allowed to read it.
 *
 * WHY THIS FILE EXISTS. `getStoredUser()` was called DURING RENDER by the
 * pages that need to know who the reader is — the profile page and the
 * capability gate — and that read is the one thing a component must not do
 * with a value that does not exist on the server. Local storage is a browser
 * fact: on the server `getStoredUser()` answers `null`, so the server renders
 * the markup of a signed-OUT reader and the client renders the markup of a
 * signed-IN one. React does not merge those two: it warns about the
 * mismatch, throws the server's HTML away and renders the client's version —
 * so the reader sees a frame of the wrong screen, and a signed-in reader
 * whose profile page renders "not found" on the server sees that flash
 * before the page settles.
 *
 * The alternative — read it in an effect and set state — is the same defect
 * with an extra render: the value is KNOWN by the time the page paints, and
 * an effect that sets state afterwards is a second render to deliver it.
 *
 * So the value is read through `useSyncExternalStore`, the same store
 * `ThemeProvider` and `LocaleProvider` read their preferences from, and the
 * same pattern `app/(app)/stories/[id]/page.tsx` already uses for the
 * viewer's id. The server is given `null` — it has no session to give — and
 * the client is given the reader. React hydrates the server's answer and then
 * reads the store again, so the two never disagree about what was rendered.
 *
 * WHY IT IS ITS OWN MODULE AND NOT A LINE IN `lib/account.ts`. `lib/account.ts`
 * is imported by code that is not React — the capability rules are a fact
 * about the product, not about a component — and a hook in it would drag
 * React into every one of those importers. This module is imported by
 * components only, and it is the one place that knows how the session is
 * stored.
 */

/**
 * The key the session lives under.
 *
 * `setStoredUser` and `clearStoredUser` in `lib/api.ts` own it; this is the
 * same key, named once here so the subscription can listen for exactly it.
 */
const USER_STORAGE_KEY = "hakawi_user";

/**
 * THE SNAPSHOT HAS TO BE THE SAME OBJECT, OR REACT NEVER STOPS RENDERING.
 *
 * `useSyncExternalStore` compares the snapshot it is given against the last one
 * with `Object.is`, and a new object every time is a change every time: React
 * renders, reads the snapshot, sees a different object, and renders again —
 * forever.
 *
 * The identity is kept by the READ itself: `getStoredUser` compares the raw
 * stored value and hands back the same parsed object for as long as the
 * session it describes is unchanged. So the snapshot is simply that object,
 * and the comparison React makes is against the same one it saw last time.
 *
 * The parse is done once as well, and not on every read: the raw value is one
 * `getItem` away from the parsed one, and the parse costs a `JSON.parse` and a
 * schema validation — work that was being redone at least twice per render,
 * for every component that reads the session.
 */
function getSnapshot(): StoredUser | null {
  return getStoredUser();
}

/**
 * THE SERVER HAS NO SESSION, BECAUSE THE SERVER HAS NO LOCAL STORAGE.
 *
 * This is the half of the store that removes the hydration mismatch: the
 * server renders "nobody is signed in" and the client renders the reader, and
 * React is told to hydrate the SERVER's answer first and to read the store
 * again straight after.
 */
function getServerSnapshot(): StoredUser | null {
  return null;
}

/**
 * THE OTHER TABS, AND THIS ONE.
 *
 * A sign-in or a sign-out in ANOTHER tab writes the `hakawi_user` key, and the
 * browser tells every OTHER tab about it with a `storage` event on `window`.
 * Without the subscription, a reader who signed in on the phone and then
 * opened the app on the laptop would keep seeing the signed-out state on the
 * laptop until they reloaded it — the one place the session is a fact about
 * the BROWSER and not about the tab.
 *
 * THE EVENT DOES NOT FIRE IN THE TAB THAT MADE THE CHANGE, so this tab needs
 * its own signal. There is one: `lib/api.ts` announces every write to the
 * stored session — a sign-in, a sign-out, a 401 that wiped it — and this
 * module listens to it. The subscription used to rely on the navigation that
 * follows a sign-in, which is true of the sign-in screen and false of every
 * other path: a 401 that ends the session does not navigate on its own, and
 * the header kept showing the reader who was just signed out.
 */
function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const onStorage = (event: StorageEvent) => {
    // `key === null` is a `localStorage.clear()`, which takes the session with it.
    if (event.key === null || event.key === USER_STORAGE_KEY) onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  const unsubscribe = onSessionChanged(onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    unsubscribe();
  };
}

/**
 * The signed-in reader, or `null` when nobody is signed in.
 *
 * The answer is the same on the server and on the client for the FIRST
 * render, and it is the reader's on every render after that.
 */
export function useStoredUser(): StoredUser | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * The signed-in reader's id, or `null` when nobody is signed in.
 *
 * A projection of `useStoredUser` for the surfaces that only need the id — the
 * owner controls, the "is this mine" comparisons — so they do not each reach
 * into the session for it. It answers `null` and not `""`, because a reader
 * who is not signed in and a reader whose id is the empty string are two
 * different facts, and only one of them is a visitor.
 */
export function useViewerId(): string | null {
  return useStoredUser()?.id ?? null;
}
