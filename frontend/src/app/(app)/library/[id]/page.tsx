"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { formatBookPrice } from "@/components/books/BookCard";
import { LibraryStatusBadge } from "@/components/library/LibraryStatusBadge";
import { ReadingProgressCard } from "@/components/library/ReadingProgressCard";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardFooter, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Loading } from "@/components/ui/Loading";
import type { Book, LibraryItem, ReadingProgress } from "@/types/api";

/**
 * One shelf entry, in full: the book, where the reader is with it, and the two actions.
 *
 * The book and the progress are fetched the way they were before — the library list is the authority
 * on whether this id belongs to the reader, and a book or progress that cannot be fetched degrades to
 * "no book" / "no progress" rather than failing the page. The progress card is rendered only when
 * there is progress to show, because a bar at zero percent reads as "broken", not as "not started".
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

  const [item, setItem] = useState<LibraryItem | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await api.listLibrary();
        const found = data.items.find((i: LibraryItem) => i.id === id) || null;
        if (!active) return;
        setItem(found);

        if (found) {
          try {
            const bookData = await api.getBook(found.bookId);
            if (active) setBook(bookData);
          } catch {
            if (active) setBook(null);
          }
          try {
            const progressData = await api.getReadingProgress(found.bookId);
            if (active) setProgress(progressData.progress[0] ?? null);
          } catch {
            if (active) setProgress(null);
          }
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "فشل تحميل تفاصيل الكتاب");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [id, attempt]);

  /** Re-arms the same request; the reset lives here so the effect only awaits. */
  function retry() {
    setLoading(true);
    setError("");
    setAttempt((n) => n + 1);
  }

  const handleAccess = async () => {
    if (!item) return;
    setActionLoading(true);
    try {
      const updated = await api.accessLibraryItem(item.id);
      setItem(updated);
    } catch (err) {
      notify(err instanceof Error ? err.message : "فشل تحديث حالة القراءة", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!item) return;
    setRemoving(true);
    try {
      await api.removeFromLibrary(item.id);
      router.push("/library");
    } catch (err) {
      notify(err instanceof Error ? err.message : "فشل إزالة الكتاب من المكتبة", "error");
      setRemoving(false);
    }
  };

  if (loading) return <Loading />;

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorMessage error={error} onRetry={retry} />
        <ButtonLink href="/library" variant="ghost" size="sm">
          <Icon name="chevron" size="sm" />
          العودة للمكتبة
        </ButtonLink>
      </div>
    );
  }

  if (!item) {
    return (
      <EmptyState
        icon="library"
        title="الكتاب غير موجود في مكتبتك"
        description="ربما أزلته، أو أن الرابط يشير إلى عنصر لم يعد لك."
        action={<ButtonLink href="/library">العودة للمكتبة</ButtonLink>}
      />
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title={book?.title || "الكتاب"}
        description={book?.author ? `بواسطة ${book.author}` : undefined}
        action={
          <>
            <LibraryStatusBadge status={item.status} />
            <ButtonLink href="/library" variant="ghost" size="sm">
              <Icon name="chevron" size="sm" />
              العودة للمكتبة
            </ButtonLink>
          </>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-6 sm:flex-row">
            {book?.coverImage ? (
              <img
                src={book.coverImage}
                alt=""
                loading="lazy"
                decoding="async"
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
                  عدد الصفحات: <span className="hk-numeric">{book.pageCount}</span>
                </p>
              )}

              {item.lastAccessedAt && (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Icon name="clock" size="sm" />
                  آخر قراءة: {new Date(item.lastAccessedAt).toLocaleDateString("ar-EG")}
                </p>
              )}

              {book?.description ? (
                <p className="whitespace-pre-line leading-8 text-ink-muted">{book.description}</p>
              ) : (
                <p className="text-sm text-ink-muted">لا يوجد وصف لهذا الكتاب.</p>
              )}
            </div>
          </div>
        </CardBody>

        <CardFooter>
          <Button onClick={handleAccess} loading={actionLoading} className="flex-1">
            {item.status === "reading" ? "تحديث القراءة" : "بدء القراءة"}
          </Button>
          <Button variant="danger" onClick={handleRemove} loading={removing}>
            إزالة من المكتبة
          </Button>
        </CardFooter>
      </Card>

      {progress && <ReadingProgressCard progress={progress} />}
    </div>
  );
}
