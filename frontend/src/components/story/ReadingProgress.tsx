"use client";

import React, { useEffect, useMemo, useState } from "react";

import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * How far through the story the reader is, and how much longer it will take.
 *
 * WHY THIS IS HERE. The library has had a progress bar for a long time
 * (`ReadingProgressCard`), but only for a BOOK the reader already owns — a
 * figure the server knows, stored against a reading-progress row. A STORY is
 * read in one sitting in the browser and never written down, so the story
 * reader had no progress at all: the longest content in the product, the
 * surface an Arabic reader spends an hour on, was the one surface that could
 * not say how much of it was left. The two are different facts and this one is
 * computed on the spot.
 *
 * THE PROGRESS IS THE SCROLL, and the scroll is the only honest measure of
 * "read". A page-count estimate would need the reading speed of the reader,
 * which is exactly what the time estimate cannot know either — so the
 * percentage is what the page has actually shown, and the time is derived from
 * it.
 *
 * THE READING RATE IS 180 WORDS A MINUTE, and that number is an assumption
 * stated in one place. Arabic prose in a serif face reads slower than English
 * — a long word is longer, and the eye returns to the right of the line more
 * often — and 180 is the conservative end of what is measured for literary
 * Arabic. The estimate is labelled as an estimate: it is a reason to keep
 * reading, never a promise about when the reader will be done.
 */
const WORDS_PER_MINUTE = 180;

/**
 * The entities a body of HTML can carry, and what they MEAN.
 *
 * `&nbsp;` is a space, not a word: without the table, the non-breaking space
 * between two words glues them into one and the estimate comes out short.
 */
const HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/**
 * The number of words in a body of HTML.
 *
 * WHAT IS STRIPPED, IN THIS ORDER. The body is author-supplied HTML, and a
 * body is allowed to carry a `<style>` or a `<script>` block: the text inside
 * one of those blocks is not prose, and counting it made the estimate run
 * long — a story with a stylesheet at the top read as several hundred words
 * longer than it is. So the blocks go FIRST, and the tags go after: a tag
 * strip that runs first would cut a `<script>` open and leave its body behind
 * as text.
 *
 * The entities are decoded before the count, and in ONE pass, so that the
 * "&" of a literal "&amp;lt;" is not decoded twice into something the author
 * never wrote.
 */
function countWords(html: string): number {
  const withoutCode = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutCode.replace(/<[^>]*>/g, " ");
  const text = withoutTags.replace(
    /&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g,
    (entity) => HTML_ENTITIES[entity] ?? entity,
  );
  const words = text.split(/\s+/).filter((word) => word.length > 0);
  return words.length;
}

export function ReadingProgress({ content, targetId }: { content: string; targetId: string }) {
  const strings = useStrings();
  const [progress, setProgress] = useState(0);

  const words = useMemo(() => countWords(content), [content]);
  const totalMinutes = Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const element = document.getElementById(targetId);
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const viewport = window.innerHeight;
      // How much of the body has been passed. The top of the element reaching
      // the bottom of the viewport is 0; its bottom reaching the bottom of the
      // viewport is 1.
      const passed = viewport - rect.top;
      const total = element.offsetHeight;
      const ratio = total > 0 ? passed / total : 0;
      setProgress(Math.max(0, Math.min(1, ratio)));
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [targetId]);

  const percent = Math.round(progress * 100);
  const remainingMinutes = Math.ceil((1 - progress) * totalMinutes);
  const isFinished = progress >= 0.99;

  return (
    <div className="space-y-2">
      {/* The bar rides under the sticky header, so it is visible for the whole
          reading session without taking a line of the page from the text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-14 z-30 h-0.5 bg-transparent"
      >
        <div
          className="h-full bg-accent-fill transition-[width] duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
        <span className="hk-numeric">{strings.story.readingProgress(percent)}</span>
        <span aria-hidden="true" className="text-line-strong">·</span>
        <span>
          {isFinished
            ? strings.story.readingFinished
            : strings.story.readingTimeRemaining(remainingMinutes)}
        </span>
        <span className="sr-only">{strings.story.readingProgressLabel}</span>
      </div>
    </div>
  );
}
