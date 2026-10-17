"use client";

import React from "react";

import { OAUTH_PROVIDERS, type OAuthProvider } from "@hakawi/shared-types";

import type { AuthStrings } from "@/lib/i18n";
import { oauthStartUrl } from "@/lib/oauth";
import { useStrings } from "@/components/providers/LocaleProvider";
import { ButtonLink } from "@/components/ui/Button";
import { AppleGlyph, FacebookGlyph, GithubGlyph, GoogleGlyph, TiktokGlyph } from "./ProviderGlyphs";

/**
 * The dictionary key that names each provider's control.
 *
 * A record rather than building the key from the provider id: the key set is checked against the
 * provider list at compile time, so a provider added to the shared contract without copy for it
 * fails the typecheck here instead of shipping a control with no accessible name.
 */
const PROVIDER_LABEL: Record<OAuthProvider, keyof AuthStrings> = {
  google: "oauthGoogle",
  facebook: "oauthFacebook",
  github: "oauthGithub",
  apple: "oauthApple",
  tiktok: "oauthTiktok",
};

const PROVIDER_GLYPH: Record<OAuthProvider, () => React.ReactElement> = {
  google: GoogleGlyph,
  facebook: FacebookGlyph,
  github: GithubGlyph,
  apple: AppleGlyph,
  tiktok: TiktokGlyph,
};

/**
 * One "continue with …" control per provider the backend supports.
 *
 * WHY THE LIST IS ITERATED RATHER THAN SPELLED OUT. `OAUTH_PROVIDERS` is the same list the API
 * validates `:provider` against, so a provider configured on the backend appears here with no
 * edit to this file, and a provider removed there disappears instead of 404ing. The buttons are
 * rendered in that list's order.
 *
 * WHY THEY SIT UNDER THE PASSWORD FORM. The form is the primary way in; the providers are the
 * alternative, and a reader who arrived to type a password should not have to scroll past five
 * brand buttons to reach the fields. The divider word above them is decorative — every control
 * below it already names its provider, so it is hidden from assistive technology rather than
 * announced as a stray "أو".
 *
 * WHY ANCHORS INSTEAD OF BUTTONS. Each control's destination is a plain `GET` to the API's own
 * handshake route — navigation, not a form action — so an anchor performs it unaided even when
 * JavaScript is off. The rest of the sign-in flow (the password form, `/auth/callback`, the
 * session guard) remains client-side, so this is progressive enhancement, not a regression.
 * Every glyph is `aria-hidden` inside it: the name of the control is the provider's name,
 * nothing more, so a screen reader announces one label per control.
 */
export function OAuthButtons() {
  const strings = useStrings();

  return (
    <div className="mt-6 space-y-3">
      <div aria-hidden="true" className="flex items-center gap-3">
        <span className="h-px flex-1 bg-line-strong" />
        <span className="text-xs font-medium text-ink-muted">{strings.auth.oauthDivider}</span>
        <span className="h-px flex-1 bg-line-strong" />
      </div>

      {OAUTH_PROVIDERS.map((provider) => {
        const Glyph = PROVIDER_GLYPH[provider];

        return (
          <ButtonLink
            key={provider}
            href={oauthStartUrl(provider)}
            variant="secondary"
            block
            data-provider={provider}
          >
            <span className="flex size-5 shrink-0 items-center justify-center" aria-hidden="true">
              <Glyph />
            </span>
            {strings.auth[PROVIDER_LABEL[provider]]}
          </ButtonLink>
        );
      })}
    </div>
  );
}
