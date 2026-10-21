"use client";

import React from "react";

import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { classifyError } from "@/lib/errors";
import { BookCard, BookGridSkeleton } from "@/components/books/BookCard";
import { isFailedLoad, useBooks } from "@/lib/queries";
import { useStrings } from "@/components/providers/LocaleProvider";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";

/**
 * The book catalogue.
 *
 * Four states, in the order a reader meets them: a skeleton grid whose cells are
 * the height of the cards that replace them, the cards, an empty catalogue that
 * points at the feed (a catalogue nobody has stocked yet is not a dead end, the
 * stories are), and a failure with a retry that re-runs the same request.
 *
 * The page header stays mounted in every state, so the column never reflows around
 * a title that appears after the data does.
 *
 * The list comes from the shared query cache (`useBooks`), not from a local
 * `useEffect`: the catalogue, the dashboard and a book page all read the same
 * key, so they cannot show three different catalogues, and a book that is
 * published in one place appears in the others without a refresh.
 */
export default function BooksPage() {
  const strings = useStrings();
  const booksQuery = useBooks();
  // A failed BACKGROUND refetch keeps the catalogue on the screen; only a load
  // that never arrived is a failed catalogue.
  const failed = isFailedLoad(booksQuery);
  const books = booksQuery.data?.books ?? [];

  return (
    <div>
      <PageHeader title={strings.books.listTitle} description={strings.books.listDescription} />

      {booksQuery.isLoading && (
        <div>
          <span className="sr-only" role="status">
            {strings.books.listLoadingLabel}
          </span>
          <BookGridSkeleton count={6} />
        </div>
      )}

      {failed && (
        <ErrorMessage
          error={strings.errors[classifyError(booksQuery.error)]}
          title={strings.books.listLoadFailed}
          onRetry={() => void booksQuery.refetch()}
        />
      )}

      {!booksQuery.isLoading && !failed && books.length === 0 && (
        <EmptyState
          icon="library"
          title={strings.books.listEmptyTitle}
          description={strings.books.listEmptyDescription}
          action={
            <ButtonLink href={AUTHENTICATED_HOME_ROUTE} variant="primary">
              {strings.books.browseStories}
            </ButtonLink>
          }
        />
      )}

      {!booksQuery.isLoading && !failed && books.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2">
          {books.map((book) => (
            <li key={book.id}>
              <BookCard book={book} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
