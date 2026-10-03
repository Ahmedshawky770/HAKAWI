"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  DEFAULT_RENTAL_DURATION_DAYS,
  RENTAL_DURATION_DAYS,
  RENTAL_PRICE_PER_DAY_PIASTERS,
} from "@hakawi/shared-types";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Book } from "@/types/api";

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
 * What an extension of this length costs, from the same rate the backend charges.
 *
 * `RENTAL_PRICE_PER_DAY_PIASTERS` is piastres (1 EGP = 100). Showing the price from the shared
 * constant means the figure on screen and the figure in the payment cannot disagree — and the amount
 * is still re-derived server-side when the payment is created, so this is a quote for the reader, not
 * the authority. The checkout is where the money is decided.
 */
function formatRentPrice(days: number): string {
  const piastres = RENTAL_PRICE_PER_DAY_PIASTERS * days;
  return `${(piastres / 100).toLocaleString("ar-EG")} ج.م / ${days} يوم`;
}

export default function BookDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  /**
   * The rental length offered on this page.
   *
   * `RENTAL_DURATION_DAYS` comes from `@hakawi/shared-types`, which is also what the backend validates
   * against — so the list a reader can pick from and the list the API accepts cannot drift, which is
   * what a locally-duplicated array would guarantee eventually.
   */
  const [rentalDays, setRentalDays] = useState<number>(DEFAULT_RENTAL_DURATION_DAYS);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getBook(id);
        setBook(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل تحميل الكتاب");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handlePurchase = async () => {
    if (!paymentMethodId) {
      alert("الرجاء إدخال معرّف طريقة الدفع");
      return;
    }
    setActionLoading(true);
    try {
      // The response is a CHECKOUT, not a receipt. This used to ignore it and report success, so the
      // customer was told they had bought the book while never being sent to Paymob — and the
      // entitlement, which arrives on `payment.completed`, never happened either.
      const checkout = await api.purchaseBook(id, paymentMethodId);
      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل الشراء");
      setActionLoading(false);
    }
  };

  const handleRent = async () => {
    if (!paymentMethodId) {
      alert("الرجاء إدخال معرّف طريقة الدفع");
      return;
    }
    setActionLoading(true);
    try {
      // Same contract as the purchase: a checkout to send the customer to, not an active rental.
      // The rental row is created when the webhook confirms the payment.
      const checkout = await api.rentBook(id, { durationDays: rentalDays });
      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل الاستئجار");
      setActionLoading(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!book) return <div className="p-6">الكتاب غير موجود</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/books" className="text-blue-600 hover:text-blue-500">
          ← العودة للكتب
        </Link>
      </div>
      <Card>
        <CardBody>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{book.title}</h1>
          <p className="text-gray-600 mb-4">بواسطة {book.author}</p>
          {book.price && <p className="text-2xl font-bold text-gray-900 mb-4">${book.price.toFixed(2)}</p>}
          {book.description && <p className="text-gray-700 mb-6">{book.description}</p>}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-4">خيارات الشراء</h3>
            <div className="space-y-4">
              <div>
                <Input
                  label="معرّف طريقة الدفع"
                  type="text"
                  value={paymentMethodId}
                  onChange={(e) => setPaymentMethodId(e.target.value)}
                  placeholder="pm_123456"
                />
              </div>
              <div className="flex gap-3">
                <Button onClick={handlePurchase} loading={actionLoading}>
                  شراء
                </Button>
                <div className="flex items-center gap-2">
                  <select
                    value={rentalDays}
                    onChange={(e) => setRentalDays(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    {/* Rendered from the shared list rather than six hard-coded options, so the
                        lengths a reader can pick from and the lengths the API accepts cannot drift —
                        `RentalsService` validates against the same array. */}
                    {RENTAL_DURATION_DAYS.map((days) => (
                      <option key={days} value={days}>
                        {RENTAL_DURATION_LABELS_AR[days] ?? `${days} يوم`}
                      </option>
                    ))}
                  </select>
                  {/* The price, before anything is charged. `POST /rentals/:id/extend` and
                      `POST /books/:id/rent` now initialise a payment, so a reader sees the cost
                      before committing rather than discovering it at a checkout. */}
                  <span className="text-sm text-gray-600">{formatRentPrice(rentalDays)}</span>
                  <Button variant="secondary" onClick={handleRent} loading={actionLoading}>
                    إيجار
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
