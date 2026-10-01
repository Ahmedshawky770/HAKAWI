"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Rental, Book } from "@/types/api";

type RentalWithBook = Rental & { book?: Book };

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "نشط", color: "bg-green-100 text-green-800" },
  returned: { label: "مُرجع", color: "bg-gray-100 text-gray-800" },
  expired: { label: "منتهي", color: "bg-red-100 text-red-800" },
  overdue: { label: "متأخر", color: "bg-red-100 text-red-800" },
};

function getStatusInfo(status: string) {
  return STATUS_LABELS[status] || { label: status, color: "bg-gray-100 text-gray-800" };
}

const EXTENSION_OPTIONS = [
  { label: "أسبوع واحد", days: 7 },
  { label: "أسبوعان", days: 14 },
  { label: "شهر واحد", days: 30 },
];

export default function RentalsPage() {
  const router = useRouter();
  const [rentals, setRentals] = useState<RentalWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [extendingId, setExtendingId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getMyRentals({ page: 1, limit: 50 });
        const rentalsWithBooks: RentalWithBook[] = await Promise.all(
          data.rentals.map(async (rental) => {
            try {
              const book = await api.getBook(rental.bookId);
              return { ...rental, book };
            } catch {
              return rental;
            }
          }),
        );
        setRentals(rentalsWithBooks);
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل تحميل الإيجارات");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleReturn = async (id: string) => {
    setActionLoading(id);
    try {
      await api.returnRental(id);
      setRentals((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status: "returned", returnedAt: new Date().toISOString() } : r)),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل إرجاع الكتاب");
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
      alert(err instanceof Error ? err.message : "فشل تمديد الإيجار");
    } finally {
      setExtendingId(null);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">إيجاراتي</h1>
      {rentals.length === 0 ? (
        <p className="text-gray-600">لا توجد إيجارات حالياً.</p>
      ) : (
        <div className="space-y-4">
          {rentals.map((rental) => {
            const statusInfo = getStatusInfo(rental.status);
            const isActive = rental.status === "active";
            const canExtend = isActive && rental.extendedCount < rental.maxExtensions;
            const selectedDays = extendDays[rental.id];

            return (
              <Card key={rental.id}>
                <CardBody>
                  <div className="flex flex-col sm:flex-row gap-4">
                    {rental.book?.coverImage && (
                      <Link href={`/books/${rental.book.id}`}>
                        <img
                          src={rental.book.coverImage}
                          alt={rental.book.title}
                          className="w-24 h-36 object-cover rounded-md flex-shrink-0"
                        />
                      </Link>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Link href={`/books/${rental.bookId}`}>
                            <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                              {rental.book?.title || "كتاب"}
                            </h3>
                          </Link>
                          <p className="text-sm text-gray-600 mt-1">{rental.book?.author || ""}</p>
                        </div>
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-gray-600">
                        <div>
                          <span className="text-gray-500">تاريخ البدء: </span>
                          {new Date(rental.startDate).toLocaleDateString("ar-EG")}
                        </div>
                        <div>
                          <span className="text-gray-500">تاريخ الانتهاء: </span>
                          {new Date(rental.endDate).toLocaleDateString("ar-EG")}
                        </div>
                        <div>
                          <span className="text-gray-500">التمديدات: </span>
                          {rental.extendedCount} / {rental.maxExtensions}
                        </div>
                        {rental.returnedAt && (
                          <div>
                            <span className="text-gray-500">تاريخ الإرجاع: </span>
                            {new Date(rental.returnedAt).toLocaleDateString("ar-EG")}
                          </div>
                        )}
                      </div>
                      {isActive && (
                        <div className="mt-4 flex flex-col sm:flex-row gap-2">
                          {canExtend && (
                            <div className="flex gap-2 flex-1">
                              <select
                                value={selectedDays || ""}
                                onChange={(e) =>
                                  setExtendDays((prev) => ({
                                    ...prev,
                                    [rental.id]: Number(e.target.value),
                                  }))
                                }
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">مدة التمديد</option>
                                {EXTENSION_OPTIONS.map((opt) => (
                                  <option key={opt.days} value={opt.days}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                              <Button
                                size="sm"
                                disabled={!selectedDays || extendingId === rental.id}
                                onClick={() => handleExtend(rental.id)}
                              >
                                {extendingId === rental.id ? "جاري التمديد..." : "تمديد"}
                              </Button>
                            </div>
                          )}
                          <Button
                            variant="danger"
                            size="sm"
                            loading={actionLoading === rental.id}
                            onClick={() => handleReturn(rental.id)}
                            className={canExtend ? "" : "flex-1"}
                          >
                            إرجاع
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4">
                    <Link href={`/rentals/${rental.id}`}>
                      <Button variant="secondary" size="sm">
                        عرض التفاصيل
                      </Button>
                    </Link>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
