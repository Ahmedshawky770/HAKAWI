/**
 * The payment gateway's origin, in one place.
 *
 * WHY IT IS A MODULE AND NOT A LITERAL IN TWO FILES. The origin is needed by
 * the Content-Security-Policy (`frame-src` in `next.config.ts`) and by the
 * checkout dialog, which decides whether a URL the server handed it is a
 * gateway URL at all. Two literals are two facts, and the second one is the one
 * that decides whether a reader's browser is sent to the payment page.
 *
 * WHY IT IS AN ORIGIN AND NOT A HOSTNAME. The gateway's sandbox and its live
 * environment are the SAME regional host — the mode is decided by the
 * credentials, not by the URL (see `backend/src/config/paymob.config.ts`,
 * which is the authority on that). A deployment that reaches the gateway
 * through a proxy of its own sets `NEXT_PUBLIC_PAYMOB_ORIGIN` to that origin
 * instead of this file being edited.
 *
 * IT IS READ AT BUILD TIME FOR THE CSP. `next.config.ts` is evaluated when the
 * app is built and its headers are serialized into the build manifest, so a
 * runtime-only variable cannot change the served policy. The value below is
 * therefore also a build argument for the image.
 *
 * THE INVARIANT WITH THE BACKEND. This origin and the backend's
 * `PAYMOB_BASE_URL` (see `backend/src/config/paymob.config.ts`, which is the
 * authority on it) MUST agree, or every checkout URL the API hands the
 * browser is rejected twice over: by `isGatewayUrl` below, which compares the
 * URL's origin with this one, and by the CSP's `frame-src`, which allows this
 * origin and no other. The backend's DEFAULT base URL is
 * `https://accept.paymob.com/api`, and the default below is
 * `https://accept.paymob.com` — the same origin, because the base URL is the
 * API path under it. A deployment that moves either one moves the other.
 */
export const PAYMOB_ORIGIN = (
  process.env.NEXT_PUBLIC_PAYMOB_ORIGIN || "https://accept.paymob.com"
).replace(/\/+$/, "");

/**
 * True when a URL the server handed us really is the gateway.
 *
 * The checkout URLs arrive from the API, and an API response is not a place to
 * take a browser's address from without checking it: a URL on any other host
 * would take the reader off the product's payment page and onto a page of
 * somebody else's choosing. The CSP's `frame-src` governs the FRAME; a link's
 * `href` is not governed by it, so the check has to happen here.
 */
export function isGatewayUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === PAYMOB_ORIGIN;
  } catch {
    return false;
  }
}
