"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { LibraryItem, ReadingProgress } from "@/types/api";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  owned: { label: "مملوك", color: "bg-green-100 text-green-800" },
  rented: { label: "مستأجر", color: "bg-blue-100 text-blue-800" },
  reading: { label: "قيد القراءة", color: "bg-yellow-100 text-yellow-800" },
  completed: { label: "مكتمل", color: "bg-gray-100 text-gray-800" },
};

function getStatusInfo(status: string) {
  return STATUS_LABELS[status] || { label: status, color: "bg-gray-100 text-gray-800" };
}

export default function LibraryItemPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [progress, setProgress] = useState<ReadingProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.listLibrary();
        const found = data.items.find((i: LibraryItem) => i.id === id) || null;
        setItem(found);

        if (found) {
          try {
            const progressData = await api.getReadingProgress(found.bookId);
            setProgress(progressData);
          } catch {
            setProgress(null);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل تحميل تفاصيل الكتاب");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleAccess = async () => {
    if (!item) return;
    setActionLoading(true);
    try {
      const updated = await api.accessLibraryItem(item.id);
      setItem(updated);
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل تحديث حالة القراءة");
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
      alert(err instanceof Error ? err.message : "فشل إزالة الكتاب من المكتبة");
      setRemoving(false);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!item) return <div className="p-6">الكتاب غير موجود في مكتبتك</div>;

  const statusInfo = getStatusInfo(item.status);

  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <div className="mb-6">
        <Link href="/library" className="text-blue-600 hover:text-blue-500">
          ← العودة للمكتبة
        </Link>
      </div>

      <Card>
        <CardBody>
          <div className="flex flex-col md:flex-row gap-6">
            {item.book.coverImage && (
              <img
                src={item.book.coverImage}
                alt={item.book.title}
                className="w-40 h-56 object-cover rounded-lg flex-shrink-0 mx-auto md:mx-0"
              />
            )}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{item.book.title}</h1>
              <p className="text-lg text-gray-600 mb-4">بواسطة {item.book.author}</p>
              {item.book.price != null && (
                <p className="text-2xl font-bold text-gray-900 mb-4">${item.book.price.toFixed(2)}</p>
              )}
              <span
                className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-4 ${statusInfo.color}`}
              >
                {statusInfo.label}
              </span>
              {item.book.description && (
                <p className="text-gray-700 mt-4 whitespace-pre-line">{item.book.description}</p>
              )}
              {item.book.pageCount && (
                <p className="text-sm text-gray-500 mt-2">عدد الصفحات: {item.book.pageCount}</p>
              )}
              {item.lastAccessedAt && (
                <p className="text-sm text-gray-500 mt-1">
                  آخر قراءة: {new Date(item.lastAccessedAt).toLocaleDateString("ar-EG")}
                </p>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {progress && (
        <Card className="mt-6">
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
            {progress.startedAt && (
              <p className="text-sm text-gray-500 mt-2">
                بدأت القراءة: {new Date(progress.startedAt).toLocaleDateString("ar-EG")}
              </p>
            )}
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
          </CardBody>
        </Card>
      )}

      <div className="mt-6 flex flex-col sm:flex-row gap-3">
        <Button onClick={handleAccess} loading={actionLoading} className="flex-1">
          {item.status === "reading" ? "تحديث القراءة" : "بدء القراءة"}
        </Button>
        <Button variant="danger" onClick={handleRemove} loading={removing}>
          إزالة من المكتبة
        </Button>
      </div>
    </div>
  );
}
