/**
 * The object-storage origins the browser is allowed to upload to, in one place.
 *
 * WHY IT IS A MODULE AND NOT A LITERAL IN THE POLICY. The origins are needed by the
 * Content-Security-Policy (`connect-src` in `next.config.ts`) and by nobody else — the
 * presigned URL the API hands the browser is what the browser actually PUTs to, so the
 * policy is the only place the list is enforced. A literal in one file and a second
 * copy in a comment are two facts, and the copy in the comment is the one that decides
 * whether an upload is allowed.
 *
 * WHY THE LIST IS A LIST AND NOT ONE WILDCARD. The host the browser uploads to is
 * `https://<bucket>.s3.<region>.amazonaws.com` — the bucket AND the region are in the
 * hostname, because the AWS SDK signs the URL against a regional endpoint (verified
 * against the SDK this repository depends on: `us-east-1` produces
 * `hakawi-media.s3.us-east-1.amazonaws.com`, `eu-west-1` produces
 * `hakawi-media.s3.eu-west-1.amazonaws.com`).
 *
 * The policy this replaces was `https://*.s3.*.amazonaws.com`, and it did not work: a
 * CSP host-source may carry a wildcard in its LEFTMOST label only
 * (`host-part = "*" / [ "*." ] 1*host-char *( "." 1*host-char )` in CSP3 §2.3.1), so the
 * second `*` was not a wildcard at all. Chrome refused the whole source —
 * "Content-Security-Policy: Couldn't parse invalid host https://*.s3.*.amazonaws.com" —
 * and dropped it, which left `connect-src` without the storage hosts and blocked every
 * upload while the browser reported a policy that had been written to allow it.
 *
 * So the two wildcards are spelled out: the bucket stays a wildcard, because the bucket
 * name is deployment configuration (`STORAGE_BUCKET` on the API), and the region becomes
 * one entry per region, because a region is a name and not a pattern. The result still
 * excludes every non-storage https host, which is the property the policy exists for: an
 * exfiltration target still has to be an S3 bucket.
 *
 * WHY THE REGIONS ARE ENUMERATED RATHER THAN PINNED AT BUILD TIME. The region the API
 * signs against is `STORAGE_REGION` on the backend, so the two could disagree — and a
 * disagreement is invisible until somebody tries to upload in a region the policy does
 * not name, which is the worst moment to find out.
 *
 * ⚠️ WHAT THIS LIST DOES NOT COVER. Two cases, both named so that nobody discovers them
 * by being refused: a path-style endpoint (`https://s3.<region>.amazonaws.com/<bucket>/…`)
 * is not allowed, because the SDK signs virtual-hosted style URLs (`forcePathStyle` is
 * not set, so the bucket is in the hostname) — except for a bucket name that contains a
 * dot, which the SDK cannot sign as a hostname and which it therefore addresses path
 * style; and a region AWS opens AFTER this list was written is not allowed until the
 * list gains that region. Both are one-line changes here, and neither is a security
 * hole — the failure mode is a refused upload, not a widened policy.
 *
 * IT IS READ AT BUILD TIME FOR THE CSP. `next.config.ts` is evaluated when the app is
 * built and its headers are serialized into the build manifest, so a runtime-only
 * variable cannot change the served policy.
 */

/**
 * The origins the browser may upload to, as CSP host sources.
 *
 * `https://*.s3.amazonaws.com` is the GLOBAL endpoint, which still serves buckets that
 * were created before the regional endpoints existed and which some tooling still
 * addresses. It is a valid host source (the wildcard is in the leftmost label), unlike
 * the two-wildcard expression it replaces.
 */
const GLOBAL_ORIGIN = "https://*.s3.amazonaws.com";

/**
 * The regions of the AWS partition, and the suffix its endpoints carry.
 *
 * THE LIST IS TAKEN FROM THE SDK THIS REPOSITORY DEPENDS ON, NOT FROM MEMORY. The
 * endpoint data the AWS SDK ships (`@aws-sdk/core`, `partitions.json`) is the
 * authority on which regions exist and what their hostnames look like, and it is in
 * this repository's own `node_modules` — so the list can be checked against it rather
 * than trusted. A region missing from this list is a region where an upload is
 * refused, and a region listed with the WRONG suffix is a region where an upload is
 * refused as well, which is how the two China entries used to be dead: the China
 * partition's suffix is `amazonaws.com.cn`, not `amazonaws.com`.
 */
