import React from "react";

import type { ReactionType } from "@hakawi/shared-types";

/**
 * The reaction glyphs, from the product's own art.
 *
 * WHY NOT EMOJI. The reactions used to be typed as `❤ 💛 ✨ 💧 🔥 👻`. Emoji are
 * drawn by the OPERATING SYSTEM, not by the product: the same six characters
 * are a red heart on Android, a yellow one on iOS and a monochrome outline on
 * Windows, so the reaction row looks like a different product on every device
 * — and a product whose identity is amber-on-obsidian cannot afford a row of
 * red and yellow hearts that the vendor chose. The designed assets already
 * existed in `public/Reactions/` and were never used by a single line of the
 * source; these are they.
 *
 * THE MAPPING. The API's vocabulary is `REACTION_TYPES` — `like`, `love`, `wow`,
 * `sad`, `angry`, `haunted` — and the art is a set of faces and two hearts.
 * Each type therefore names the asset that carries its meaning:
 *
 * | type     | asset            | why                                        |
 * |----------|------------------|--------------------------------------------|
 * | `like`   | `default.svg`    | the red heart                              |
 * | `love`   | `Love.svg`       | the second heart                           |
 * | `wow`    | `Brilliant.svg`  | the light bulb                             |
 * | `sad`    | `Sad.svg`        | the downcast face                          |
 * | `angry`  | `Excited.svg`    | the flushed face                            |
 * | `haunted`| `Scared.svg`     | the frightened face                         |
 *
 * `Funny.svg` is deliberately NOT mapped: the API's vocabulary has no
 * "funny" reaction, and offering a seventh button the server would answer
 * with a 400 is worse than leaving a designed asset unused. Adding a reaction
 * to the product means adding it to `REACTION_TYPES` FIRST and the art second.
 *
 * The glyph is decorative: the button that holds it carries the reaction's
 * name and its count in its accessible name, so the image is `alt=""` and the
 * screen reader hears the reaction, not "image".
 */
const ASSETS: Record<ReactionType, string> = {
  like: "/Reactions/default.svg",
  love: "/Reactions/Love.svg",
  wow: "/Reactions/Brilliant.svg",
  sad: "/Reactions/Sad.svg",
  angry: "/Reactions/Excited.svg",
  haunted: "/Reactions/Scared.svg",
};

export function ReactionGlyph({ type, size = 20 }: { type: ReactionType; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a static asset in /public, sized by attribute
    <img
      src={ASSETS[type]}
      alt=""
      width={size}
      height={size}
      className="inline-block shrink-0 select-none"
      draggable={false}
    />
  );
}
