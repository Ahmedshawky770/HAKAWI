import type { NextConfig } from "next";

import { PAYMOB_ORIGIN } from "./src/lib/paymob";
import { S3_UPLOAD_ORIGINS } from "./src/lib/storage-origins";

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
 * WHY THE API ORIGIN IS DERIVED FROM `NEXT_PUBLIC_API_URL` AND NOT ALL OF `https:`. The client
 * calls one API, at one origin, named by a build variable — so the policy allows that one origin.
 * A blanket `https:` in `connect-src` would let any page that ever loads in this origin POST the
 * session cookie anywhere on the internet, which is the exfiltration primitive a CSP exists to
 * prevent. Deriving the origin from the same variable the client uses removes the possibility of
 * the two disagreeing, which is how the staging API came to be missing from the policy at all.
 *
 * WHY THE S3 HOSTS ARE A LIST AND NOT ONE WILDCARD. Uploads are a `PUT` to
 * `https://<bucket>.s3.<region>.amazonaws.com` with a presigned URL whose host cannot be pinned
 * in advance: the bucket and the region are deployment configuration, and the presigned URL is
 * generated per upload. The list in `src/lib/storage-origins.ts` keeps the BUCKET a wildcard
 * (`https://*.s3.<region>.amazonaws.com`) and spells the REGION out, one entry per region — so
 * every region is covered, every non-S3 https host is still excluded, and an exfiltration target
 * still has to be an S3 bucket. A deployment that knows its own bucket sets
 * `NEXT_PUBLIC_STORAGE_ORIGIN` and the list is replaced by that one origin, which is a strictly
 * tighter policy and a smaller header.
 *
 * WHY IT CANNOT BE ONE EXPRESSION. The policy this replaced was `https://*.s3.*.amazonaws.com`,
 * and it never worked: a CSP host-source may carry a wildcard in its LEFTMOST label only
 * (CSP3 §2.3.1), so the second `*` was not a wildcard. Chrome rejected the source outright —
 * "Content-Security-Policy: Couldn't parse invalid host https://*.s3.*.amazonaws.com" — and
 * dropped it, leaving `connect-src` without the storage hosts and refusing every upload while
 * the policy on paper allowed it. `npm run verify:csp` now checks that every host source in
 * the served policy PARSES, so that class of mistake fails the build instead of the browser.
 *
 * FUTURE WORK, AND WHY IT IS NOT DONE HERE. A Next.js rewrite in `next.config.ts`
 * (`source: "/api/:path*" → destination: NEXT_PUBLIC_API_URL/…`) would make every API call
 * same-origin, which would let `connect-src` return to `'self'` and delete the API entries. It has
 * to be done together with the backend's CORS/origin handling and with the S3 host either pinned
 * or moved behind a server-side proxy, so it is tracked rather than half-applied: a policy that
 * names three hosts is a weakened one, and the honest way to get back to `'self'` is to remove
 * the reason it is needed, not to hope.
 */
// The flag is read from `process.env` when this config module is evaluated —
// Next transpiles `next.config.ts` with a plain transform and `require`s it
// (see `next/dist/server/config.js` → `transpile-config.js`), so the value is
// resolved at config-load time, not compile time, and the header is serialized
// into `.next/routes-manifest.json` at build time.
//
// WHAT NEXT ACTUALLY GUARANTEES, STATED PRECISELY. `next/dist/bin/next` sets
// `NODE_ENV` as a DEFAULT when it is unset — `process.env.NODE_ENV = process.env.NODE_ENV || (commandName === 'dev' ? 'development' : 'production')` — and only *warns* when an already-set value disagrees. It does not force it. So
// the production guarantee is environmental, and it holds for every committed
// build path in this repository: the frontend Dockerfile's builder stage and
// the three deploy workflows all build with `NODE_ENV` unset, so `next build`
// defaults it to `production` while this config is loaded. The runtime values —
// the Dockerfile runtime stage's `NODE_ENV=production`, and the Helm chart's
// per-environment `nodeEnv` (which is `staging`, not `production`, in
// `values-staging.yaml`) — arrive after the header is already serialized and
// are deliberately irrelevant to it: `next start` serves the policy from the
// build-time manifest and never re-reads this file. The guarantee does NOT
// hold by construction: `NODE_ENV=development next build` bakes
// `'unsafe-eval'` into a production bundle with nothing but a warning, and
// `next build --debug-prerender` forces `NODE_ENV=development` outright
// (`next/dist/bin/next`). Do not run either.
//
// Because the guarantee is environmental rather than structural, the built
// artifact is the thing that has to be checked — and checked where it ships:
// `npm run verify:csp` asserts that `.next/routes-manifest.json` carries a
// policy without `'unsafe-eval'`. CI runs it after its own build, and the
// frontend image build runs the same assertion immediately after its `next
// build` (`frontend/Dockerfile`), so the artifact that deploys is the one
// asserted — not only the build the CI runner happened to produce. See the
// CHANGELOG entry for this round.
const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

