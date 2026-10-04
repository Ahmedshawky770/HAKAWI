"use client";

import React from "react";
import Link from "next/link";
import { RENTAL_DURATION_DAYS } from "@hakawi/shared-types";

import { RentalStatusBadge } from "./RentalStatusBadge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Book, Rental } from "@/types/api";

/** A rental plus the book it points at, when that book could be fetched. */
export type RentalWithBook = Rental & { book?: Book };

/** Arabic labels for the offered extensions. Presentation only. */
const EXTENSION_LABELS_AR: Record<number, string> = {
  7: "أسبوع واحد",
  14: "أسبوعان",
  30: "شهر واحد",
};

/**
 * The lengths a reader may extend by.
 *
 * The DAYS come from `RENTAL_DURATION_DAYS`, the same list `RentalsService.extendRental` validates
 * against, and this page offers the three of them that make sense as an extension of a rental someone
 * already holds. Declaring the numbers here instead would be a second source of truth for a contract
 * the API enforces with a 400.
 */
export const EXTENSION_DURATION_OPTIONS = [
  { value: "", label: "مدة التمديد" },
  ...RENTAL_DURATION_DAYS.filter((days) => days in EXTENSION_LABELS_AR).map((days) => ({
    value: String(days),
    label: EXTENSION_LABELS_AR[days],
  })),
];

/**
 * One rental: what it is, when it runs, how many extensions it has left, and what the reader can do
 * about it.
 *
 * Three decisions:
 *
 * - **The dates and the extension counter are `hk-numeric`.** They are figures inside an RTL sentence,
 *   and an Arabic-Indic or LTR-reordered run of digits around a slash is unreadable; isolating them
 *   keeps "٣‏/١٢‏/٢٠٢٦" in reading order.
 * - **The extend control is hidden, not disabled, once the guard closes.** `canExtend` is
 *   `extendedCount < maxExtensions` on an active rental, and a greyed-out control next to a form the
 *   reader cannot submit is a question they have to ask.
 * - **The "تمديد" button is `disabled` until a length is chosen**, so pressing it cannot send
 *   `extensionDays: 0` — the guard the API enforces anyway, but the reader should not have to
 *   discover it by failing.
 */
export function RentalRow({
  rental,
  extendDays,
  extending = false,
  returning = false,
  onExtendDaysChange,
  onExtend,
  onReturn,
}: {
  rental: RentalWithBook;
  extendDays: number | "";
  extending?: boolean;
  returning?: boolean;
  onExtendDaysChange: (days: number | "") => void;
  onExtend: () => void;
  onReturn: () => void;
}) {
  const book = rental.book;
  const isActive = rental.status === "active";
  const canExtend = isActive && rental.extendedCount < rental.maxExtensions;

  return (
    <Card className="flex h-full flex-col">
      <CardBody className="flex-1">
        <div className="flex flex-col gap-4 sm:flex-row">
          {book?.coverImage ? (
            <Link href={`/books/${book.id}`} className="shrink-0 self-start rounded-md focus-visible:outline-2">
              <img
                src={book.coverImage}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-36 w-24 rounded-md object-cover"
              />
            </Link>
          ) : (
            <div className="grid h-36 w-24 shrink-0 place-items-center rounded-md bg-surface-raised text-ink-faint">
              <Icon name="book" size="md" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-ink">
                  <Link href={`/books/${rental.bookId}`} className="transition-colors hover:text-accent-ink">
                    {book?.title || "كتاب"}
                  </Link>
                </h3>
                <p className="mt-1 text-sm text-ink-muted">{book?.author || ""}</p>
              </div>
              <RentalStatusBadge status={rental.status} />
            </div>

            <dl className="grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Icon name="calendar" size="sm" />
                <dt className="sr-only">تاريخ البدء</dt>
                <span>تاريخ البدء:</span>
                <dd className="hk-numeric">{new Date(rental.startDate).toLocaleDateString("ar-EG")}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="clock" size="sm" />
                <dt className="sr-only">تاريخ الانتهاء</dt>
                <span>تاريخ الانتهاء:</span>
                <dd className="hk-numeric">{new Date(rental.endDate).toLocaleDateString("ar-EG")}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Icon name="plus" size="sm" />
                <dt className="sr-only">التمديدات</dt>
                <span>التمديدات:</span>
                <dd className="hk-numeric">
                  {rental.extendedCount} / {rental.maxExtensions}
                </dd>
              </div>
              {rental.returnedAt && (
                <div className="flex items-center gap-2">
                  <Icon name="check" size="sm" />
                  <dt className="sr-only">تاريخ الإرجاع</dt>
                  <span>تاريخ الإرجاع:</span>
                  <dd className="hk-numeric">{new Date(rental.returnedAt).toLocaleDateString("ar-EG")}</dd>
                </div>
              )}
            </dl>

            {isActive && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                {canExtend && (
                  <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                    <Select
                      aria-label="مدة التمديد"
                      value={extendDays === "" ? "" : String(extendDays)}
                      onChange={(event) =>
                        onExtendDaysChange(event.target.value ? Number(event.target.value) : "")
                      }
                      options={EXTENSION_DURATION_OPTIONS}
                      className="text-sm"
                      wrapperClassName="sm:w-44"
                    />
                    <Button size="sm" disabled={!extendDays || extending} loading={extending} onClick={onExtend}>
                      تمديد
                    </Button>
                  </div>
                )}
                <Button
                  variant="danger"
                  size="sm"
                  loading={returning}
                  onClick={onReturn}
                  className={canExtend ? "" : "sm:flex-1"}
                >
                  إرجاع
                </Button>
              </div>
            )}
          </div>
        </div>
      </CardBody>

      <CardFooter>
        <ButtonLink href={`/rentals/${rental.id}`} size="sm">
          عرض التفاصيل
        </ButtonLink>
      </CardFooter>
    </Card>
  );
}

/** The placeholder, at the height of the real row — cover block and actions included. */
export function RentalRowSkeleton() {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex gap-4 p-6">
        <Skeleton className="h-36 w-24 shrink-0" rounded="rounded-md" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
      <div className="border-t border-line px-6 py-4">
        <Skeleton className="h-9 w-32" />
      </div>
    </div>
  );
}

/** A stack of placeholders, so the list keeps its height while loading. */
export function RentalListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <RentalRowSkeleton key={index} />
      ))}
    </div>
  );
}
