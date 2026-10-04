"use client";

import React, { useState } from "react";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Icon } from "@/components/ui/Icon";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchResultCard, SearchResultsSkeleton } from "@/components/social/SearchResultCard";
import { useStrings } from "@/components/providers/LocaleProvider";
import type { SearchResult } from "@/types/api";

type SearchPhase = "idle" | "searching" | "done";

const SUGGESTED_TERMS = ["رعب", "واقعي", "أساطير"];

export default function SearchPage() {
  const strings = useStrings();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [error, setError] = useState("");

  const runSearch = async (term: string) => {
    setSubmittedQuery(term);
    setPhase("searching");
    setError("");
    try {
      const data = await api.search({ query: term });
      setResults(data.results);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "تعذّر إتمام البحث");
    } finally {
      setPhase("done");
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    void runSearch(query);
  };

  const retry = () => {
    if (!submittedQuery) return;
    setPhase("searching");
    void runSearch(submittedQuery);
  };

  const pickTerm = (term: string) => {
    setQuery(term);
    void runSearch(term);
  };

  return (
    <div className="animate-rise">
      <PageHeader title={strings.navSearch} description="ابحث في القصص والكتب والكتّاب." />

      <form
        role="search"
        aria-label={strings.navSearch}
        onSubmit={handleSearch}
        className="mb-6 flex items-end gap-2"
      >
        <div className="relative flex-1">
          <Icon
            name="search"
            size="sm"
            className="pointer-events-none absolute inset-inline-start-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <Input
            type="text"
            aria-label={strings.searchLabel}
            placeholder={strings.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ps-10"
          />
        </div>
        <Button type="submit">بحث</Button>
      </form>

      {phase === "searching" && (
        <>
          <p role="status" className="mb-4 text-sm text-ink-muted">
            جاري البحث…
          </p>
          <SearchResultsSkeleton />
        </>
      )}

      {phase === "done" && error && (
        <ErrorMessage error={error} onRetry={retry} title="تعذّر إتمام البحث" />
      )}

      {phase === "done" && !error && results.length === 0 && (
        <div>
          <p role="status" className="mb-4 text-sm text-ink-muted">
            لا توجد نتائج
          </p>
          <EmptyState
            icon="search"
            title="لم نجد ما يطابق بحثك"
            description="جرّب كلمات أخرى، أو ابدأ من أحد هذه الاقتراحات:"
            action={SUGGESTED_TERMS.map((term) => (
              <Button key={term} variant="secondary" size="sm" onClick={() => pickTerm(term)}>
                {term}
              </Button>
            ))}
          />
        </div>
      )}

      {phase === "done" && !error && results.length > 0 && (
        <>
          <p role="status" className="mb-4 text-sm text-ink-muted">
            <span className="hk-numeric">{results.length}</span> نتيجة
          </p>
          <ul className="space-y-4">
            {results.map((result) => (
              <SearchResultCard key={result.id} result={result} />
            ))}
          </ul>
        </>
      )}

      {phase === "idle" && (
        <EmptyState
          icon="search"
          title={strings.searchLabel}
          description="اكتب كلمة في الحقل أعلاه، ثم اضغط Enter للبحث."
        />
      )}
    </div>
  );
}