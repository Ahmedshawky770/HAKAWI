"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  DEFAULT_RENTAL_DURATION_DAYS,
  RENTAL_DURATION_DAYS,
  rentalPriceForDays,
} from "@hakawi/shared-types";

import { api, getStoredUser } from "@/lib/api";
import { formatBookPrice } from "@/components/books/BookCard";
import { formatRentalQuote } from "@/lib/money";
import { useToast } from "@/components/providers/ToastProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Icon } from "@/components/ui/Icon";
import { Input, Select } from "@/components/ui/Input";
import { Loading } from "@/components/ui/Loading";
import type { Book } from "@/types/api";

/** Arabic labels for the offered rental lengths. Presentation only — never the source of truth. */
const RENTAL_DURATION_LABELS_AR: Record<number, string> = {
  1: "يوم واحد",
  3: "3 أيام",
  7: "أسبوع",
  14: "أسبوعين",
  30: "شهر",
  90: "3 أشهر",
};

/**
 * What a rental of this length costs, from the same rate the backend charges.
 *
 * `rentalPriceForDays` is the shared rate and it is denominated in PIASTRES like
 * every other amount in the product (1 EGP = 100) — `formatRentalQuote` performs
 * the single division by 100 this product contains. Quoting from the shared
 * constant means the figure on screen and the figure in the payment cannot
 * disagree; and the amount is still re-derived server-side when the payment is
 * created, so this is a quote for the reader, not the authority. The checkout is
 * where the money is decided.
 */
function formatRentPrice(days: number): string {
  return formatRentalQuote(rentalPriceForDays(days), days);
}

/**
 * Rendered from the shared list rather than six hard-coded options, so the lengths a reader can pick
 * from and the lengths the API accepts cannot drift — `RentalsService` validates against the same
 * array.
 */
const RENTAL_DURATION_OPTIONS = RENTAL_DURATION_DAYS.map((days) => ({
  value: String(days),
  label: RENTAL_DURATION_LABELS_AR[days] ?? `${days} يوم`,
}));

/**
 * The product page for one book: what it is, what it costs, and the two ways of paying for it.
 *
 * Both money paths return a CHECKOUT, not a receipt, so both send the reader to the gateway with
 * `window.location.assign` and the entitlement only ever arrives with `payment.completed`. A failure
 * is reported twice, on purpose: inline on the card that carries the action, where the reader is
 * looking, and as a toast, because the action they pressed may be several sections up the page.
 */
