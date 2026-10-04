"use client";

import React from "react";

import { formatBookPrice } from "@/components/books/BookCard";
import { LibraryStatusBadge } from "./LibraryStatusBadge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Book, LibraryItem } from "@/types/api";

/** A library row plus the book it points at, when that book could be fetched. */
export type LibraryEntry = LibraryItem & { book?: Book };

/**
 * One shelf entry: cover, what the book is, where the reader is with it, and the two actions.
 *
 * Two decisions:
 *
 * - **The title is not a link and the card is not a link.** The "عرض التفاصيل" action is a
 *   `ButtonLink` and "إزالة" is a real `Button`; the old version wrapped the whole card in a `<Link>`
 *   and then put a second link to the same place in its footer, which is two nested targets for one
 *   destination and a `<button>` inside an `<a>`.
 * - **The remove control is `variant="danger"`.** It is destructive and it is irreversible from this
 *   screen, so it must not look like the read action beside it.
 */
export function LibraryCard({
  item,
  removing = false,
  onRemove,
}: {
  item: LibraryEntry;
  removing?: boolean;
  onRemove: () => void;
}) {
  const book = item.book;

  return (
    <Card className="flex h-full flex-col">
      <CardBody className="flex-1">
        <div className="flex gap-4">
          {book?.coverImage ? (
            <img
              src={book.coverImage}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-28 w-20 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="grid h-28 w-20 shrink-0 place-items-center rounded-md bg-surface-raised text-ink-faint">
              <Icon name="book" size="md" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-semibold text-ink">{book?.title ?? "كتاب"}</h3>
            <p className="mt-1 text-sm text-ink-muted">{book?.author ?? ""}</p>

            {book?.price != null && book.price > 0 && (
              <p className="hk-numeric mt-1 text-sm font-semibold text-ink">{formatBookPrice(book.price)}</p>
            )}

            <div className="mt-2">
              <LibraryStatusBadge status={item.status} />
            </div>
          </div>
        </div>
      </CardBody>

      <CardFooter>
        <ButtonLink href={`/library/${item.id}`} size="sm" className="flex-1">
          عرض التفاصيل
        </ButtonLink>
        <Button variant="danger" size="sm" loading={removing} onClick={onRemove}>
          إزالة
        </Button>
      </CardFooter>
    </Card>
  );
}

/** The placeholder, at the height of the real card — cover block included. */
export function LibraryCardSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex gap-4 p-6">
        <Skeleton className="h-28 w-20 shrink-0" rounded="rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-5 w-20" rounded="rounded-full" />
        </div>
      </div>
      <div className="flex gap-3 border-t border-line px-6 py-4">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-24" />
      </div>
    </div>
  );
}

/** A shelf of placeholders, so the grid keeps its height while loading. */
export function LibraryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <LibraryCardSkeleton key={index} />
      ))}
    </div>
  );
}
