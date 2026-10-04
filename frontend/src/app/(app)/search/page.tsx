"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

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

/**
 * WHY THE PAGE IS SPLIT IN TWO.
 *
 * The header's search field is a real `<form action="/search" method="get">`, so
 * it works with JavaScript switched off — and a GET with no script means the
 * query has to arrive in the URL. Reading it needs `useSearchParams`, which the
 * App Router may only call inside a Suspense boundary. So the page is a boundary
 * around a client component that reads the URL, and the benefit is not technical:
 * **a search is a shareable link**, and a URL you cannot paste to someone is a
 * result you cannot send to anyone.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFrame />}>
      <SearchClient />
    </Suspense>
  );
}

/**
 * What is on screen for the instant it takes the router to read the URL: the page
 * title, and nothing else. A frame that already has its title keeps the column
 * from jumping when the results arrive.
 */
function SearchFrame() {
  const strings = useStrings();
  return (
    <div className="animate-rise">
      <PageHeader title={strings.navSearch} />
    </div>
  );
}

function SearchClient() {
  const strings = useStrings();
  const params = useSearchParams();
  const urlQuery = (params.get("q") ?? "").trim();

  const [query, setQuery] = useState(urlQuery);
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

  /*
   * Run the search the URL asks for, once per distinct query. The ref is what
   * makes this safe under React's strict double-invocation of effects: without
   * it, a remount in development fires the same request twice and the second one
   * wins the race.
   */
  const searchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!urlQuery || searchedRef.current === urlQuery) return;
    searchedRef.current = urlQuery;
    setQuery(urlQuery);
    void runSearch(urlQuery);
  }, [urlQuery]);

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