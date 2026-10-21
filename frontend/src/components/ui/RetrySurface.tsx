"use client";

import React from "react";
import { useRouter } from "next/navigation";

import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { useStrings } from "@/components/providers/LocaleProvider";
import type { AppErrorCode } from "@/lib/errors";

/**
 * The failure surface of a page that fetches on the SERVER.
 *
 * IT IS NOT AN ERROR BOUNDARY, AND IT IS NOT NAMED LIKE ONE. The name used to
 * promise the one thing this component does not do: it catches NOTHING. A
 * React error boundary is a class component with a
 * `componentDidCatch` and a `getDerivedStateFromError`, and it stands between
 * a tree that threw and the rest of the application; `react-error-boundary` —
 * the package that writes the boilerplate — is not a dependency of this
 * frontend, and this component has no `try`/`catch` and no error state of its
 * own. What it does is offer a RETRY on a request that has already failed:
 * the server component that fetched the data caught the failure, classified
 * it, and rendered this island in its place. So it is a SURFACE, and it is
 * named after what it does.
 *
 * WHY A SERVER PAGE NEEDS A CLIENT RETRY. A server component has no state and
 * no event handlers: it renders once, on the server, and the reader's only way
 * back is a full navigation. `router.refresh()` re-runs the server render of
 * the current route — which re-runs the fetch — without a page reload and
 * without losing the reader's place. So the retry on a server-rendered page is
 * a client island, and this is that island.
 *
 * WHY IT EXISTS AT ALL. The comments and reactions pages used to fetch with
 * `.catch(() => null)` and then render an EMPTY LIST. A failure and a story
 * with no comments were the same screen, and the reader's conclusion was
 * "nobody has commented" when the truth was "the request failed". An empty
 * state that lies is worse than an error: it is a statement about the world.
 *
 * THE ERROR ARRIVES AS A CODE, NOT AS A MESSAGE. The server classifies what
 * came back; the client turns the code into a sentence in the reader's
 * language. A server component cannot read the reader's locale — it is a
 * `localStorage` preference — so the word is chosen on the client, where the
 * preference is known.
 */
export function RetrySurface({ errorCode }: { errorCode: AppErrorCode }) {
  const router = useRouter();
  const strings = useStrings();

  return (
    <ErrorMessage
      error={strings.errors[errorCode]}
      title={strings.common.errorTitle}
      onRetry={() => router.refresh()}
    />
  );
}
