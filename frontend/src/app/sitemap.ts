import type { MetadataRoute } from "next";

import { API_URL } from "@/lib/api";
import { SITE_URL } from "@/lib/site-url";

/**
 * The sitemap: the public surface of the product, and the stories in it.
 *
 * WHY THE STORIES ARE FETCHED. A story platform's value is its content, and
 * content that is not in a sitemap is content a search engine has to find by
 * following links. The public routes are static and are listed here; the
 * stories are fetched from the API, because their ids are the only thing that
 * distinguishes them and they are what a reader searches for.
 *
 * WHY THE ROUTE IS DYNAMIC. `sitemap.ts` is cached by default: without a
 * `dynamic` export Next prerenders it at BUILD time, and the story URLs in
 * the file are then FROZEN at image-build time — a story published after the
 * build is not in the sitemap until the next deployment, and no crawl
 * discovers it either, because the sitemap is a static file that says
 * otherwise. The route is therefore rendered per request, the same way the
 * link-preview routes are, so the sitemap always describes the product as it
 * is now.
 *
 * A FETCH THAT FAILS IS NOT A FAILED SITEMAP. The static routes are the
 * product's shape and they are always known; the stories are a bonus. If the
 * API is down, the sitemap still lists everything the crawler can reach, and
 * the next request tries the API again. A sitemap that throws when its
 * dependency is unavailable takes the whole route down with it.
 */

/**
 * The route is rendered per request, not prerendered at build time.
 *
 * The same mechanism the link-preview routes use, and for the same reason:
 * a build-time snapshot of the story list is a list that is already out of
 * date the moment the image is built.
 */
export const dynamic = "force-dynamic";

/**
 * The most stories the API will return in one page.
 *
 * `StoriesQueryDto.limit` is capped at 100 (`@Max(100)`) and the global
 * `ValidationPipe` REJECTS a larger number with a 400 — it does not clamp it.
 * Asking for 200 therefore returned no stories at all, and the sitemap shipped
 * only its four static routes without ever saying so.
 */
const PAGE_SIZE = 100;

/** The most pages the sitemap walks. A crawler does not need the whole archive. */
const MAX_PAGES = 5;

interface StorySummary {
  id: string;
  updatedAt?: string;
}

interface StoriesPage {
  stories?: StorySummary[];
  total?: number;
  page?: number;
  limit?: number;
}

/** One page of stories, or `null` when the API refused or could not be reached. */
async function fetchStoryPage(page: number): Promise<StoriesPage | null> {
  try {
    const response = await fetch(`${API_URL}/stories?page=${page}&limit=${PAGE_SIZE}`, {
      // The stories are public, so the sitemap does not need a session; the
      // request is made on the server, where there is no session to send.
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (typeof payload !== "object" || payload === null) return null;
    return payload as StoriesPage;
  } catch {
    return null;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/stories`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/books`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/search`, changeFrequency: "weekly", priority: 0.4 },
  ];

  const stories: StorySummary[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const payload = await fetchStoryPage(page);
    const batch = Array.isArray(payload?.stories) ? payload.stories : [];
    if (batch.length === 0) break;
    stories.push(...batch);
    // The walk stops early only when the API TOLD us how many stories there
    // are. `total` is optional, and reading an absent `total` as `0` made
    // the loop stop after the first page — silently shipping a sitemap with
    // a hundred stories in it while the archive holds thousands.
    if (typeof payload?.total === "number" && stories.length >= payload.total) break;
  }

  const storyRoutes: MetadataRoute.Sitemap = stories.map((story) => ({
    url: `${SITE_URL}/stories/${story.id}`,
    lastModified: story.updatedAt ? new Date(story.updatedAt) : undefined,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...storyRoutes];
}
