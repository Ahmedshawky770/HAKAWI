"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Book, LibraryItem } from "@/types/api";

type LibraryEntry = LibraryItem & { book?: Book };

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  owned: { label: "مملوك", color: "bg-green-100 text-green-800" },
  rented: { label: "مستأجر", color: "bg-blue-100 text-blue-800" },
  reading: { label: "قيد القراءة", color: "bg-yellow-100 text-yellow-800" },
  completed: { label: "مكتمل", color: "bg-gray-100 text-gray-800" },
};

function getStatusInfo(status: string) {
  return STATUS_LABELS[status] || { label: status, color: "bg-gray-100 text-gray-800" };
}

export default function LibraryPage() {
  const [items, setItems] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.listLibrary();
        const entries = await Promise.all(
          data.items.map(async (item) => {
            try {
              const book = await api.getBook(item.bookId);
              return { ...item, book };
            } catch {
              return item;
            }
          }),
        );
        setItems(entries);
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل تحميل المكتبة");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await api.removeFromLibrary(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "فشل إزالة الكتاب من المكتبة");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">مكتبتي</h1>
      {items.length === 0 ? (
        <p className="text-gray-600">مكتبتك فارغة حالياً.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const statusInfo = getStatusInfo(item.status);
            return (
              <Card key={item.id}>
                <CardBody>
                  <Link href={`/library/${item.id}`} className="block">
                    <div className="flex gap-4">
                      {item.book?.coverImage && (
                        <img
                          src={item.book.coverImage}
                          alt={item.book.title}
                          className="w-20 h-28 object-cover rounded-md flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600 truncate">
                          {item.book?.title ?? "كتاب"}
                        </h3>
                        <p className="text-sm text-gray-600 mt-1">{item.book?.author ?? ""}</p>
                        {item.book?.price != null && (
                          <p className="text-sm font-medium text-gray-900 mt-1">${item.book.price.toFixed(2)}</p>
                        )}
                        <span
                          className={`inline-block mt-2 px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>
                    </div>
                  </Link>
                  <div className="mt-4 flex gap-2">
                    <Link href={`/library/${item.id}`} className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full">
                        عرض التفاصيل
                      </Button>
                    </Link>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={removingId === item.id}
                      onClick={() => handleRemove(item.id)}
                    >
                      إزالة
                    </Button>
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
