import React from "react";

import { Loading as LoadingSpinner } from "@/components/ui/Loading";

/**
 * The waiting screen of the signed-in area.
 *
 * A navigation inside the app keeps the chrome — the header, the sidebar, the
 * bottom bar — and swaps the content. Without a `loading.tsx` the content area
 * goes empty for the length of a request, and a reader who clicked a link is
 * left looking at a page with no content and no explanation. The spinner sits
 * where the content will be, and the frame around it does not move.
 */
export default function Loading() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
