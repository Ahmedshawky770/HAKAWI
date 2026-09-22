"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Book } from "@/types/api";

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.listBooks();
        setBooks(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load books");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Books</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {books.map((book) => (
          <Card key={book.id}>
            <CardBody>
              <Link href={`/books/${book.id}`} className="block">
                <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                  {book.title}
                </h3>
                <p className="text-sm text-gray-600 mt-1">By {book.author.name}</p>
                {book.price && (
                  <p className="text-lg font-bold text-gray-900 mt-2">${book.price.toFixed(2)}</p>
                )}
                {book.category && (
                  <span className="inline-block mt-3 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded capitalize">
                    {book.category}
                  </span>
                )}
              </Link>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
