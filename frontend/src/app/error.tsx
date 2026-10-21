"use client";

import React, { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { useStrings } from "@/components/providers/LocaleProvider";

/**
 * The boundary of a route that crashed.
 *
 * WHY IT EXISTS. Without an `error.tsx`, a thrown error in a server component
 * replaces the page with Next.js's own production error screen — a stack trace,
 * in English, outside the product. A reader who hits a bug sees the internals
 * of the application instead of the application.
 *
 * WHAT THE BOUNDARY MAY SAY. The message is generic on purpose: the error
 * itself is logged by the platform, and a crash message that quotes the failure
 * tells a reader about a table name or a query it has no business knowing.
 * The two actions are the two things a reader can actually do — try again, or
 * go home.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const strings = useStrings();

  useEffect(() => {
    // The platform's own reporter takes it from here; the boundary's job is to
    // be readable, not to be the logging.
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-16">
      <Card>
        <CardBody>
          <ErrorMessage error={strings.common.errorDescription} title={strings.common.errorTitle} />
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={reset}>{strings.common.retry}</Button>
            <ButtonLink href="/" variant="ghost">
              {strings.common.backHome}
            </ButtonLink>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