/**
 * The origin the checkout is allowed to frame.
 *
 * The value lives in `src/lib/paymob.ts`, which the checkout dialog reads too:
 * the origin that decides what may be framed and the origin that decides what
 * a reader may be sent to are the same fact, and they are read from one place.
 *
 * ⚠️ IT IS FROZEN INTO THE BUILD. This file is evaluated when the app is
 * BUILT, and its headers are serialized into the build manifest that `next
 * start` serves — the running container's environment cannot change them. A
 * deployment that needs a different origin therefore passes
 * `NEXT_PUBLIC_PAYMOB_ORIGIN` as a BUILD ARGUMENT to the image build, not only
 * as a runtime environment variable. The default below matches the gateway
 * host the backend uses (`backend/src/config/paymob.config.ts`), so a build
 * without the variable still frames the right origin.
 */
const PAYMOB_FRAME_ORIGIN = PAYMOB_ORIGIN;

/**
 * The origin the browser is allowed to talk to.
 *
 * WHY IT IS DERIVED RATHER THAN NAMED. The client calls the API at
 * `NEXT_PUBLIC_API_URL` (`src/lib/api.ts`), and the policy has to allow exactly that
 * origin — one origin, from one variable. The policy used to NAME two origins
 * (`http://localhost:3001` and `https://api.hakawi.com`), and the staging
 * deployment's API (`https://staging-api.hakawi.io`) was in neither of them: the
 * staging frontend is served from `staging.hakawi.io`, which is a different origin,
 * so `'self'` did not cover it either, and every API call in staging was refused by
 * the policy before it reached the API. A policy that names the wrong host fails
 * silently, in a browser console, on one environment — which is exactly how that
 * stayed unnoticed.
 *
 * The default matches the client's own default (`src/lib/api.ts`), so a build
 * without the variable allows the same origin the client will call, and a build
 * with it allows the same origin the client will call. The two cannot disagree.
 *
 * ⚠️ IT IS FROZEN INTO THE BUILD, like every other origin here: `next.config.ts` is
 * evaluated when the app is built, and the header is serialized into the build
 * manifest. A deployment passes `NEXT_PUBLIC_API_URL` as a BUILD ARGUMENT.
 */
const API_ORIGIN = (() => {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:3001/api/v1";

  try {
    return new URL(configured).origin;
  } catch {
    throw new Error(
      `NEXT_PUBLIC_API_URL is not a URL: ${JSON.stringify(configured)}. The Content-Security-Policy ` +
        "derives the API origin from it, so a malformed value has to fail the build rather than " +
        "produce a policy that refuses every request.",
    );
  }
})();

// WHY `'unsafe-eval'` IS DEV-ONLY. React's development build reconstructs server error stacks in
// the browser and runs its debug hooks through `eval()`, which a bare `script-src` reports as
// "[browser] eval() is not supported in this environment" on every dev page while doing nothing
// to improve safety — it only breaks debugging. Neither React nor Next.js call `eval` in
// production, so the keyword is attached only when this config is loaded with
// NODE_ENV=development and the production policy keeps `eval` blocked. (Per the CSP guide in
// `next/dist/docs`.)
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${IS_DEVELOPMENT ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self' " + API_ORIGIN + " " + S3_UPLOAD_ORIGINS.join(" "),
  // WHY `frame-src` NAMES THE PAYMENT GATEWAY. The checkout loads Paymob's
  // `/acceptance/iframes/<token>` page INSIDE a frame — that URL is a frame
  // target, not a page, and a top-level redirect to it shows a bare document
  // with no way back. Without this directive the policy falls back to
  // `default-src 'self'` and the frame is refused, so the checkout is dead on
  // every browser. The host is the same for Paymob's sandbox and its live
  // environment (see `backend/src/config/paymob.config.ts`), and a deployment
  // that proxies the gateway sets `NEXT_PUBLIC_PAYMOB_ORIGIN` rather than
  // editing this file.
  `frame-src 'self' ${PAYMOB_FRAME_ORIGIN}`,
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
