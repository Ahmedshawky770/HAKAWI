"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { ReadingProgressCard } from "@/components/library/ReadingProgressCard";
import { EXTENSION_DURATION_OPTIONS } from "@/components/rental/RentalRow";
import { RentalStatusBadge } from "@/components/rental/RentalStatusBadge";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Select } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import type { Book, ReadingProgress, Rental } from "@/types/api";

/**
 * One rental in full: the book, the dates, the progress the reader has made in it, and the actions
 * that are still open.
 *
 * The book and the progress degrade to nothing rather than failing the page — a rental whose book
 * record has gone is still a rental, and still returnable. The actions card appears only while the
 * rental is active, because returning a returned book is not an action.
 */
export default function RentalDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { notify } = useToast();

  const [rental, setRental] = useState<Rental | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendDays, setExtendDays] = useState<number | "">("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const rentalData = await api.getRental(id);
        if (!active) return;
        setRental(rentalData);

        try {
          const bookData = await api.getBook(rentalData.bookId);
          if (active) setBook(bookData);
        } catch {
          if (active) setBook(null);
        }
        try {
          const progressData = await api.getReadingProgress(rentalData.bookId);
          if (active) setProgress(progressData.progress[0] ?? null);
        } catch {
          if (active) setProgress(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "فشل تحميل تفاصيل الإيجار");
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

  const handleReturn = async () => {
    if (!rental) return;
    setActionLoading(true);
    try {
      const updated = await api.returnRental(rental.id);
      setRental(updated);
    } catch (err) {
      notify(err instanceof Error ? err.message : "فشل إرجاع الكتاب", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!rental || !extendDays) return;
    setExtending(true);
    try {
      const updated = await api.extendRental(rental.id, extendDays);
      setRental(updated);
      setExtendDays("");
    } catch (err) {
      notify(err instanceof Error ? err.message : "فشل تمديد الإيجار", "error");
    } finally {
      setExtending(false);
    }
  };

  if (loading) return <Loading />;

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorMessage error={error} onRetry={retry} />
        <ButtonLink href="/rentals" variant="ghost" size="sm">
          <Icon name="chevron" size="sm" />
          العودة للإيجارات
        </ButtonLink>
      </div>
    );
  }

  if (!rental) {
    return (
      <EmptyState
        icon="clock"
        title="الإيجار غير موجود"
        description="ربما انتهى هذا الإيجار أو حُذف."
        action={<ButtonLink href="/rentals">العودة للإيجارات</ButtonLink>}
      />
    );
  }

  const isActive = rental.status === "active";
  const canExtend = isActive && rental.extendedCount < rental.maxExtensions;

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title={book?.title || "تفاصيل الإيجار"}
        description={book?.title ? "تفاصيل الإيجار" : undefined}
        action={
          <>
            <RentalStatusBadge status={rental.status} />
            <ButtonLink href="/rentals" variant="ghost" size="sm">
              <Icon name="chevron" size="sm" />
              العودة للإيجارات
            </ButtonLink>
          </>
        }
      />

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-ink">بيانات الإيجار</h2>
        </CardHeader>

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

            <div className="min-w-0 flex-1 space-y-4">
              <p className="text-base text-ink-muted">{book?.author ? `بواسطة ${book.author}` : "كتاب"}</p>

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
              تحديث القراءة من مكتبتي
            </ButtonLink>
          }
        />
      )}

      {isActive && (
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-ink">إجراءات</h2>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              {canExtend && (
                <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                  <Select
                    aria-label="مدة التمديد"
                    value={extendDays === "" ? "" : String(extendDays)}
                    onChange={(event) => setExtendDays(event.target.value ? Number(event.target.value) : "")}
                    options={EXTENSION_DURATION_OPTIONS}
                    className="text-sm"
                    wrapperClassName="sm:w-44"
                  />
                  <Button disabled={!extendDays} loading={extending} onClick={handleExtend}>
                    تمديد الإيجار
                  </Button>
                </div>
              )}
              <Button
                variant="danger"
                loading={actionLoading}
                onClick={handleReturn}
                className={canExtend ? "" : "sm:flex-1"}
              >
                إرجاع الكتاب
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
