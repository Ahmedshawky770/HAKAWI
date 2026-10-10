"use client";

import React, { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { LibraryCard, LibraryGridSkeleton, type LibraryEntry } from "@/components/library/LibraryCard";
import { useToast } from "@/components/providers/ToastProvider";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import type { Book, LibraryItem } from "@/types/api";

/**
 * The reader's shelf.
 *
 * A removal that fails is announced as a toast rather than swallowed: the row stays where it was, so
 * a silent failure would leave the reader believing a book is gone from their library when it is not.
 * A removal that succeeds drops the row from the list, which is what the API has now confirmed.
 */
export default function LibraryPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await api.listLibrary();
        const entries = await Promise.all(
          data.items.map(async (item: LibraryItem): Promise<LibraryEntry> => {
            try {
              const book: Book = await api.getBook(item.bookId);
              return { ...item, book };
            } catch {
              return item;
            }
          }),
        );
        if (active) setItems(entries);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "فشل تحميل المكتبة");
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

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await api.removeFromLibrary(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      notify(err instanceof Error ? err.message : "فشل إزالة الكتاب من المكتبة", "error");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div dir="rtl">
      <PageHeader title="مكتبتي" description="كل ما اشتريته أو استعرته، وتقدّم قراءتك فيه." />

      {loading && (
        <div>
          <span className="sr-only" role="status">
            جارٍ تحميل المكتبة
          </span>
          <LibraryGridSkeleton count={4} />
        </div>
      )}

      {!loading && error && <ErrorMessage error={error} onRetry={retry} />}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon="library"
          title="مكتبتك فارغة"
          description="اشترِ كتاباً أو استعره لتظهر هنا، وسيحفظ تقدم قراءتك تلقائياً."
          action={
            <ButtonLink href="/books" variant="primary">
              تصفح الكتب
            </ButtonLink>
          }
        />
      )}

      {!loading && !error && items.length > 0 && (
        <ul className="grid gap-5 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <LibraryCard
                item={item}
                removing={removingId === item.id}
                onRemove={() => handleRemove(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
