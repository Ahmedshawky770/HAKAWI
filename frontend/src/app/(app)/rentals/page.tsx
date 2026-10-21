"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { bookKeys, isFailedLoad, rentalKeys, useInvalidation, useRentals } from "@/lib/queries";
import { RentalListSkeleton, RentalRow, type RentalWithBook } from "@/components/rental/RentalRow";
import { useToast } from "@/components/providers/ToastProvider";
import { useStrings } from "@/components/providers/LocaleProvider";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import type { Rental, RentalsListResponse } from "@/types/api";

/**
 * The one page of rentals, and the one page of it: the same window of the API's
 * history, so the list and the detail page cannot be looking at different data.
 */
const RENTAL_LIST_PARAMS = { page: 1, limit: 50 };

/**
 * Every rental the reader holds.
 *
 * The list is ONE cache entry (`useRentals`), and the book behind each row is
 * fetched through `useQueries` — one request per distinct book, in a single
 * call, instead of a hand-written fan-out that issued a request per row and
 * could not be shared with any other surface. A book that fails to load
 * degrades to no book: one broken cover must not take the whole list down.
 *
 * Two stateful actions per row, and both write the server's answer back into the
 * row rather than a guess: a return writes the rental the endpoint returned, and
 * an extension replaces the row with the rental the endpoint returned. The list
 * is invalidated afterwards, so the server's answer — not the client's — is what
 * the screen shows. A failure leaves the row exactly as it was and says why in a
 * toast — a silent revert of a return is indistinguishable from a bug.
 */
export default function RentalsPage() {
  const { notify } = useToast();
  const strings = useStrings();
  const { rentals: copy } = strings;
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();

  const list = useRentals(RENTAL_LIST_PARAMS);
  // A failed BACKGROUND refetch keeps the list on the screen; only a load that
  // never arrived is a failed list.
  const failed = isFailedLoad(list);
  const rentals = useMemo(() => list.data?.rentals ?? [], [list.data]);

  /*
   * ONE `useQueries` FOR THE WHOLE LIST. The books are fetched in parallel by
   * the cache rather than by a loop of promises, and each one is keyed by the
   * shared `bookKeys.detail`, so a book already loaded elsewhere is not fetched
   * twice.
   *
   * THE LIST OF QUERIES IS MEMOISED. `useQueries` re-configures every row's
   * observer when the array it is given is a new object, and the array was
   * rebuilt on every render — and this page re-renders on every keystroke in a
   * row's extension field. The identity of the array now changes only when the
   * list does.
   *
   * The remaining cost is the API's shape, not the client's: the list endpoint
   * answers with a `bookId` per row and no book, so a cold visit costs one
   * request per rental. Collapsing that is a change to the list endpoint's
   * contract, not to this page.
   */
  const bookQueries = useQueries({
    queries: useMemo(
      () =>
        rentals.map((rental) => ({
          queryKey: bookKeys.detail(rental.bookId),
          queryFn: () => api.getBook(rental.bookId),
        })),
      [rentals],
    ),
  });

  const rows: RentalWithBook[] = rentals.map((rental, index) => ({
    ...rental,
    book: bookQueries[index]?.data,
  }));

  /** The server's rental goes into the cached list, so the row moves with it. */
  function writeRental(rental: Rental) {
    queryClient.setQueryData<RentalsListResponse>(rentalKeys.list(RENTAL_LIST_PARAMS), (old) =>
      old ? { ...old, rentals: old.rentals.map((entry) => (entry.id === rental.id ? rental : entry)) } : old,
    );
  }

  const returnMutation = useMutation({
    mutationFn: (id: string) => api.returnRental(id),
    onSuccess: async (updated) => {
      writeRental(updated);
      await invalidation.rentals(updated.id);
    },
    onError: (error) => {
      notify(strings.errors[classifyError(error)], "error");
    },
  });

  const extendMutation = useMutation({
    mutationFn: ({ id, days }: { id: string; days: number }) => api.extendRental(id, days),
    onSuccess: async (updated) => {
      writeRental(updated);
      // The chosen length is dropped only once the server has confirmed the
      // extension; a refused extension keeps it, so the reader can try again
      // without choosing the length a second time.
      setExtendDays((prev) => {
        const next = { ...prev };
        delete next[updated.id];
        return next;
      });
      await invalidation.rentals(updated.id);
    },
    onError: (error) => {
      notify(strings.errors[classifyError(error)], "error");
    },
  });

  /** The chosen length per row. UI state, not a fact about the world. */
  const [extendDays, setExtendDays] = useState<Record<string, number | "">>({});

  return (
    <div>
      <PageHeader title={copy.pageTitle} description={copy.pageDescription} />

      {list.isLoading && (
        <div>
          <span className="sr-only" role="status">
            {copy.loadingLabel}
          </span>
          <RentalListSkeleton count={3} />
        </div>
      )}

      {failed && (
        <ErrorMessage
          error={strings.errors[classifyError(list.error)]}
          onRetry={() => void list.refetch()}
        />
      )}

      {!list.isLoading && !failed && rows.length === 0 && (
        <EmptyState
          icon="clock"
          title={copy.emptyTitle}
          description={copy.emptyDescription}
          action={
            <ButtonLink href="/books" variant="primary">
              {copy.browseBooks}
            </ButtonLink>
          }
        />
      )}

      {!list.isLoading && !failed && rows.length > 0 && (
        <ul className="space-y-4">
          {rows.map((rental) => (
            <li key={rental.id}>
              <RentalRow
                rental={rental}
                extendDays={extendDays[rental.id] ?? ""}
                extending={extendMutation.isPending && extendMutation.variables?.id === rental.id}
                returning={returnMutation.isPending && returnMutation.variables === rental.id}
                onExtendDaysChange={(days) =>
                  setExtendDays((prev) => ({ ...prev, [rental.id]: days }))
                }
                onExtend={() => {
                  const days = extendDays[rental.id];
                  if (!days) return;
                  extendMutation.mutate({ id: rental.id, days });
                }}
                onReturn={() => returnMutation.mutate(rental.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
