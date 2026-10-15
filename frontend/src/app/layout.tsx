import type { Metadata, Viewport } from "next";

import "./globals.css";

import { designFonts } from "./fonts";
import { SkipLink } from "@/components/layout/SkipLink";
import { TitleMirror } from "@/components/providers/TitleMirror";
import { stringsFor } from "@/lib/i18n";
import { PREFERENCE_BOOTSTRAP_SCRIPT } from "@/lib/preferences";
import { Providers } from "./providers";

// The root metadata is static Arabic — a server `metadata` export cannot read
// the reader's stored locale — but it is READ FROM THE DICTIONARY so the app
// title and description exist in exactly one place. `TitleMirror` recognizes
// the chrome's own title by comparing the document against
// `shell.appTitle`/`shell.appDescription`; while these were hand-written
// literals beside the dictionary, editing either copy silently made the
// comparison stop matching and the mirror die with every suite still green.
export const metadata: Metadata = {
  title: stringsFor("ar").shell.appTitle,
  description: stringsFor("ar").shell.appDescription,
  applicationName: stringsFor("ar").shell.brand,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0D0B0A" },
    { media: "(prefers-color-scheme: light)", color: "#FAF6EE" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" suppressHydrationWarning className={`${designFonts} h-full`}>
      <head>
        {/* Resolves the stored theme and locale before the first paint. See
            src/lib/preferences.ts for why this cannot be an effect.

            This is the one `dangerouslySetInnerHTML` sink that is NOT HTML-sanitized, on purpose:
            it renders a fixed JavaScript constant (`PREFERENCE_BOOTSTRAP_SCRIPT`) whose only inputs
            are localStorage values it validates against a closed allowlist ("dark"/"light",
            "ar"/"en") before writing anything to the DOM — it can never emit an attacker string, so
            there is nothing to sanitize. Running the markup sanitizer over it would strip the whole
            script and break theme resolution. This same inline script is what the CSP
            `script-src 'unsafe-inline'` allowance in next.config.ts exists to permit. */}
        <script dangerouslySetInnerHTML={{ __html: PREFERENCE_BOOTSTRAP_SCRIPT }} />
      </head>
      <body className="min-h-full bg-canvas text-ink antialiased">
        <Providers>
          {/* SkipLink consumes LocaleContext, so it must render inside <Providers> (which mounts
              LocaleProvider) rather than as a sibling of it. */}
          <SkipLink />
          {/* The title mirror lives here rather than in LocaleProvider: it subscribes to the
              route, and a hook that reaches the 23 mocked `next/navigation` suites that mount
              the provider does not belong in the provider itself. It renders nothing. */}
          <TitleMirror />
          {children}
        </Providers>
      </body>
    </html>
  );
}
