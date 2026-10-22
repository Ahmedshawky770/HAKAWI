import { describe, it, expect } from "vitest";

import {
  classifySource,
  directiveName,
  directiveTokens,
  hostSourceProblem,
  stripQuotes,
  unparseableSources,
} from "./csp-sources.mjs";

/**
 * WHY THIS SUITE EXISTS.
 *
 * The parser decides whether the build fails, and its two failure modes are opposites: a source
 * that LOOKS fine and does not parse — which the browser drops, leaving the page with a policy
 * NARROWER than the one that was written — and a source that parses and is refused because the
 * parser is stricter than the browser, which fails a build for no reason at all.
 *
 * The first of those is not hypothetical. `https://*.s3.*.amazonaws.com` was shipped in this
 * repository's `connect-src` and reached every browser in production and development: the
 * console said "Content-Security-Policy: Couldn't parse invalid host", the source was dropped,
 * and every upload was refused by a policy that had been written to allow it.
 */
describe("directiveName", () => {
  it("reads the name of a directive", () => {
    expect(directiveName("script-src 'self'")).toBe("script-src");
    expect(directiveName("connect-src")).toBe("connect-src");
  });

  it("does not confuse a directive with one that starts with it", () => {
    expect(directiveName("script-src-elem 'self'")).toBe("script-src-elem");
    expect(directiveName("script-src-attr")).toBe("script-src-attr");
  });

  it("returns null for a chunk that carries no name", () => {
    expect(directiveName("")).toBeNull();
    expect(directiveName("'self'")).toBeNull();
  });
});

describe("stripQuotes", () => {
  it("removes the quotes from a keyword and leaves a host alone", () => {
    expect(stripQuotes("'unsafe-eval'")).toBe("unsafe-eval");
    expect(stripQuotes("*.example.com")).toBe("*.example.com");
  });
});

describe("directiveTokens", () => {
  it("reads the source list of a directive", () => {
    expect(directiveTokens("script-src 'self' 'unsafe-inline'", "script-src")).toEqual([
      "self",
      "unsafe-inline",
    ]);
  });

  it("returns null for a directive the policy does not carry", () => {
    expect(directiveTokens("script-src 'self'", "connect-src")).toBeNull();
  });

  it("returns an empty list for a directive with no source list", () => {
    expect(directiveTokens("script-src", "script-src")).toEqual([]);
  });
});

describe("classifySource", () => {
  it("tells a keyword from a scheme source and from a host source", () => {
    expect(classifySource("'self'")).toBe("keyword");
    expect(classifySource("'nonce-abc'")).toBe("keyword");
    expect(classifySource("https:")).toBe("scheme");
    expect(classifySource("data:")).toBe("scheme");
    expect(classifySource("example.com")).toBe("host");
    expect(classifySource("*.example.com")).toBe("host");
  });
});

