"use client";

import React, { useMemo } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import { bookKeys, isFailedLoad, libraryKeys, useInvalidation, useLibrary } from "@/lib/queries";
import { LibraryCard, LibraryGridSkeleton, type LibraryEntry } from "@/components/library/LibraryCard";
import { useToast } from "@/components/providers/ToastProvider";
import { useStrings } from "@/components/providers/LocaleProvider";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import type { LibraryListResponse } from "@/types/api";

/**
 * The reader's shelf.
 *
 * The shelf itself is ONE cache entry (`useLibrary`), and the book behind each
 * entry is fetched through `useQueries` — one request per distinct book, in a
 * single call, instead of a hand-written fan-out that issued a request per row
 * and could not be shared with any other surface. A book that fails to load
 * degrades to no book: one broken cover must not take the whole shelf down.
 *
 * A removal that fails is announced as a toast rather than swallowed: the row stays where it was, so
 * a silent failure would leave the reader believing a book is gone from their library when it is not.
 * A removal that succeeds drops the row from the list, which is what the API has now confirmed — and
 * the list is invalidated afterwards, so the server's answer is the one on screen.
 */
export default function LibraryPage() {
  const { notify } = useToast();
  const strings = useStrings();
  const { library } = strings;
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();

  const shelf = useLibrary();
  // A failed BACKGROUND refetch keeps the shelf on the screen; only a load that
  // never arrived is a failed shelf.
  const failed = isFailedLoad(shelf);
  const items = useMemo(() => shelf.data?.items ?? [], [shelf.data]);

  /*
   * ONE `useQueries` FOR THE WHOLE SHELF. The books are fetched in parallel by
   * the cache rather than by a loop of promises, and each one is keyed by the
   * shared `bookKeys.detail`, so a book already loaded elsewhere is not fetched
   * twice.
   *
   * THE LIST OF QUERIES IS MEMOISED. `useQueries` re-configures every row's
   * observer when the array it is given is a new object, and the array was
   * rebuilt on every render — so a shelf re-rendered by a hover or a keystroke
   * re-configured twenty observers to ask the same twenty questions. The
   * identity of the array now changes only when the shelf does.
   *
   * The remaining cost is the API's shape, not the client's: the list endpoint
   * answers with a `bookId` per row and no book, so a cold visit costs one
   * request per book. Collapsing that is a change to the list endpoint's
   * contract, not to this page.
   */
  const bookQueries = useQueries({
    queries: useMemo(
      () =>
        items.map((item) => ({
          queryKey: bookKeys.detail(item.bookId),
          queryFn: () => api.getBook(item.bookId),
        })),
      [items],
    ),
  });

  const entries: LibraryEntry[] = items.map((item, index) => ({
    ...item,
    book: bookQueries[index]?.data,
  }));

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.removeFromLibrary(id),
    onMutate: async (id) => {
      // The row leaves the shelf the moment the reader presses remove, and comes
      // back if the server refuses. The guess is written into the CACHE rather
      // than into a local list, so every surface showing the shelf moves together.
      await queryClient.cancelQueries({ queryKey: libraryKeys.list() });
      const previous = queryClient.getQueryData<LibraryListResponse>(libraryKeys.list());
      queryClient.setQueryData<LibraryListResponse>(libraryKeys.list(), (old) =>
        old ? { ...old, items: old.items.filter((item) => item.id !== id) } : old,
      );
      return { previous };
    },
    onError: (error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(libraryKeys.list(), context.previous);
      }
      notify(strings.errors[classifyError(error)], "error");
    },
    onSuccess: async () => {
      await invalidation.library();
    },
  });

  const removingId = removeMutation.isPending ? removeMutation.variables : null;

  return (
    <div>
      <PageHeader title={library.pageTitle} description={library.pageDescription} />

      {shelf.isLoading && (
        <div>
          <span className="sr-only" role="status">
            {library.loadingLabel}
          </span>
          <LibraryGridSkeleton count={4} />
        </div>
      )}

      {failed && (
        <ErrorMessage
          error={strings.errors[classifyError(shelf.error)]}
          onRetry={() => void shelf.refetch()}
        />
      )}

      {!shelf.isLoading && !failed && entries.length === 0 && (
        <EmptyState
          icon="library"
          title={library.emptyTitle}
          description={library.emptyDescription}
          action={
            <ButtonLink href="/books" variant="primary">
              {library.browseBooks}
            </ButtonLink>
          }
        />
      )}

      {!shelf.isLoading && !failed && entries.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2">
          {entries.map((item) => (
            <li key={item.id}>
              <LibraryCard
                item={item}
                removing={removingId === item.id}
                onRemove={() => removeMutation.mutate(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
