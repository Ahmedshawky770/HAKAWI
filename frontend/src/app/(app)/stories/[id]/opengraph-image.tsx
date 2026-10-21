import { ImageResponse } from "next/og";
import { headers } from "next/headers";

import { api } from "@/lib/api";
import { stringsFor } from "@/lib/i18n";
import { ogFonts } from "@/lib/og-font";
import { localeFromAcceptLanguage } from "@/lib/site-url";
import { directionFor } from "@/lib/preferences";

/**
 * The link preview of one story.
 *
 * WHY IT IS PER STORY. A story is shared on its own: a reader sends a link
 * to one story, and the card that lands in the chat is about THAT story. A
 * single product-wide image would make every shared link look like a link to
 * the platform, and a reader who has seen three of them has learned to ignore
 * them.
 *
 * The card carries the story's title, its author and its excerpt, on the
 * product's palette. The excerpt is trimmed to a length that fits: a card
 * that overflows is a card the reader cannot read.
 *
 * WHY IT IS RENDERED ON THE REQUEST. The Arabic face is fetched rather than
 * committed — see `lib/og-font.ts` — and a build that had to reach the network
 * for it would fail on a build machine without one.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The description of the preview, for the platforms that show one.
 *
 * The card is drawn per story, so the text of the card is the story's own
 * title — but the `alt` is a STATIC export, read before the story is known.
 * It therefore says what the card IS: the product's wordmark and the surface
 * the card belongs to.
 */
const shell = stringsFor("ar").shell;
export const alt = `${shell.brand} — ${shell.navStories}`;

export const dynamic = "force-dynamic";

export default async function StoryOpengraphImage({
  params,
}: {
  // `params` is a PROMISE in Next 15 and later. Reading `params.id` off the
  // promise yields `undefined`, the request below asked for
  // `GET /stories/undefined`, and every story was given the same generic
  // card — which is the one outcome this file exists to prevent.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  /**
   * THE CARD IS DRAWN IN THE READER'S LANGUAGE, NOT IN THE PRODUCT'S.
   *
   * The card used to be pinned to Arabic, so a reader who shared a story from
   * an English session got an Arabic preview for it — the product's language
   * on a card about a story that was not written in it. The card is rendered
   * on the request, and the request says which language the reader is in:
   * `Accept-Language` is the only server-side signal there is, because the
   * product's own locale is a client-side preference.
   *
   * The `alt` above is a STATIC export and cannot follow the request — it is
   * read before the story is known — so it names the product in the product's
   * own language, which is what it is for.
   */
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  const strings = stringsFor(locale);

  // The story and the fonts are independent, so they are awaited together: the
  // card's latency is the slower of the two, not their sum.
  //
  // The story request is BOUNDED. `api.getStory` takes the signal for exactly
  // this case — a link preview is fetched while a response is being held
  // open, and an unbounded fetch turns an API that is slow or down into a
  // preview that never appears.
  const [story, fonts] = await Promise.all([
    api.getStory(id, { signal: AbortSignal.timeout(3000) }).catch(() => null),
    ogFonts(),
  ]);

  const title = story?.title ?? strings.shell.brand;
  const author = story?.author?.name ?? "";
  const excerpt = (story?.excerpt ?? "").slice(0, 180);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#0D0B0A",
          color: "#EFEce6",
          direction: directionFor(locale),
        }}
      >
        <div style={{ display: "flex", fontSize: 32, color: "#FF9100" }}>{strings.shell.brand}</div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.25,
              display: "flex",
              maxHeight: 260,
              overflow: "hidden",
            }}
          >
            {title}
          </div>
          {excerpt ? (
            <div
              style={{
                marginTop: 20,
                fontSize: 30,
                color: "#A8A49E",
                lineHeight: 1.5,
                display: "flex",
                maxHeight: 130,
                overflow: "hidden",
              }}
            >
              {excerpt}
            </div>
          ) : null}
        </div>

        {author ? (
          <div style={{ display: "flex", fontSize: 30, color: "#85807A" }}>
            {strings.story.authorByline(author)}
          </div>
        ) : null}
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