describe("hostSourceProblem", () => {
  it("accepts a host", () => {
    expect(hostSourceProblem("example.com")).toBeNull();
    expect(hostSourceProblem("https://api.hakawi.com")).toBeNull();
    expect(hostSourceProblem("http://localhost:3001")).toBeNull();
  });

  it("accepts a wildcard in the leftmost label", () => {
    expect(hostSourceProblem("*.example.com")).toBeNull();
    expect(hostSourceProblem("https://*.s3.us-east-1.amazonaws.com")).toBeNull();
  });

  it("refuses a wildcard in any other label", () => {
    // The expression this repository shipped. A CSP host source may carry a
    // wildcard in its LEFTMOST label and nowhere else.
    const problem = hostSourceProblem("https://*.s3.*.amazonaws.com");
    expect(problem).not.toBeNull();
    expect(problem).toContain("leftmost label");
  });

  it("refuses a label that is not a hostname label", () => {
    expect(hostSourceProblem("exa mple.com")).not.toBeNull();
    expect(hostSourceProblem("exa_mple.com")).not.toBeNull();
  });

  it("accepts a port and a path", () => {
    expect(hostSourceProblem("https://example.com:8443/api")).toBeNull();
  });

  it("refuses a port that is not a number", () => {
    expect(hostSourceProblem("https://example.com:port")).not.toBeNull();
  });

  it("accepts a wildcard port, which is how a source says any port", () => {
    expect(hostSourceProblem("https://example.com:*")).toBeNull();
  });

  it("accepts a fully qualified name with its trailing dot", () => {
    expect(hostSourceProblem("https://example.com.")).toBeNull();
  });

  it("accepts a label that begins with a dash, as the browser does", () => {
    // Chrome checks the CHARACTERS of a label and not its ends, and a parser
    // that is stricter than the browser fails builds for no reason.
    expect(hostSourceProblem("-example.com")).toBeNull();
  });

  it("refuses an IPv6 literal, which no browser can read", () => {
    expect(hostSourceProblem("https://[::1]")).not.toBeNull();
  });

  it("refuses a source whose scheme is not a scheme", () => {
    expect(hostSourceProblem("://example.com")).not.toBeNull();
    expect(hostSourceProblem("1http://example.com")).not.toBeNull();
  });

  it("does not read a keyword or a scheme source as a host", () => {
    expect(hostSourceProblem("'self'")).toBeNull();
    expect(hostSourceProblem("https:")).toBeNull();
    expect(hostSourceProblem("data:")).toBeNull();
  });
});

describe("directive names", () => {
  it("reads a directive name whatever its case", () => {
    // A browser does not distinguish `SCRIPT-SRC` from `script-src` — Chrome's
    // directive lookup is case-insensitive — so a check that read the name as written
    // would report a policy that allows `eval` as one that blocks it.
    expect(directiveName("SCRIPT-SRC 'unsafe-eval'")).toBe("script-src");
    expect(directiveName("Script-Src")).toBe("script-src");
  });

  it("finds a directive that was written in capitals", () => {
    expect(directiveTokens("SCRIPT-SRC 'unsafe-eval'", "script-src")).toEqual(["unsafe-eval"]);
  });

  it("reads a source list out of a directive that was written in capitals", () => {
    expect(unparseableSources("CONNECT-SRC 'self' https://*.s3.*.amazonaws.com")).toHaveLength(1);
  });
});

describe("unparseableSources", () => {
  it("finds nothing in a policy the browser can read", () => {
    const policy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' https://fonts.googleapis.com",
      "img-src 'self' data: https:",
      "connect-src 'self' http://localhost:3001 https://api.hakawi.com https://*.s3.us-east-1.amazonaws.com",
      "frame-src 'self' https://accept.paymob.com",
      "object-src 'none'",
    ].join("; ");

    expect(unparseableSources(policy)).toEqual([]);
  });

  it("names the directive and the source it cannot read", () => {
    const problems = unparseableSources("connect-src 'self' https://*.s3.*.amazonaws.com");

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("connect-src");
    expect(problems[0]).toContain("https://*.s3.*.amazonaws.com");
  });

  it("does not read a keyword as a host", () => {
    expect(unparseableSources("script-src 'self' 'unsafe-eval' 'nonce-abc'")).toEqual([]);
  });

  it("does not read a scheme source as a host", () => {
    expect(unparseableSources("img-src 'self' data: https: blob:")).toEqual([]);
  });

  it("leaves a directive that does not take a source list alone", () => {
    expect(unparseableSources("report-uri https://*.s3.*.amazonaws.com")).toEqual([]);
  });

  it("leaves the Trusted Types directives alone, which take policy names", () => {
    // `trusted-types my_policy` is a legal policy: the directive takes the NAME of a
    // policy, not a source. Reading the name as a hostname would fail the build over
    // a working policy.
    expect(unparseableSources("trusted-types my_policy")).toEqual([]);
    expect(unparseableSources("require-trusted-types-for 'script'")).toEqual([]);
  });
});
