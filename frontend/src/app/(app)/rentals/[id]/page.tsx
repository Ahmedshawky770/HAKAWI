"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import {
  isFailedLoad,
  useBook,
  useInvalidation,
  useReadingProgress,
  useRental,
  useRentalExtensionQuote,
} from "@/lib/queries";
import { ReadingProgressCard } from "@/components/library/ReadingProgressCard";
import { extensionDurationOptions } from "@/components/rental/RentalRow";
import { RentalStatusBadge } from "@/components/rental/RentalStatusBadge";
import { useToast } from "@/components/providers/ToastProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { formatDate } from "@/lib/i18n";
import { formatPrice } from "@/lib/money";

/**
 * One rental in full: the book, the dates, the progress the reader has made in it, and the actions
 * that are still open.
 *
 * The book and the progress degrade to nothing rather than failing the page — a rental whose book
 * record has gone is still a rental, and still returnable. The actions card appears only while the
 * rental is active, because returning a returned book is not an action.
 *
 * THE PRICE OF AN EXTENSION IS QUOTED BEFORE IT IS CHOSEN. `useRentalExtensionQuote` runs the same
 * checks the endpoint does, so the reader sees what the extension costs — and that it is allowed at
 * all — before the button that spends money. The amount is read through `formatPrice`, the one
 * division by a hundred in the product; the length itself is already on screen, in the select.
 */
export default function RentalDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { notify } = useToast();
  const { intl, strings } = useLocale();
  const { rentals: copy } = strings;
  const invalidation = useInvalidation();

  const rentalQuery = useRental(id);
  const rental = rentalQuery.data ?? null;
  // The book id is only known once the rental has answered, and the queries
  // stay disabled until then — a disabled query fetches nothing.
  const bookId = rental?.bookId ?? "";
  const bookQuery = useBook(bookId);
  const progressQuery = useReadingProgress(bookId);
  const book = bookQuery.data ?? null;
  const progress = progressQuery.data?.progress[0] ?? null;

  const [extendDays, setExtendDays] = useState<number | "">("");
  const quote = useRentalExtensionQuote(id, typeof extendDays === "number" ? extendDays : null);

  const returnMutation = useMutation({
    mutationFn: (rentalId: string) => api.returnRental(rentalId),
    onSuccess: async (updated) => {
      await invalidation.rentals(updated.id);
    },
    onError: (error) => {
      notify(strings.errors[classifyError(error)], "error");
    },
  });

  const extendMutation = useMutation({
    mutationFn: ({ rentalId, days }: { rentalId: string; days: number }) =>
      api.extendRental(rentalId, days),
    onSuccess: async (updated) => {
      setExtendDays("");
      await invalidation.rentals(updated.id);
    },
    onError: (error) => {
      notify(strings.errors[classifyError(error)], "error");
    },
  });

  if (rentalQuery.isLoading || bookQuery.isLoading) return <Loading />;

  if (isFailedLoad(rentalQuery)) {
    return (
      <div className="space-y-4">
        <ErrorMessage
          error={strings.errors[classifyError(rentalQuery.error)]}
          title={copy.loadFailedTitle}
          onRetry={() => void rentalQuery.refetch()}
        />
        <ButtonLink href="/rentals" variant="ghost" size="sm">
          <Icon name="chevron" size="sm" />
          {copy.backToRentals}
        </ButtonLink>
      </div>
    );
  }

  if (!rental) {
    return (
      <EmptyState
        icon="clock"
        title={copy.notFoundTitle}
        description={copy.notFoundDescription}
        action={<ButtonLink href="/rentals">{copy.backToRentals}</ButtonLink>}
      />
    );
  }

  const isActive = rental.status === "active";
  const canExtend = isActive && rental.extendedCount < rental.maxExtensions;

  return (
    <div className="space-y-6">
      <PageHeader
        title={book?.title || copy.detailTitle}
        description={book?.title ? copy.detailTitle : undefined}
        action={
          <>
            <RentalStatusBadge status={rental.status} endDate={rental.endDate} />
            <ButtonLink href="/rentals" variant="ghost" size="sm">
              <Icon name="chevron" size="sm" />
              {copy.backToRentals}
            </ButtonLink>
          </>
        }
      />

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-ink">{copy.detailsHeading}</h2>
        </CardHeader>

        <CardBody>
          <div className="flex flex-col gap-6 sm:flex-row">
            {book?.coverImage ? (
              <RemoteImage
                src={book.coverImage}
                alt={book.title}
                className="h-56 w-40 shrink-0 self-start rounded-lg object-cover"
              />
            ) : (
              <div className="grid h-56 w-40 shrink-0 place-items-center self-start rounded-lg bg-surface-raised text-ink-faint">
                <Icon name="book" size="lg" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-4">
              <p className="text-base text-ink-muted">
                {book?.author ? copy.authorByline(book.author) : copy.unknownBookTitle}
              </p>

              <dl className="grid gap-2 text-sm text-ink-muted sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Icon name="calendar" size="sm" />
                  <dt>{copy.startDateLabel}</dt>
                  <dd className="hk-numeric">{formatDate(rental.startDate, intl)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="clock" size="sm" />
                  <dt>{copy.endDateLabel}</dt>
                  <dd className="hk-numeric">{formatDate(rental.endDate, intl)}</dd>
                </div>
                <div className="flex items-center gap-2">
                  <Icon name="plus" size="sm" />
                  <dt>{copy.extensionsLabel}</dt>
                  <dd className="hk-numeric">
                    {rental.extendedCount} / {rental.maxExtensions}
                  </dd>
                </div>
                {rental.returnedAt && (
                  <div className="flex items-center gap-2">
                    <Icon name="check" size="sm" />
                    <dt>{copy.returnedAtLabel}</dt>
                    <dd className="hk-numeric">{formatDate(rental.returnedAt, intl)}</dd>
                  </div>
                )}
              </dl>

              {book?.description && (
                <p className="whitespace-pre-line leading-8 text-ink-muted">{book.description}</p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {progress && (
        <ReadingProgressCard
          progress={progress}
          action={
            <ButtonLink href="/library" size="sm">
              {copy.updateFromLibrary}
            </ButtonLink>
          }
        />
      )}

      {isActive && (
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-ink">{copy.actionsHeading}</h2>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              {canExtend && (
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                  <Select
                    aria-label={copy.extensionDurationLabel}
                    value={extendDays === "" ? "" : String(extendDays)}
                    onChange={(event) => setExtendDays(event.target.value ? Number(event.target.value) : "")}
                    options={extensionDurationOptions(copy)}
                    className="min-h-11 text-sm"
                    wrapperClassName="sm:w-44"
                  />
                  <Button
                    disabled={!extendDays}
                    loading={extendMutation.isPending}
                    onClick={() => {
                      if (!extendDays) return;
                      extendMutation.mutate({ rentalId: rental.id, days: extendDays });
                    }}
                  >
                    {copy.extendRentalAction}
                  </Button>
                </div>
              )}
              <Button
                variant="danger"
                loading={returnMutation.isPending}
                onClick={() => returnMutation.mutate(rental.id)}
                className={canExtend ? "" : "sm:flex-1"}
              >
                {copy.returnBookAction}
              </Button>
            </div>

            {quote.data && (
              <p className="mt-3 text-sm text-ink-muted">
                {copy.extensionPriceLabel}:{" "}
                <span className="hk-numeric font-medium text-ink">
                  {formatPrice(quote.data.amount, quote.data.currency)}
                </span>
              </p>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
