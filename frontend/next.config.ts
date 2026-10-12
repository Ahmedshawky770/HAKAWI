import type { NextConfig } from "next";

/**
 * The Content-Security-Policy applied to every response.
 *
 * WHY `'unsafe-inline'` IS STILL IN `script-src`, AND THAT REMOVING IT IS FUTURE WORK. Next.js
 * inlines the bootstrap that hydrates the client bundle, and `layout.tsx` runs an inline theme
 * resolver (`PREFERENCE_BOOTSTRAP_SCRIPT`) in `<head>` before first paint to avoid a
 * dark-then-light flash for light-mode readers. Neither is reachable by a hash or nonce under the
 * current static rendering model — a nonce would force every route to be dynamically rendered and
 * disable Partial Prerendering (see the CSP guide in `next/dist/docs`). So the inline scripts are
 * permitted by keyword today. This is a genuine CSP weakening, recorded deliberately: the stored XSS
 * that motivated it is fixed by `src/lib/sanitize-html.ts` at the only sink that renders untrusted
 * HTML, and `'unsafe-inline'` is not what an attacker exploits there. Migrating to a nonce-based
 * policy behind dynamic rendering (or an SRI/hashed build) is the follow-up that lets it drop.
 *
 * WHY `img-src` ALLOWS `data:` AND ALL OF `https:`. Covers are served from presigned S3/CDN hosts
 * that cannot be allowlisted (the host is a presigned, expiring URL), so images must be loadable
 * from any https origin.
 *
 * ⚠️ WHY `connect-src` IS NOT `'self'`, AND WHY THAT IS A CRITICAL POLICY BUG THAT WAS SHIPPED. The
 * app does not call the API from its own origin. `src/lib/api.ts` resolves
 * `NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"` — the frontend chart defaults
 * `NEXT_PUBLIC_API_URL` to `https://api.hakawi.com/api/v1` — and sends every request with
 * `credentials: 'include'`, so the browser classifies them as cross-origin. `src/lib/api.ts`
 * (`uploadFile`) then PUTs the file body straight to the presigned S3 host it was handed. A
 * `connect-src 'self'` policy blocks all of it at once: no login, no story load, no upload, and
 * the app is dead on arrival in any environment that is not a same-origin dev proxy. This is not a
 * hardening trade-off, it is the entire data path of the application, which is why the origin list
 * below is the API plus the storage hosts and not a keyword.
 *
 * WHY THE API ORIGIN IS NAMED RATHER THAN ALL OF `https:`. Two concrete origins are known — the
 * dev server and the production ingress — so two entries allowlist them. A blanket `https:` in
 * `connect-src` would let any page that ever loads in this origin POST the session cookie
 * anywhere on the internet, which is the exfiltration primitive a CSP exists to prevent; the cost
 * of naming the two origins is that a new deployment origin needs this file edited, and that cost
 * is one line against losing the policy's meaning.
 *
 * WHY THE S3 HOSTS ARE A WILDCARD. Uploads are a `PUT` to `https://<bucket>.s3.<region>.amazonaws.com`
 * with a presigned URL whose host cannot be pinned in advance: the bucket and the region are
 * deployment configuration, and the presigned URL is generated per upload. `https://*.s3.*.amazonaws.com`
 * covers every AWS region for the virtual-hosted-style bucket hostname while still excluding
 * non-S3 https hosts, so an exfiltration target has to be an S3 bucket.
 *
 * FUTURE WORK, AND WHY IT IS NOT DONE HERE. A Next.js rewrite in `next.config.ts`
 * (`source: "/api/:path*" → destination: NEXT_PUBLIC_API_URL/…`) would make every API call
 * same-origin, which would let `connect-src` return to `'self'` and delete the API entries. It has
 * to be done together with the backend's CORS/origin handling and with the S3 host either pinned
 * or moved behind a server-side proxy, so it is tracked rather than half-applied: a policy that
 * names three hosts is a weakened one, and the honest way to get back to `'self'` is to remove
 * the reason it is needed, not to hope.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' http://localhost:3001 https://api.hakawi.com https://*.s3.*.amazonaws.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: CONTENT_SECURITY_POLICY,
  },
  // Stops the browser from MIME-sniffing a response into an executable type, which is one of the
  // ways an uploaded file has historically turned into an XSS vector on platforms that serve
  // user content.
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // Aligned to the backend's one-year HSTS (`backend/src/main.ts` sends
  // `max-age=31536000; includeSubDomains`). A policy that differs between the app shell and the
  // API is a policy nobody can reason about after an incident: the API is the host that holds the
  // session cookie, and being one year behind the shell meant a request that landed on the API
  // origin over http stayed downgradable for two years after the shell had locked to https.
  //
  // WHY `preload` IS NOT SET, AND IS NOT SET ON THE BACKEND EITHER. The preload list is a public
  // commitment that cannot be taken back: a domain on it is https-only in every browser
  // regardless of what its server says, and a mistake takes months and a delisting request to
  // undo. Half-adopting it here — preload on the shell, not on the API — would be the worst of
  // both: the shell becomes irreversible while the API, the host that actually needs it, is not
  // committed. Both hosts carry the same one-year value, which is the level that is safe to
  // reverse, and preload stays a separate, deliberate decision.
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@hakawi/shared-types"],
  async headers() {
    return [
      {
        // All routes: the app is a single-page shell under the app router, and every route serves
        // HTML that carries the inline bootstrap and the untrusted-story render.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
