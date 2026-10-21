"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import { PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Icon } from "@/components/ui/Icon";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchResultCard, SearchResultsSkeleton } from "@/components/social/SearchResultCard";
import { useStrings } from "@/components/providers/LocaleProvider";
import { classifyError } from "@/lib/errors";
import { isFailedLoad, useSearch } from "@/lib/queries";

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
  const { shell } = useStrings();
  return (
    <div className="animate-rise">
      <PageHeader title={shell.navSearch} />
    </div>
  );
}

/**
 * The results line.
 *
 * The digits — and only the digits — sit inside the LTR isolate `.hk-numeric`
 * provides; the noun stays as sentence text, because isolating a whole Arabic
 * phrase reorders the words around it. That split is what `CountReadout` in
 * `lib/i18n/common.ts` exists for, and this component is the one place the
 * search page renders a count.
 */
function ResultsCount({ count }: { count: number }) {
  const { common } = useStrings();
  const readout = common.resultsCount(count);
  return (
    <>
      <span className="hk-numeric">{readout.count}</span> {readout.label}
    </>
  );
}

function SearchClient() {
  const strings = useStrings();
  const { shell, common } = strings;
  const params = useSearchParams();
  const urlQuery = (params.get("q") ?? "").trim();

  const [query, setQuery] = useState(urlQuery);
  const [term, setTerm] = useState(urlQuery);
  const [lastUrl, setLastUrl] = useState(urlQuery);

  /*
   * THE URL IS WHAT A LINK MEANS. `q` is the search the page was opened with,
   * so a change of it re-arms the search; a term the reader typed stays until
   * the URL says otherwise. The state is adjusted DURING the render rather than
   * in an effect, which is the pattern React documents for "a value from
   * outside changed" — an effect would render the page twice for every URL.
   */
  if (urlQuery !== lastUrl) {
    setLastUrl(urlQuery);
    setTerm(urlQuery);
    setQuery(urlQuery);
  }

  /*
   * THE SEARCH IS A CACHE ENTRY, NOT A CALL. The URL's parameter is `q` and the
   * API's is `query` — the difference is deliberate and is explained in
   * `lib/api.ts` — and the hook owns the translation between them.
   */
  const search = useSearch({ query: term });
  const results = search.data?.results ?? [];
  const idle = term.trim().length === 0;
  // A failed BACKGROUND REFETCH leaves the results in place; only a load that
  // never arrived is a failed search.
  const failed = isFailedLoad(search);
  // The three states a search can be in: still arriving, refused, or settled —
  // with or without results.
  const loading = !idle && search.isLoading;
  const settled = !idle && !loading && !failed;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = query.trim();
    if (!next) return;
    /*
     * THE SAME TERM IS A NEW SEARCH, NOT A NO-OP.
     *
     * The query key is the term, so searching for a term the page already
     * holds reuses the same cache entry — and with the app-wide stale time
     * that entry is still fresh, so nothing was fetched and the reader saw the
     * same results with no explanation. A reader who searches again is asking
     * for the results again, so the request is made again.
     */
    if (next === term) {
      void search.refetch();
      return;
    }
    setTerm(next);
  };

  const pickTerm = (suggestion: string) => {
    setQuery(suggestion);
    setTerm(suggestion);
  };

  return (
    <div className="animate-rise">
      <PageHeader title={shell.navSearch} description={shell.searchDescription} />

      <form
        role="search"
        aria-label={shell.navSearch}
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
            aria-label={shell.searchLabel}
            placeholder={shell.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="ps-10"
          />
        </div>
        <Button type="submit">{common.search}</Button>
      </form>

      {idle && (
        <EmptyState
          icon="search"
          title={shell.searchLabel}
          description={shell.searchIdleDescription}
        />
      )}

      {loading && (
        <>
          <p role="status" className="mb-4 text-sm text-ink-muted">
            {shell.searching}
          </p>
          <SearchResultsSkeleton />
        </>
      )}

      {failed && (
        <ErrorMessage
          error={strings.errors[classifyError(search.error)]}
          onRetry={() => void search.refetch()}
          title={shell.searchFailed}
        />
      )}

      {settled && results.length === 0 && (
        <div>
          <p role="status" className="mb-4 text-sm text-ink-muted">
            {common.noResults}
          </p>
          <EmptyState
            icon="search"
            title={shell.noMatchesTitle}
            description={shell.noMatchesDescription}
            action={shell.searchSuggestions.map((suggestion) => (
              <Button key={suggestion} variant="secondary" size="sm" onClick={() => pickTerm(suggestion)}>
                {suggestion}
              </Button>
            ))}
          />
        </div>
      )}

      {settled && results.length > 0 && (
        <>
          <p role="status" className="mb-4 text-sm text-ink-muted">
            <ResultsCount count={results.length} />
          </p>
          <ul className="space-y-4">
            {results.map((result) => (
              <SearchResultCard key={result.id} result={result} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
