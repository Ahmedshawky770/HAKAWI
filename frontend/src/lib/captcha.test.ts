import { describe, expect, it } from "vitest";

import { isCaptchaProvider } from "@/lib/captcha";
import type { CaptchaProvider } from "@/lib/captcha";

describe("isCaptchaProvider", () => {
  it("accepts all three providers", () => {
    for (const provider of ["turnstile", "hcaptcha", "recaptcha"] as CaptchaProvider[]) {
      expect(isCaptchaProvider(provider)).toBe(true);
    }
  });

  it("rejects unknown providers", () => {
    expect(isCaptchaProvider("hcaptchax")).toBe(false);
    expect(isCaptchaProvider("")).toBe(false);
    expect(isCaptchaProvider(null)).toBe(false);
    expect(isCaptchaProvider(undefined)).toBe(false);
    expect(isCaptchaProvider(42)).toBe(false);
  });
});
