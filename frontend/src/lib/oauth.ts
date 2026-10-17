import { isOAuthProvider, type OAuthProvider } from "@hakawi/shared-types";

import { API_URL } from "@/lib/api";

/**
 * The backend route that opens a provider handshake.
 *
 * The frontend never builds an authorization URL itself: the client id, the scopes, and the
 * redirect URI are the backend's to own, and `GET /auth/oauth/:provider` answers with a redirect
 * to the provider's consent screen. The provider then sends the reader back to the API's own
 * callback, which mints the session cookies and lands the reader on `/auth/callback` — the same
 * page every other sign-in completes on.
 *
 * The URL is exported for the one caller that needs to reason about it (the sign-in controls)
 * and for the tests that pin the origin; `startOAuth` is the function to call, not this.
 */
export function oauthStartUrl(provider: OAuthProvider): string {
  return `${API_URL}/auth/oauth/${provider}`;
}

/**
 * Sends the browser to `provider`'s consent screen through the backend handshake.
 *
 * `assign` rather than the app router's `push`: the destination is a different origin — the API
 * host — and the router cannot navigate across origins. The checkout flows in the book pages
 * leave the origin the same way, for the same reason.
 *
 * An undeclared provider is refused rather than navigated to. The value arrives from the shared
 * provider list, but a control id is still input: forwarding anything the list does not contain
 * would mean opening a handshake with whatever host was asked for.
 */
export function startOAuth(provider: string): void {
  if (!isOAuthProvider(provider)) return;
  window.location.assign(oauthStartUrl(provider));
}
