import { ImageResponse } from "next/og";

import { ogFonts } from "@/lib/og-font";
import { stringsFor } from "@/lib/i18n";

/**
 * The product's own link preview.
 *
 * WHY IT IS AN IMAGE AND NOT A SENTENCE. A link preview is the only part of
 * the product most readers will ever see: a story is shared into a chat, and
 * what lands in the chat is a card. A card with no image is a line of text,
 * and a line of text is not what makes someone open a link.
 *
 * The card is the product's own palette — obsidian, amber, papyrus — so a
 * shared link looks like the thing it links to.
 *
 * WHY IT IS RENDERED ON THE REQUEST AND NOT AT THE BUILD. The Arabic face the
 * card is drawn with is fetched rather than committed (see `lib/og-font.ts`),
 * and a build that had to reach the network for it would fail on a build
 * machine without one. The route is therefore dynamic, and the font is cached
 * per process.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
 * THE PRODUCT'S OWN CARD IS IN THE PRODUCT'S OWN LANGUAGE.
 *
 * This card is the product's wordmark and nothing else — it is not a story, it
 * is not a page, and it is not a sentence a reader wrote — so there is nothing
 * in it to translate. The stories' own previews ARE drawn in the reader's
 * language; see `app/(app)/stories/[id]/opengraph-image.tsx`.
 */
export const alt = stringsFor("ar").shell.appTitle;

export const dynamic = "force-dynamic";

export default async function OpengraphImage() {
  const { shell } = stringsFor("ar");
  // `undefined` — never `[]` — when the Arabic face could not be had: an empty
  // array is truthy, so it would suppress the Latin face `next/og` bundles
  // and make Satori throw instead of drawing the card. See `lib/og-font.ts`.
  const fonts = await ogFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0D0B0A",
          color: "#EFEce6",
          fontSize: 72,
          fontWeight: 700,
        }}
      >
        <div style={{ color: "#FF9100" }}>{shell.brand}</div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 400,
            color: "#A8A49E",
            marginTop: 20,
            textAlign: "center",
            direction: "rtl",
          }}
        >
          {shell.appDescription}
        </div>
      </div>
    ),
    {
      ...size,
      // Passed through as it is: `undefined` here is what lets `next/og` fall
      // back to its own face. Coercing it to `[]` would break the preview.
      fonts,
    },
  );
}
