import { afterEach, describe, expect, it, vi } from "vitest";

import { S3_UPLOAD_ORIGINS } from "./storage-origins";
// The parser is a plain ES module under `frontend/scripts/`, so it is imported
// by path rather than by the `@/` alias (which resolves into `src/`).
import { hostSourceProblem } from "../../scripts/csp-sources.mjs";

/**
 * WHY THIS SUITE EXISTS.
 *
 * The origins below are the ones the browser is allowed to upload to, and they reach the page
 * inside a `connect-src` source list. A source the browser cannot parse is DROPPED — silently,
 * as far as the page is concerned — so the policy that reaches the browser is narrower than
 * the one that was written, and the symptom is a refused upload rather than a broken policy.
 *
 * The expression this list replaced, `https://*.s3.*.amazonaws.com`, was exactly that: a second
 * wildcard in a position where CSP does not allow one. The browser refused it, and the console
 * said "Couldn't parse invalid host".
 *
 * It is also the suite that keeps the list TRUE. A region that AWS opens and the list does not
 * know about is a region where uploads are refused, and a region listed with the wrong suffix
 * is a region where uploads are refused as well — which is what the two China entries used to
 * be, since the China partition's suffix is `amazonaws.com.cn` and not `amazonaws.com`.
 */
describe("S3_UPLOAD_ORIGINS", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is not empty", () => {
    expect(S3_UPLOAD_ORIGINS.length).toBeGreaterThan(0);
  });

  it("carries only sources a browser can parse", () => {
    for (const origin of S3_UPLOAD_ORIGINS) {
      expect(hostSourceProblem(origin), origin).toBeNull();
    }
  });

  it("covers the host the AWS SDK signs an upload against", () => {
    // The SDK signs `https://<bucket>.s3.<region>.amazonaws.com/<key>` for the region it is
    // configured with — verified against the SDK this repository depends on. The bucket is a
    // wildcard because the bucket name is deployment configuration.
    for (const region of ["us-east-1", "eu-west-1", "ap-south-1"]) {
      const host = `hakawi-media.s3.${region}.amazonaws.com`;

      expect(S3_UPLOAD_ORIGINS.some((origin) => hostMatchesOrigin(host, origin)), host).toBe(true);
    }
  });

  it("covers the regions AWS opened after the list was first written", () => {
    // Mexico, Taipei and the newest Asia Pacific region. A region missing from the list is a
    // region where an upload is refused, and the list is only useful if it is complete.
    for (const region of ["mx-central-1", "ap-east-2", "ap-southeast-6"]) {
      const host = `hakawi-media.s3.${region}.amazonaws.com`;

      expect(S3_UPLOAD_ORIGINS.some((origin) => hostMatchesOrigin(host, origin)), region).toBe(true);
    }
  });

  it("carries the China regions with the suffix their partition uses", () => {
    // The China partition's endpoints end in `amazonaws.com.cn`. An entry that says
    // `amazonaws.com` can never match, so it is a region whose uploads are refused.
    for (const region of ["cn-north-1", "cn-northwest-1"]) {
      const host = `hakawi-media.s3.${region}.amazonaws.com.cn`;

      expect(S3_UPLOAD_ORIGINS.some((origin) => hostMatchesOrigin(host, origin)), region).toBe(true);
    }
  });

  it("does not allow a host that is not storage", () => {
    for (const origin of S3_UPLOAD_ORIGINS) {
      expect(hostMatchesOrigin("evil.example.com", origin), origin).toBe(false);
      expect(hostMatchesOrigin("evil.s3.attacker.example.com", origin), origin).toBe(false);
    }
  });

  it("is replaced by one origin when the deployment names its own bucket", () => {
    // `NEXT_PUBLIC_STORAGE_ORIGIN` narrows the policy to the bucket the deployment
    // actually uses, which is a strictly tighter policy and a much smaller header.
    vi.stubEnv("NEXT_PUBLIC_STORAGE_ORIGIN", "https://hakawi-media.s3.us-east-1.amazonaws.com");
    vi.resetModules();

    return import("./storage-origins").then((module) => {
      expect(module.S3_UPLOAD_ORIGINS).toEqual(["https://hakawi-media.s3.us-east-1.amazonaws.com"]);
    });
  });
});

/**
 * Whether a host is covered by a CSP host source, the way a browser matches the two: the
 * source's wildcard stands for the LEFTMOST label and for nothing else, and a source with
 * no wildcard matches the host itself and any subdomain of it.
 */
function hostMatchesOrigin(host: string, origin: string): boolean {
  const source = origin.replace(/^https?:\/\//, "");
  const sourceHost = source.split("/")[0].split(":")[0];
  const hostHost = host.split(":")[0];

  if (sourceHost.startsWith("*.")) {
    const suffix = sourceHost.slice(1);
    return hostHost.endsWith(suffix);
  }

  return hostHost === sourceHost || hostHost.endsWith(`.${sourceHost}`);
}
