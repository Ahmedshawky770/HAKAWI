"use client";

import React, { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { RentalListSkeleton, RentalRow, type RentalWithBook } from "@/components/rental/RentalRow";
import { useToast } from "@/components/providers/ToastProvider";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import type { Book, Rental } from "@/types/api";

/**
 * Every rental the reader holds.
 *
 * Two stateful actions per row, and both write the server's answer back into the row rather than a
 * guess: a return sets the status to `returned` with the timestamp the API now reports, and an
 * extension replaces the row with the rental the endpoint returned. A failure leaves the row exactly
 * as it was and says why in a toast — a silent revert of a return is indistinguishable from a bug.
 */
export default function RentalsPage() {
  const { notify } = useToast();
  const [rentals, setRentals] = useState<RentalWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<Record<string, number | "">>({});

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await api.getMyRentals({ page: 1, limit: 50 });
        const rentalsWithBooks: RentalWithBook[] = await Promise.all(
          data.rentals.map(async (rental: Rental): Promise<RentalWithBook> => {
            try {
              const book: Book = await api.getBook(rental.bookId);
              return { ...rental, book };
            } catch {
              return rental;
            }
          }),
        );
        if (active) setRentals(rentalsWithBooks);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "فشل تحميل الإيجارات");
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

  const handleReturn = async (id: string) => {
    setActionLoading(id);
    try {
      await api.returnRental(id);
      setRentals((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "returned", returnedAt: new Date().toISOString() } : r)),
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "فشل إرجاع الكتاب", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtend = async (id: string) => {
    const days = extendDays[id];
    if (!days) return;
    setExtendingId(id);
    try {
      const updated = await api.extendRental(id, days);
      setRentals((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
      setExtendDays((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      notify(err instanceof Error ? err.message : "فشل تمديد الإيجار", "error");
    } finally {
      setExtendingId(null);
    }
  };

  return (
    <div dir="rtl">
      <PageHeader title="إيجاراتي" description="الكتب المستعارة، وتواريخ انتهاءها، والتمديدات المتبقية." />

      {loading && (
        <div>
          <span className="sr-only" role="status">
            جارٍ تحميل الإيجارات
          </span>
          <RentalListSkeleton count={3} />
        </div>
      )}

      {!loading && error && <ErrorMessage error={error} onRetry={retry} />}

      {!loading && !error && rentals.length === 0 && (
        <EmptyState
          icon="clock"
          title="لا توجد إيجارات"
          description="لم تستعر أي كتاب بعد. استعارة كتاب تظهر هنا مع تاريخ انتهائه."
          action={
            <ButtonLink href="/books" variant="primary">
              تصفح الكتب
            </ButtonLink>
          }
        />
      )}

      {!loading && !error && rentals.length > 0 && (
        <ul className="space-y-4">
          {rentals.map((rental) => (
            <li key={rental.id}>
              <RentalRow
                rental={rental}
                extendDays={extendDays[rental.id] ?? ""}
                extending={extendingId === rental.id}
                returning={actionLoading === rental.id}
                onExtendDaysChange={(days) =>
                  setExtendDays((prev) => ({ ...prev, [rental.id]: days }))
                }
                onExtend={() => handleExtend(rental.id)}
                onReturn={() => handleReturn(rental.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
