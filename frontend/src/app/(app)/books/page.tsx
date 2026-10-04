"use client";

import React, { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { AUTHENTICATED_HOME_ROUTE } from "@/lib/routes";
import { BookCard, BookGridSkeleton } from "@/components/books/BookCard";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import type { Book } from "@/types/api";

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
 */
export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await api.listBooks();
        if (active) setBooks(data.books);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "فشل تحميل الكتب");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [attempt]);

  /** Re-arms the same request; the reset lives here so the effect only awaits. */
  function retry() {
    setLoading(true);
    setError("");
    setAttempt((n) => n + 1);
  }

  return (
    <div>
      <PageHeader title="الكتب" description="كل ما نشرته حكاوي، للشراء أو الإيجار." />

      {loading && (
        <div>
          <span className="sr-only" role="status">
            جارٍ تحميل الكتب
          </span>
          <BookGridSkeleton count={6} />
        </div>
      )}

      {!loading && error && <ErrorMessage error={error} onRetry={retry} />}

      {!loading && !error && books.length === 0 && (
        <EmptyState
          icon="library"
          title="لا توجد كتب بعد"
          description="لم يُنشر أي كتاب حتى الآن. القصص متاحة الآن، وسنضيف الكتب تباعاً."
          action={
            <ButtonLink href={AUTHENTICATED_HOME_ROUTE} variant="primary">
              تصفح القصص
            </ButtonLink>
          }
        />
      )}

      {!loading && !error && books.length > 0 && (
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
