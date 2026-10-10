"use client";

import React from "react";

import { CardLink } from "@/components/ui/Card";
import { formatPrice } from "@/lib/money";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Book } from "@/types/api";

/**
 * The catalogue card of §6, sized for a grid inside the 672px middle column.
 *
 * ```
 * ┌──────────────────────────┐
 * │ [cover, 3:4]             │
 * │ Title                     │
 * │ Author                    │
 * │ price                     │
 * └──────────────────────────┘
 * ```
 *
 * Three decisions:
 *
 * - **The whole surface is one link target** (`CardLink`), so a reader on a phone
 *   does not have to aim at the title. It is a link, not a button — see
 *   `ButtonLink` for the reason that matters.
 * - **The cover keeps its box whether or not the book has one.** `aspect-[3/4]`
 *   with a token-coloured placeholder underneath means a grid of twelve books,
 *   two of which have no cover, does not reflow when the images arrive (and does
 *   not move at all when they do not).
 * - **The price is `hk-numeric`** — the amount stands alone on its own line, so
 *   the LTR isolate keeps the digits and the symbol in reading order. It is
 *   converted from piastres and named in `ج.م` by `formatPrice`, one function with
 *   one unit: the `$` these pages printed was the wrong currency, and the raw
 *   integer behind it was the wrong unit.
 */
export function BookCard({ book }: { book: Book }) {
  return (
    <CardLink href={`/books/${book.id}`} className="group h-full">
      <div className="flex h-full flex-col">
        <BookCover book={book} />

        <div className="flex flex-1 flex-col gap-1 p-5">
          <h3 className="line-clamp-2 text-lg font-semibold text-ink transition-colors duration-200 group-hover:text-accent-ink">
            {book.title}
          </h3>
          <p className="text-sm text-ink-muted">بواسطة {book.author}</p>

          {book.price != null && book.price > 0 && (
            <p className="hk-numeric mt-auto pt-3 text-base font-bold text-accent-ink">
              {formatBookPrice(book.price)}
            </p>
          )}
        </div>
      </div>
    </CardLink>
  );
}

/** The cover, or the box it would have occupied. */
function BookCover({ book }: { book: Book }) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-t-xl bg-surface-raised">
      {book.coverImage ? (
        <img
          src={book.coverImage}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-ink-faint">
          <Icon name="library" size="lg" />
        </span>
      )}
    </div>
  );
}

/**
 * The placeholder, at the height of the real card — including the cover, because
 * a skeleton without the cover block collapses the grid the moment it is replaced.
 */
export function BookCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <Skeleton className="aspect-[3/4] w-full" rounded="rounded-none" />
      <div className="space-y-2 p-5">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  );
}

/** A full grid of placeholders, so the column keeps its height while loading. */
export function BookGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <BookCardSkeleton key={index} />
      ))}
    </div>
  );
}

/**
 * `2500` piastres → `25.00 ج.م`.
 *
 * THE UNIT IS PIASTRES. `books.price` is an integer with no currency column, and
 * `books.service.ts` forwards it to the gateway untouched, which means it is
 * piastres (1 EGP = 100). The previous implementation printed the raw integer with
 * a currency symbol, so a book at 25 piastres was shown as 25 pounds — a hundred
 * times the price. `formatPrice` owns the conversion, and this is the only place
 * the frontend performs it.
 */
export function formatBookPrice(price: number | null | undefined): string {
  return formatPrice(price);
}
