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
            src/lib/preferences.ts for why this cannot be an effect. */}
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