const AWS_REGIONS = [
  "af-south-1",
  "ap-east-1",
  "ap-east-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-south-1",
  "ap-south-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-southeast-3",
  "ap-southeast-4",
  "ap-southeast-5",
  "ap-southeast-6",
  "ap-southeast-7",
  "ca-central-1",
  "ca-west-1",
  "eu-central-1",
  "eu-central-2",
  "eu-north-1",
  "eu-south-1",
  "eu-south-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "il-central-1",
  "me-central-1",
  "me-south-1",
  "mx-central-1",
  "sa-east-1",
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
] as const;

/**
 * The regions of the China partition, whose endpoints end in `amazonaws.com.cn`.
 */
const AWS_CHINA_REGIONS = ["cn-north-1", "cn-northwest-1"] as const;

/**
 * The regions of the European Sovereign Cloud partition, whose endpoints end in
 * `amazonaws.eu`.
 */
const AWS_SOVEREIGN_EU_REGIONS = ["eusc-de-east-1"] as const;

/**
 * The regions of the GovCloud partition. Its suffix is `amazonaws.com` — the same as
 * the commercial one — but its region names are their own, so they are listed here.
 */
const AWS_GOVCLOUD_REGIONS = ["us-gov-east-1", "us-gov-west-1"] as const;

/**
 * The origins of every region, from the regions and the suffix of their partition.
 */
const REGIONAL_ORIGINS: readonly string[] = [
  ...AWS_REGIONS.map((region) => `https://*.s3.${region}.amazonaws.com`),
  ...AWS_CHINA_REGIONS.map((region) => `https://*.s3.${region}.amazonaws.com.cn`),
  ...AWS_SOVEREIGN_EU_REGIONS.map((region) => `https://*.s3.${region}.amazonaws.eu`),
  ...AWS_GOVCLOUD_REGIONS.map((region) => `https://*.s3.${region}.amazonaws.com`),
];

/**
 * ⚠️ THE ISO PARTITIONS ARE NOT HERE, AND THAT IS A DECISION.
 *
 * `us-iso-east-1`, `us-iso-west-1`, `us-isob-east-1`, `us-isob-west-1`,
 * `eu-isoe-west-1`, `us-isof-east-1` and `us-isof-south-1` are the classified
 * partitions, and their endpoints end in `c2s.ic.gov`, `sc2s.sgov.gov`,
 * `cloud.adc-e.uk` and `csp.hci.ic.gov`. They are not reachable from the public
 * internet, so no browser can upload to them and no policy needs to allow them. A
 * reader who moved the product into one of those partitions would add its region here
 * with its own suffix.
 *
 * `aws-global` is not here either, and it is not a region: it is the partition's
 * pseudo-region, and its endpoint is the global one, which is already allowed.
 */

/**
 * THE ORIGINS THE POLICY ALLOWS.
 *
 * `NEXT_PUBLIC_STORAGE_ORIGIN` narrows them to ONE bucket in ONE region, and a
 * deployment that knows its own bucket should set it: the regional list allows any
 * bucket in any region, which is the same as saying "the exfiltration target must be
 * SOME bucket", while the pinned origin says "it must be THIS bucket". The variable is
 * a build argument for the same reason `NEXT_PUBLIC_API_URL` is — the policy is
 * serialized at build time — and it is read here, in one place, so that the policy and
 * the deployment cannot disagree about it.
 *
 * The default is the full list, because the bucket name is deployment configuration
 * the frontend does not otherwise know, and a policy that allowed nothing would break
 * uploads in every environment that had not been configured.
 */
export const S3_UPLOAD_ORIGINS: readonly string[] = (() => {
  const pinned = process.env.NEXT_PUBLIC_STORAGE_ORIGIN?.trim();

  if (pinned) {
    // THE PINNED ORIGIN IS VALIDATED, or the policy fails in the one way nobody can
    // see. A value that is not an origin — a hostname with no scheme, a bucket with a
    // typo — is a legal single-label host source to a browser, so the policy would
    // carry it, parse it, and refuse every upload, with a console that says the
    // policy allows the upload. A build that fails with a sentence about the variable
    // is worth more than a policy that looks right.
    let origin: URL;

    try {
      origin = new URL(pinned);
    } catch {
      throw new Error(
        `NEXT_PUBLIC_STORAGE_ORIGIN is not a URL: ${JSON.stringify(pinned)}. It is the origin the browser ` +
          "uploads to, and it is written into the Content-Security-Policy verbatim — a malformed value would " +
          "produce a policy that refuses every upload while claiming to allow it.",
      );
    }

    if (origin.protocol !== "https:" && origin.protocol !== "http:") {
      throw new Error(
        `NEXT_PUBLIC_STORAGE_ORIGIN must be an http or https origin, and it is ${JSON.stringify(pinned)}.`,
      );
    }

    return [origin.origin];
  }

  return [GLOBAL_ORIGIN, ...REGIONAL_ORIGINS];
})();
