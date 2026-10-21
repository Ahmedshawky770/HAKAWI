"use client";

import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { classifyError } from "@/lib/errors";
import {
  isFailedLoad,
  libraryKeys,
  useBook,
  useInvalidation,
  useLibrary,
  useReadingProgress,
} from "@/lib/queries";
import { formatBookPrice } from "@/components/books/BookCard";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { ReadingProgressCard } from "@/components/library/ReadingProgressCard";
import { useToast } from "@/components/providers/ToastProvider";
import { useLocale } from "@/components/providers/LocaleProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Loading } from "@/components/ui/Loading";
import { RemoteImage } from "@/components/ui/RemoteImage";
import { formatDate } from "@/lib/i18n";
import type { LibraryListResponse } from "@/types/api";

/**
 * One shelf entry, in full: the book, where the reader is with it, and the two actions.
 *
 * The library list is the authority on whether this id belongs to the reader, and it is read through
 * `useLibrary` — the same cache entry the shelf itself reads, so opening an entry never costs a
 * second copy of the shelf. The book and the progress are fetched through `useBook` and
 * `useReadingProgress`, and a book or progress that cannot be fetched degrades to "no book" /
 * "no progress" rather than failing the page. The progress card is rendered only when there is
 * progress to show, because a bar at zero percent reads as "broken", not as "not started".
 *
 * Both actions are real buttons and both failures are announced: an access that did not happen leaves
 * the reader believing their place in the book was saved, and a removal that did not happen leaves a
 * book in a library they think they emptied.
 */
export default function LibraryItemPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const { notify } = useToast();
  const { intl, strings } = useLocale();
  const { library } = strings;
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();

  const shelf = useLibrary();
  const item = shelf.data?.items.find((entry) => entry.id === id) ?? null;
  // The book id is only known once the shelf has answered, and both queries stay
  // disabled until then — a disabled query fetches nothing.
  const bookId = item?.bookId ?? "";
  const bookQuery = useBook(bookId);
  const progressQuery = useReadingProgress(bookId);
  const book = bookQuery.data ?? null;
  const progress = progressQuery.data?.progress[0] ?? null;

  const accessMutation = useMutation({
    mutationFn: (itemId: string) => api.accessLibraryItem(itemId),
    onSuccess: async (updated) => {
      // The server's answer goes into the cache, so the badge and every other
      // surface showing this entry move to the state the API confirmed.
      queryClient.setQueryData<LibraryListResponse>(libraryKeys.list(), (old) =>
        old ? { ...old, items: old.items.map((entry) => (entry.id === updated.id ? updated : entry)) } : old,
      );
      await invalidation.library();
    },
    onError: (error) => {
      notify(strings.errors[classifyError(error)], "error");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => api.removeFromLibrary(itemId),
    onSuccess: async () => {
      await invalidation.library();
      router.push("/library");
    },
    onError: (error) => {
      notify(strings.errors[classifyError(error)], "error");
    },
  });

  if (shelf.isLoading || bookQuery.isLoading) return <Loading />;

  if (isFailedLoad(shelf)) {
    return (
      <div className="space-y-4">
        <ErrorMessage
          error={strings.errors[classifyError(shelf.error)]}
          title={library.loadFailedTitle}
          onRetry={() => void shelf.refetch()}
        />
        <ButtonLink href="/library" variant="ghost" size="sm">
          <Icon name="chevron" size="sm" />
          {library.backToLibrary}
        </ButtonLink>
      </div>
    );
  }

  if (!item) {
    return (
      <EmptyState
        icon="library"
        title={library.notFoundTitle}
        description={library.notFoundDescription}
        action={<ButtonLink href="/library">{library.backToLibrary}</ButtonLink>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={book?.title || library.detailTitleFallback}
        description={book?.author ? library.authorByline(book.author) : undefined}
        action={
          <>
            <LibraryStatusBadge status={item.status} />
            <ButtonLink href="/library" variant="ghost" size="sm">
              <Icon name="chevron" size="sm" />
              {library.backToLibrary}
            </ButtonLink>
          </>
        }
      />

      <Card>
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

            <div className="min-w-0 flex-1 space-y-3">
              {book?.price != null && book.price > 0 && (
                <p className="hk-numeric text-2xl font-bold text-accent-ink">{formatBookPrice(book.price)}</p>
              )}

              {book?.pageCount != null && (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Icon name="book" size="sm" />
                  {library.pageCountLabel} <span className="hk-numeric">{book.pageCount}</span>
                </p>
              )}

              {item.lastAccessedAt && (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Icon name="clock" size="sm" />
                  {library.lastReadLabel} {formatDate(item.lastAccessedAt, intl)}
                </p>
              )}

              {book?.description ? (
                <p className="whitespace-pre-line leading-8 text-ink-muted">{book.description}</p>
              ) : (
                <p className="text-sm text-ink-muted">{library.noDescription}</p>
              )}
            </div>
          </div>
        </CardBody>

        <CardFooter>
          <Button
            onClick={() => accessMutation.mutate(item.id)}
            loading={accessMutation.isPending}
            className="flex-1"
          >
            {item.status === "reading" ? library.updateReading : library.startReading}
          </Button>
          <Button
            variant="danger"
            onClick={() => removeMutation.mutate(item.id)}
            loading={removeMutation.isPending}
          >
            {library.removeFromLibrary}
          </Button>
        </CardFooter>
      </Card>

      {progress && <ReadingProgressCard progress={progress} />}
    </div>
  );
}
