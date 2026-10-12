import type { Metadata, Viewport } from "next";

import "./globals.css";

import { designFonts } from "./fonts";
import { PREFERENCE_BOOTSTRAP_SCRIPT } from "@/lib/preferences";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "حكاوي",
  description: "منصة الحكاوي للكتابة والقراءة",
  applicationName: "حكاوي",
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
        <a href="#main-content" className="hk-skip-link">
          تخطَّ إلى المحتوى
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
