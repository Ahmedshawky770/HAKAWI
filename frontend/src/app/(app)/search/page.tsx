"use client";

import React, { useState } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api } from "@/lib/api";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; title: string; status: string }[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const data = await api.search({ query });
      setResults(data.results);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardBody>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">بحث</h1>
          <form onSubmit={handleSearch} className="mb-6">
            <Input
              type="text"
              placeholder="ابحث عن قصص، مستخدمين، كتب..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
          {loading && <p className="text-gray-500">جاري البحث...</p>}
          {!loading && results.length === 0 && query && <p className="text-gray-500">لا توجد نتائج.</p>}
          <ul className="space-y-3">
            {results.map((result) => (
              <li key={result.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                <p className="font-medium text-gray-900">{result.title}</p>
                <p className="text-sm text-gray-500 capitalize">{result.status}</p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
