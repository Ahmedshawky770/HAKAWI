import type { NextConfig } from "next";

const securityHeaders = [
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
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
