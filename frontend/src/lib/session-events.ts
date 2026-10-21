/**
 * THE TWO SIGNALS THE SESSION SENDS.
 *
 * WHY THEY LIVE HERE AND NOT IN `lib/api.ts`. Both of them are about the
 * session, and neither of them is about the API: one says "the session you
 * were using is gone", the other says "the session that is stored has
 * changed". The API client is the thing that SENDS them, but it is not the
 * only thing that needs to RECEIVE them — the providers own the cache, the
 * session guard owns the redirect, and the stored-session hook owns the
 * reader's own record.
 *
 * And a module that is MOCKED is a module whose exports disappear. The test
 * suites replace `@/lib/api` with a hand-written object, and a signal that
 * lived there would be missing from that object — so a hook that listened for
 * it would throw in the tests that render it, and the listener would have to
 * be added to every mock in the suite. A signal that lives in its own module
 * is never mocked away, and the API client imports it from there.
 *
 * WHY THERE ARE TWO SIGNALS AND NOT ONE. They answer two different questions:
 *
 *   · "the session is GONE" — the reader was signed in and is not any more.
 *     Nothing must be kept from that session, and the reader must be sent to
 *     the sign-in screen.
 *   · "the stored session CHANGED" — the session was written or erased. Every
 *     reader of the stored session has to look again.
 *
 * A sign-in is a change and not a loss; a 401 that ends a session is both.
 */

/**
 * The listener is told WHAT ended the session.
 *
 * The failure carries the server's own wording, and the wording is what says
 * whether the reader was signed out because the session expired or because
 * the account is disabled. Without it, a reader whose account was blocked
 * mid-session was told "your session has ended" — which is a sentence about
 * the wrong problem, and one they cannot fix by signing in again.
 */
type SessionLostListener = (error: unknown) => void;
type SessionChangedListener = () => void;

const sessionLostListeners = new Set<SessionLostListener>();
const sessionChangedListeners = new Set<SessionChangedListener>();

/**
 * Announce that the session the reader was using is gone.
 *
 * The API client calls this when a request that USES the session is refused
 * with a 401. It is not called for a refused SIGN-IN: a wrong password is a
 * fact about the attempt, and it must not destroy the session the reader
 * already has.
 */
export function notifySessionLost(error?: unknown): void {
  for (const listener of sessionLostListeners) {
    try {
      listener(error);
    } catch {
      // A listener that fails must not turn a lost session into a crash.
    }
  }
}

/**
 * Subscribe to the loss of the session.
 *
 * @returns the function that cancels the subscription.
 */
export function onSessionLost(listener: SessionLostListener): () => void {
  sessionLostListeners.add(listener);
  return () => {
    sessionLostListeners.delete(listener);
  };
}

/**
 * Announce that the STORED session changed.
 *
 * A write in this tab does not fire the browser's `storage` event — that one
 * only reaches the OTHER tabs — so without this signal a reader who signed in
 * or signed out in this tab kept the old session for as long as the tab
 * stayed open.
 */
export function notifySessionChanged(): void {
  for (const listener of sessionChangedListeners) {
    try {
      listener();
    } catch {
      // A listener that fails must not turn a session change into a crash.
    }
  }
}

/**
 * Subscribe to changes of the stored session.
 *
 * @returns the function that cancels the subscription.
 */
export function onSessionChanged(listener: SessionChangedListener): () => void {
  sessionChangedListeners.add(listener);
  return () => {
    sessionChangedListeners.delete(listener);
  };
}
