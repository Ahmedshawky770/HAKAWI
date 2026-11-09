/**
 * Content-Security-Policy builder, in one place.
 *
 * WHY A BUILD FUNCTION AND NOT A CONSTANT. The policy carries a per-request
 * nonce in `script-src` (`'nonce-<value>'`), so the header has to be assembled
 * for every request. Next.js middleware generates the nonce and calls this
 * function; Next.js itself reads the nonce back from the header via
 * `getScriptNonceFromHeader` and applies it to its own inline runtime scripts.
 *
 * This means `'unsafe-inline'` is no longer needed in `script-src` — every
 * inline script Next.js injects carries a nonce it read from this header, and
 * our own bootstrap script is external (`/js/preference-bootstrap.js`) and
 * covered by `'self'`.
 *
 * The nonce is cryptographically random (16 bytes, base64-encoded), so an
 * attacker cannot guess it and inject a script with a matching nonce attribute.
 */
import { PAYMOB_ORIGIN } from "./paymob";
import { S3_UPLOAD_ORIGINS } from "./storage-origins";

export function computeApiOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001/api/v1";
  try {
    return new URL(configured).origin;
  } catch {
    throw new Error(
      `NEXT_PUBLIC_API_URL is not a URL: ${JSON.stringify(configured)}. The Content-Security-Policy ` +
        "derives the API origin from it, so a malformed value has to fail the request rather than " +
        "produce a policy that refuses every API call.",
    );
  }
}

export function buildCsp(nonce: string): string {
  const apiOrigin = computeApiOrigin();
  return [
    "default-src 'self'",
    // `'nonce-${nonce}'` covers every inline script Next.js injects (hydration,
    // RSC payload, etc.). `'unsafe-inline'` is removed: only scripts carrying
    // the nonce this header names may execute.
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: https: ${apiOrigin}`,
    `connect-src 'self' ${apiOrigin} ${S3_UPLOAD_ORIGINS.join(" ")}`,
    // `frame-src` names the payment gateway for the checkout iframe.
    `frame-src 'self' ${PAYMOB_ORIGIN}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
