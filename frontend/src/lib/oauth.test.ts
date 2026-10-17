import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import { OAUTH_PROVIDERS } from "@hakawi/shared-types";

import { API_URL } from "@/lib/api";
import { oauthStartUrl, startOAuth } from "@/lib/oauth";

describe("oauthStartUrl", () => {
  it("points every provider at the backend handshake route", () => {
    expect(oauthStartUrl("google")).toBe("http://localhost:3001/api/v1/auth/oauth/google");
    expect(oauthStartUrl("facebook")).toBe("http://localhost:3001/api/v1/auth/oauth/facebook");
    expect(oauthStartUrl("github")).toBe("http://localhost:3001/api/v1/auth/oauth/github");
    expect(oauthStartUrl("apple")).toBe("http://localhost:3001/api/v1/auth/oauth/apple");
    expect(oauthStartUrl("tiktok")).toBe("http://localhost:3001/api/v1/auth/oauth/tiktok");
  });

  it("covers every provider the shared contract declares, on the API's own origin", () => {
    // WHY THE WHOLE LIST: a button per provider is rendered from `OAUTH_PROVIDERS`, so a URL
    // built for anything less than the full list is a control that navigates nowhere.
    for (const provider of OAUTH_PROVIDERS) {
      expect(oauthStartUrl(provider)).toBe(`${API_URL}/auth/oauth/${provider}`);
    }
  });

  it("keeps the API origin from the environment when one is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.hakawi.com/api/v1");
    // The module reads the environment once, when it is first evaluated, so the configured
    // origin has to be in place before the module registry is reloaded.
    vi.resetModules();
    const configured = await import("@/lib/oauth");

    expect(configured.oauthStartUrl("google")).toBe("https://api.hakawi.com/api/v1/auth/oauth/google");

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe("startOAuth", () => {
  const originalLocation = window.location;
  const assign = vi.fn();

  beforeAll(() => {
    // jsdom marks the methods of `Location` non-configurable, so `vi.spyOn(window.location,
    // "assign")` is refused with "Cannot redefine property". The `location` property itself is
    // configurable, so the whole object is replaced for this file and restored after it — the
    // only member the code under test touches is `assign`, and the test environment is
    // per-file, but a replaced global is still a global.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign },
    });
  });

  afterAll(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("navigates the browser to the provider's handshake", () => {
    startOAuth("google");

    expect(assign).toHaveBeenCalledWith("http://localhost:3001/api/v1/auth/oauth/google");
  });

  it("refuses a provider the shared contract does not declare", () => {
    // The value reaches this function from a control id, so it is input: a host-shaped string
    // must not be forwarded to a handshake route.
    startOAuth("google.evil.com");

    expect(assign).not.toHaveBeenCalled();
  });
});
