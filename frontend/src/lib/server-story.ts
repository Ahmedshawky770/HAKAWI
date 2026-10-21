import { cache } from "react";

import { api } from "@/lib/api";
import type { Story } from "@/types/api";

/**
 * ONE STORY, ONE REQUEST, PER PAGE VIEW.
 *
 * A story's title is needed in three places on the same route: the tab title
 * and the link preview (the layout's metadata), the heading over the comments,
 * and the heading over the reactions. Each of them used to fetch the story for
 * itself, so a reader who opened the comments tab of a story asked the API for
 * that story twice or three times, and the visible heading fell back to
 * naming a database id.
 *
 * `cache()` is React's per-request memo: within ONE server render the same
 * story is fetched once, and the layout and the page beneath it share the
 * answer. Across two page views the story is fetched again — the reader asked
 * for it again — unless the caller already holds it.
 *
 * The request is bounded, because this runs while a response is being held
 * open: an API that is slow or down must degrade the page to the product's own
 * title, not hang it until the proxy gives up.
 */
export const getStoryOnce = cache((id: string): Promise<Story> =>
  api.getStory(id, { signal: AbortSignal.timeout(3000) }),
);