export default function BookDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { notify } = useToast();

  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentMethodError, setPaymentMethodError] = useState("");
  const [rentalDays, setRentalDays] = useState<number>(DEFAULT_RENTAL_DURATION_DAYS);
  const [isbn, setIsbn] = useState("");
  const [isbnError, setIsbnError] = useState("");
  const [downloading, setDownloading] = useState(false);

  const currentUserId = getStoredUser()?.id ?? null;
  const isOwner = currentUserId != null && book != null && book.author === currentUserId;

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await api.getBook(id);
        if (active) setBook(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "فشل تحميل الكتاب");
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

  const reportFailure = (message: string) => {
    setActionError(message);
    notify(message, "error");
  };

  const handlePurchase = async () => {
    if (!paymentMethodId) {
      setPaymentMethodError("الرجاء إدخال معرّف طريقة الدفع");
      notify("الرجاء إدخال معرّف طريقة الدفع", "error");
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      // The response is a CHECKOUT, not a receipt. This used to ignore it and report success, so the
      // customer was told they had bought the book while never being sent to Paymob — and the
      // entitlement, which arrives on `payment.completed`, never happened either.
      const checkout = await api.purchaseBook(id, paymentMethodId);
      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      reportFailure(err instanceof Error ? err.message : "فشل الشراء");
      setActionLoading(false);
    }
  };

  const handleRent = async () => {
    if (!paymentMethodId) {
      setPaymentMethodError("الرجاء إدخال معرّف طريقة الدفع");
      notify("الرجاء إدخال معرّف طريقة الدفع", "error");
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      // Same contract as the purchase: a checkout to send the customer to, not an active rental.
      // The rental row is created when the webhook confirms the payment.
      const checkout = await api.rentBook(id, { durationDays: rentalDays });
      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      reportFailure(err instanceof Error ? err.message : "فشل الاستئجار");
      setActionLoading(false);
    }
  };

  const handleClaimFree = async () => {
    if (!book) return;
    setActionLoading(true);
    setActionError("");
    try {
      await api.claimLibraryItem({ bookId: id });
      notify("تمت إضافة الكتاب إلى مكتبتك", "success");
    } catch (err) {
      reportFailure(err instanceof Error ? err.message : "فشل الحصول على الكتاب");
    } finally {
      setActionLoading(false);
    }
  };

  const handlePublish = async () => {
    setActionLoading(true);
    setActionError("");
    try {
      await api.publishBook(id);
      setBook((prev) => (prev ? { ...prev, status: "published" } : prev));
      notify("تم نشر الكتاب", "success");
    } catch (err) {
      reportFailure(err instanceof Error ? err.message : "فشل نشر الكتاب");
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async () => {
    setActionLoading(true);
    setActionError("");
    try {
      await api.archiveBook(id);
      setBook((prev) => (prev ? { ...prev, status: "archived" } : prev));
      notify("تم أرشفة الكتاب", "success");
    } catch (err) {
      reportFailure(err instanceof Error ? err.message : "فشل أرشفة الكتاب");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    setActionLoading(true);
    setActionError("");
    try {
      await api.deleteBook(id);
      notify("تم حذف الكتاب", "success");
    } catch (err) {
      reportFailure(err instanceof Error ? err.message : "فشل حذف الكتاب");
    } finally {
      setActionLoading(false);
    }
  };

  const handleIsbnLookup = async () => {
    if (!isbn) {
      setIsbnError("الرجاء إدخال ISBN");
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      const data = await api.findBookByIsbn(isbn);
      setBook(data);
      notify("تم جلب تفاصيل الكتاب", "success");
    } catch (err) {
      reportFailure(err instanceof Error ? err.message : "فشل جلب الكتاب");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setActionError("");
    try {
      const { downloadUrl } = await api.downloadBook(id);
      if (downloadUrl) {
        window.location.assign(downloadUrl);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "فشل تحميل الكتاب");
      setDownloading(false);
    }
  };

  if (loading) return <Loading />;

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorMessage error={error} onRetry={retry} />
        <ButtonLink href="/books" variant="ghost" size="sm">
          <Icon name="chevron" size="sm" />
          العودة للكتب
        </ButtonLink>
      </div>
    );
  }

  if (!book) {
    return (
      <EmptyState
        icon="book"
        title="الكتاب غير موجود"
        description="ربما حُذف الكتاب أو تغيّر رابطه."
        action={<ButtonLink href="/books">تصفح الكتب</ButtonLink>}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={book.title}
        description={`بواسطة ${book.author}`}
        action={
          <ButtonLink href="/books" variant="ghost" size="sm">
            <Icon name="chevron" size="sm" />
            العودة للكتب
          </ButtonLink>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-6 sm:flex-row">
            {book.coverImage ? (
              <img
                src={book.coverImage}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-56 w-40 shrink-0 self-start rounded-lg object-cover"
              />
            ) : (
              <div className="grid h-56 w-40 shrink-0 place-items-center self-start rounded-lg bg-surface-raised text-ink-faint">
                <Icon name="library" size="lg" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-3">
              {book.price != null && book.price > 0 && (
                <p className="hk-numeric text-2xl font-bold text-accent-ink">{formatBookPrice(book.price)}</p>
              )}

              {book.pageCount != null && (
                <p className="flex items-center gap-2 text-sm text-ink-muted">
                  <Icon name="book" size="sm" />
                  عدد الصفحات: <span className="hk-numeric">{book.pageCount}</span>
                </p>
              )}

              <h2 className="pt-1 text-lg font-semibold text-ink">نبذة عن الكتاب</h2>
              {book.description ? (
                <p className="whitespace-pre-line leading-8 text-ink-muted">{book.description}</p>
              ) : (
                <p className="text-sm text-ink-muted">لا يوجد وصف لهذا الكتاب بعد.</p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-ink">الشراء أو الإيجار</h2>
        </CardHeader>
        <CardBody>
          <div className="space-y-5">
            {actionError && <ErrorMessage error={actionError} title="تعذّر إتمام العملية" />}

            {book.isFree && (
              <Button onClick={handleClaimFree} loading={actionLoading} variant="secondary">
                الحصول على الكتاب مجاناً
              </Button>
            )}

            {isOwner && (
              <div className="flex flex-wrap gap-3">
                {book.status !== "published" && (
                  <Button onClick={handlePublish} loading={actionLoading} variant="secondary">
                    نشر الكتاب
                  </Button>
                )}
                {book.status !== "archived" && (
                  <Button onClick={handleArchive} loading={actionLoading} variant="ghost">
                    أرشفة الكتاب
                  </Button>
                )}
                <Button onClick={handleDelete} loading={actionLoading} variant="danger">
                  حذف الكتاب
                </Button>
              </div>
            )}

            <div className="border-t border-line pt-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Select
                  label="مدة الإيجار"
                  value={String(rentalDays)}
                  onChange={(event) => setRentalDays(Number(event.target.value))}
                  options={RENTAL_DURATION_OPTIONS}
                  wrapperClassName="sm:w-48"
                />
                <Button variant="secondary" onClick={handleRent} loading={actionLoading}>
                  استئجار الكتاب
                </Button>
              </div>
              <p className="mt-3 text-sm text-ink-muted">{formatRentPrice(rentalDays)}</p>
            </div>

            <div className="border-t border-line pt-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Input
                  label="معرّف طريقة الدفع"
                  type="text"
                  value={paymentMethodId}
                  onChange={(event) => {
                    setPaymentMethodId(event.target.value);
                    if (paymentMethodError) setPaymentMethodError("");
                  }}
                  placeholder="pm_123456"
                  error={paymentMethodError}
                  hint="معرّف طريقة الدفع المحفوظة في بوابة الدفع."
                  wrapperClassName="sm:max-w-sm"
                />
                <Button onClick={handlePurchase} loading={actionLoading}>
                  شراء الكتاب
                </Button>
              </div>
            </div>

            <div className="border-t border-line pt-5 space-y-3">
              <p className="text-sm font-medium text-ink-muted">البحث عن طريق ISBN</p>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <Input
                  label="ISBN"
                  type="text"
                  value={isbn}
                  onChange={(event) => {
                    setIsbn(event.target.value);
                    if (isbnError) setIsbnError("");
                  }}
                  placeholder="978-3-16-148410-0"
                  error={isbnError}
                  wrapperClassName="sm:max-w-sm"
                />
                <Button variant="secondary" onClick={handleIsbnLookup} loading={actionLoading}>
                  جلب التفاصيل
                </Button>
              </div>
            </div>

            <div className="border-t border-line pt-5">
              <Button variant="secondary" onClick={handleDownload} loading={downloading}>
                تحميل الكتاب
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
