import React from "react";

import { Loading as LoadingSpinner } from "@/components/ui/Loading";

/**
 * The waiting screen of a route that has not finished loading.
 *
 * A route without a `loading.tsx` shows nothing at all while it resolves, and
 * a blank page and a failed page look the same to a reader. The spinner is the
 * product's own — it announces itself as a status region — so a reader who
 * lands here is told that the product is thinking rather than broken.
 */
export default function Loading() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-[60dvh] items-center justify-center bg-canvas"
    >
      <LoadingSpinner size="lg" />
    </main>
  );
}
