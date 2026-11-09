import type { Metadata, Viewport } from "next";

import "./globals.css";

import { designFonts } from "./fonts";
import { SkipLink } from "@/components/layout/SkipLink";
import { TitleMirror } from "@/components/providers/TitleMirror";
import { stringsFor } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site-url";
import { Providers } from "./providers";

// The root metadata is static Arabic — a server `metadata` export cannot read
// the reader's stored locale — but it is READ FROM THE DICTIONARY so the app
// title and description exist in exactly one place. `TitleMirror` recognizes
// the chrome's own title by comparing the document against
// `shell.appTitle`/`shell.appDescription`; while these were hand-written
// literals beside the dictionary, editing either copy silently made the
// comparison stop matching and the mirror die with every suite still green.
//
// `metadataBase` is what every absolute URL in the metadata is resolved
// against. Without it Next falls back to `http://localhost:3000`, and every
// page of the product advertised its own link preview as a localhost address
// no crawler can fetch. The origin is the same constant the robots file and
// the sitemap use, so the product names one host everywhere.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: stringsFor("ar").shell.appTitle,
  description: stringsFor("ar").shell.appDescription,
  applicationName: stringsFor("ar").shell.brand,
  // THE ICON IS THE PRODUCT'S OWN LOGO, NOT A LETTER IN A TILE. The starter
  // shipped a `favicon.ico` carrying the Next.js mark, which is the wrong
  // brand in the one place a browser shows the product's face.
  //
  // THE BROWSER ICON IS THE FILE CONVENTION. `src/app/favicon.ico` is served at
  // `/favicon.ico` and injected by Next as the first icon, so a browser that
  // asks for `/favicon.ico` by name gets the brand instead of a 404 — and the
  // file is a real icon at 16, 32 and 48 pixels rather than a 512-pixel picture
  // a browser would download to draw sixteen of them.
  //
  // THE APPLE ICON IS ITS OWN FILE. iOS composites a transparent icon over
  // BLACK, and the emblem's violet frame is invisible on black, so the apple
  // icon is printed on the same paper as the other icons. The installable
  // app's own icons are in `manifest.ts`.
  icons: {
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#140A1F" },
    { media: "(prefers-color-scheme: light)", color: "#FDFBF7" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ar" dir="rtl" data-theme="dark" suppressHydrationWarning className={`${designFonts} h-full`}>
      <head>
        {/* Resolves the stored theme and locale before the first paint. See
            src/lib/preferences.ts for why this cannot be an effect.

            The bootstrap script now lives in an external file
            (/js/preference-bootstrap.js), loaded with a plain <script src>.
            Because it is same-origin, it needs no 'unsafe-inline' allowance
            in the CSP — only 'self'. Its only inputs are localStorage values
            validated against a closed allowlist ("dark"/"light", "ar"/"en"),
            so it can never emit attacker data.

            'unsafe-inline' remains in script-src only for Next.js App Router's
            own injected runtime scripts (hydration, RSC payload), which cannot
            be reached by a hash or nonce under the current static rendering
            model. A nonce would force every route to dynamic rendering and
            disable Partial Prerendering. 'unsafe-eval' has been removed
            entirely in all environments. */}
        <script src="/js/preference-bootstrap.js" defer />
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
