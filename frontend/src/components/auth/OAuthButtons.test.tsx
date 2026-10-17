/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";

import { OAUTH_PROVIDERS, type OAuthProvider } from "@hakawi/shared-types";

import { stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";
import { oauthStartUrl } from "@/lib/oauth";
import { renderWithProviders } from "@/test-utils/render";
import { OAuthButtons } from "@/components/auth/OAuthButtons";

const strings = stringsFor(DEFAULT_LOCALE);

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: strings.auth.oauthGoogle,
  facebook: strings.auth.oauthFacebook,
  github: strings.auth.oauthGithub,
  apple: strings.auth.oauthApple,
  tiktok: strings.auth.oauthTiktok,
};

describe("OAuthButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders one link per provider the shared contract declares", () => {
    // WHY THE LIST IS ITERATED: a control hand-written per provider is a control that can go
    // missing when a provider is added to the API. The component maps the same list the API
    // validates `:provider` against, so this asserts the whole surface at once.
    renderWithProviders(<OAuthButtons />);

    for (const provider of OAUTH_PROVIDERS) {
      expect(screen.getByRole("link", { name: PROVIDER_LABELS[provider] })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("link")).toHaveLength(OAUTH_PROVIDERS.length);
  });

  it("points every link at the provider's handshake route", () => {
    renderWithProviders(<OAuthButtons />);

    for (const provider of OAUTH_PROVIDERS) {
      const link = screen.getByRole("link", { name: PROVIDER_LABELS[provider] });
      expect(link).toHaveAttribute("href", oauthStartUrl(provider));
    }
  });

  it("keeps the provider's name as the control's entire accessible name", () => {
    renderWithProviders(<OAuthButtons />);

    const google = screen.getByRole("link", { name: PROVIDER_LABELS.google });
    expect(google.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(google).toHaveAccessibleName(PROVIDER_LABELS.google);
  });

  it("hides the divider word from assistive technology", () => {
    // Every control below the divider names its provider, so the word between the form and
    // the links is layout, not meaning — announcing a stray "أو" is noise.
    renderWithProviders(<OAuthButtons />);

    expect(screen.getByText("أو").parentElement).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps every control at the 44px touch minimum", () => {
    renderWithProviders(<OAuthButtons />);

    for (const provider of OAUTH_PROVIDERS) {
      expect(screen.getByRole("link", { name: PROVIDER_LABELS[provider] })).toHaveClass("min-h-11");
    }
  });
});
