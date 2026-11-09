import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { buildCsp } from "@/lib/csp";

/**
 * Per-request CSP nonce middleware.
 *
 * Generates a cryptographically random nonce for every request and writes it
 * into the `Content-Security-Policy` header as `'nonce-<value>'` in
 * `script-src`. Next.js reads the nonce back from this header
 * (`getScriptNonceFromHeader`) and applies it to its own injected runtime
 * scripts, so `'unsafe-inline'` is no longer needed for our scripts.
 *
 * The nonce is 16 bytes base64-encoded — unpredictable enough that an attacker
 * cannot guess it and inject a script with a matching `nonce` attribute.
 */
export function middleware(_nextRequest: NextRequest) {
  void _nextRequest;
  const nonce = crypto.randomUUID().replaceAll("-", "").replaceAll(".", "");
  const csp = buildCsp(nonce);

  const response = NextResponse.next();
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match every request path except Next.js internals and static assets:
     * - _next/static, _next/image — framework assets, no HTML, no CSP needed
     * - favicon.ico — icon, not HTML
     * - anything with a file extension — static files served directly
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*$).*)",
  ],
};
