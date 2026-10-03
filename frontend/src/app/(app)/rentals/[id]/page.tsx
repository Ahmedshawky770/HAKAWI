"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Rental, Book, ReadingProgress } from "@/types/api";

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

export default function RentalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [rental, setRental] = useState<Rental | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [extending, setExtending] = useState(false);
  const [extendDays, setExtendDays] = useState<number | "">("");

  useEffect(() => {
    async function load() {
      try {
        const rentalData = await api.getRental(id);
        setRental(rentalData);
        try {
          const bookData = await api.getBook(rentalData.bookId);
          setBook(bookData);
        } catch {
          setBook(null);
        }
        try {
          const progressData = await api.getReadingProgress(rentalData.bookId);
          setProgress(progressData.progress[0] ?? null);
        } catch {
          setProgress(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل تحميل تفاصيل الإيجار");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleReturn = async () => {
    if (!rental) return;
    setActionLoading(true);
    try {
      const updated = await api.returnRental(rental.id);
      setRental(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل إرجاع الكتاب");
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
      alert(err instanceof Error ? err.message : "فشل تمديد الإيجار");
    } finally {
      setExtending(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!rental) return <div className="p-6">الإيجار غير موجود</div>;

  const statusInfo = getStatusInfo(rental.status);
  const isActive = rental.status === "active";
  const canExtend = isActive && rental.extendedCount < rental.maxExtensions;

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="mb-6">
        <Link href="/rentals" className="text-blue-600 hover:text-blue-500">
          ← العودة للإيجارات
        </Link>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <h1 className="text-2xl font-bold text-gray-900">تفاصيل الإيجار</h1>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col md:flex-row gap-6">
            {book?.coverImage && (
              <img
                src={book.coverImage}
                alt={book.title}
                className="w-40 h-56 object-cover rounded-lg flex-shrink-0 mx-auto md:mx-0"
              />
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{book?.title || "كتاب"}</h2>
              <p className="text-lg text-gray-600 mb-4">بواسطة {book?.author || ""}</p>
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-4 ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
              <div className="grid grid-cols-2 gap-3 text-sm text-gray-600 mt-4">
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
              {book?.description && <p className="text-gray-700 mt-4 whitespace-pre-line">{book.description}</p>}
            </div>
          </div>
        </CardBody>
      </Card>

      {progress && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">تقدم القراءة</h2>
          </CardHeader>
          <CardBody>
            <div className="w-full bg-gray-200 rounded-full h-4 mb-4">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all"
                style={{ width: `${Math.min(progress.progressPercentage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-gray-600">
              <span>
                الصفحة {progress.currentPage}
                {progress.totalPages ? ` من ${progress.totalPages}` : ""}
              </span>
              <span>{progress.progressPercentage.toFixed(1)}%</span>
            </div>
            {progress.lastReadAt && (
              <p className="text-sm text-gray-500 mt-1">
                آخر قراءة: {new Date(progress.lastReadAt).toLocaleDateString("ar-EG")}
              </p>
            )}
            {progress.completedAt && (
              <p className="text-sm text-green-600 mt-1 font-medium">
                اكتملت القراءة: {new Date(progress.completedAt).toLocaleDateString("ar-EG")}
              </p>
            )}
            <div className="mt-4">
              <Link href="/library">
                <Button variant="secondary" size="sm">
                  تحديث القراءة من مكتبتي
                </Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      )}

      {isActive && (
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold text-gray-900">إجراءات</h2>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col sm:flex-row gap-3">
              {canExtend && (
                <div className="flex gap-2 flex-1">
                  <select
                    value={extendDays}
                    onChange={(e) => setExtendDays(e.target.value ? Number(e.target.value) : "")}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">مدة التمديد</option>
                    {EXTENSION_OPTIONS.map((opt) => (
                      <option key={opt.days} value={opt.days}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Button disabled={!extendDays || extending} onClick={handleExtend}>
                    {extending ? "جاري التمديد..." : "تمديد الإيجار"}
                  </Button>
                </div>
              )}
              <Button
                variant="danger"
                loading={actionLoading}
                onClick={handleReturn}
                className={canExtend ? "" : "flex-1"}
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
