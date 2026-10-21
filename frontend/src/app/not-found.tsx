"use client";

import React from "react";

import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The 404 screen.
 *
 * WHY IT IS NOT THE DEFAULT. Next.js serves its own not-found page when a route
 * does not exist, and that page is an English document in a different design
 * system: no product colours, no theme, no wordmark, no way home. A reader who
 * follows a dead link — from a shared story, from a search engine, from a
 * message — lands outside the product entirely, and the first thing they learn
 * about Hakawi is that it does not have a home page.
 *
 * The screen is a CLIENT component so it can read the reader's language from
 * the locale provider, which the root layout mounts above it.
 */
export default function NotFound() {
  const strings = useStrings();

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-16">
      <EmptyState
        icon="search"
        title={strings.common.notFoundTitle}
        description={strings.common.notFoundDescription}
        action={<ButtonLink href="/">{strings.common.backHome}</ButtonLink>}
      />
    </main>
  );
}
