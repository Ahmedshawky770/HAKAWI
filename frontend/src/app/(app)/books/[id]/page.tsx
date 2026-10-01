"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Book } from "@/types/api";

export default function BookDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [rentalDuration, setRentalDuration] = useState(7);

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
      await api.purchaseBook(id, paymentMethodId);
      alert("تم الشراء بنجاح!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل الشراء");
    } finally {
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
      await api.rentBook(id, { durationDays: rentalDuration });
      alert("تم الإيجار بنجاح!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل الإيجار");
    } finally {
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
                    value={rentalDuration}
                    onChange={(e) => setRentalDuration(Number(e.target.value))}
                    className="px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value={1}>يوم واحد</option>
                    <option value={3}>3 أيام</option>
                    <option value={7}>أسبوع</option>
                    <option value={14}>أسبوعين</option>
                    <option value={30}>شهر</option>
                    <option value={90}>3 أشهر</option>
                  </select>
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
