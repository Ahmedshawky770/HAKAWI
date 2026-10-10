import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

/**
 * API contract checks driven through Playwright's `request` fixture.
 *
 * WHY THIS FILE EXISTS AND WHERE IT CAME FROM. `backend/e2e/critical-flows.e2e-spec.ts` held five
 * genuinely useful API tests and five browser journeys that could never have passed. The whole file
 * was ORPHANED: `vitest.config.ts` excludes `e2e/**`, `vitest.config.e2e.ts` excludes
 * the `e2e` directory entirely, and no CI step invoked `test:e2e:playwright` — so nothing in any
 * gate ever ran it, while the roadmap listed it as a delivered E2E suite.
 *
 * The five browser journeys were dropped because all three were broken in ways a green run would not
 * have revealed: they waited for the removed `/dashboard` route, which `src/lib/routes.ts` no longer
 * defines and which `src/app/routes.test.ts` pins as deleted; one asserted an Arabic error string
 * fallback for a non-`Error` rejection, which a 401 never produces; and one navigated to `/` after
 * registering through the `request` fixture, so the browser held no session cookie and
 * `useAuthGuard` correctly redirected to `/login`.
 *
 * The five API tests are kept here, because `frontend/playwright.config.ts` is the suite CI actually
 * runs (`ci.yml` → `test-browser`) and it already boots both servers via `webServer`. The frontend's
 * `journeys.e2e-spec.ts` already hosts API-only tests the same way, so this is a shape that exists in
 * the repository rather than one invented here.
 *
 * `backend/playwright.config.ts` and the `test:e2e:playwright` script are deleted with the orphaned
 * file: with one browser runner in CI, a second config nothing invoked was a second way to believe
 * coverage existed when it did not.
 */
const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:3001";
const API_URL = `${BACKEND_URL}/api/v1`;
const PASSWORD = "SecurePass123!";
const API_TIMEOUT = 30_000;

interface ApiStory {
  id: string;
  title: string;
  slug: string;
  status: string;
}

interface AuthResponse {
  tokens: { accessToken: string; refreshToken: string };
}

function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

async function registerThroughApi(request: APIRequestContext, prefix: string): Promise<AuthResponse> {
  const suffix = uniqueSuffix();
  const response = await request.post(`${API_URL}/auth/register`, {
    timeout: API_TIMEOUT,
    data: {
      email: `${prefix}${suffix}@example.com`,
      username: `${prefix}${suffix}`.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 29),
      name: `Playwright ${prefix}`,
      password: PASSWORD,
    },
  });

  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as AuthResponse;
}

async function publishStoryThroughApi(request: APIRequestContext, token: string, title: string): Promise<ApiStory> {
  const createResponse = await request.post(`${API_URL}/stories`, {
    timeout: API_TIMEOUT,
    headers: { Authorization: `Bearer ${token}` },
    data: {
      title,
      slug: `playwright-${uniqueSuffix()}`,
      content: "<p>Critical flow body copy.</p>",
      excerpt: "Playwright excerpt",
    },
  });

  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const story = (await createResponse.json()) as ApiStory;
  expect(story.status).toBe("draft");

  const publishResponse = await request.post(`${API_URL}/stories/${story.id}/publish`, {
    timeout: API_TIMEOUT,
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });

  expect(publishResponse.status(), await publishResponse.text()).toBe(201);
  expect(((await publishResponse.json()) as ApiStory).status).toBe("published");

  return story;
}

test.describe("API: critical path status codes", () => {
  test("rejects an unauthenticated story creation with 401", async ({ request }) => {
    const response = await request.post(`${API_URL}/stories`, {
      timeout: API_TIMEOUT,
      data: { title: "Anonymous", slug: `anon-${uniqueSuffix()}` },
    });

    expect(response.status()).toBe(401);
  });

  test("rejects a duplicate story slug with 409", async ({ request }) => {
    // The database half of this: migration 0020 adds the unique index that
    // `StoriesService.insertWithResolvedSlug` already assumed it had.
    const { tokens } = await registerThroughApi(request, "slug");
    const slug = `dup-${uniqueSuffix()}`;

    const first = await request.post(`${API_URL}/stories`, {
      timeout: API_TIMEOUT,
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      data: { title: "First", slug, content: "<p>a</p>" },
    });
    expect(first.status()).toBe(201);

    const second = await request.post(`${API_URL}/stories`, {
      timeout: API_TIMEOUT,
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      data: { title: "Second", slug, content: "<p>b</p>" },
    });
    expect(second.status()).toBe(409);
  });

  test("rejects archiving a story owned by another user with 403", async ({ request }) => {
    const owner = await registerThroughApi(request, "owner");
    const intruder = await registerThroughApi(request, "intruder");
    const story = await publishStoryThroughApi(request, owner.tokens.accessToken, `Owned ${uniqueSuffix()}`);

    const response = await request.post(`${API_URL}/stories/${story.id}/archive`, {
      timeout: API_TIMEOUT,
      headers: { Authorization: `Bearer ${intruder.tokens.accessToken}` },
      data: {},
    });

    expect(response.status()).toBe(403);
  });

  test("finds the published story through the search endpoint", async ({ request }) => {
    const { tokens } = await registerThroughApi(request, "search");
    const marker = `marker${uniqueSuffix()}`;
    const story = await publishStoryThroughApi(request, tokens.accessToken, `Searchable ${marker}`);

    const response = await request.get(`${API_URL}/search?query=${marker}`, { timeout: API_TIMEOUT });
    expect(response.status()).toBe(200);

    const body = (await response.json()) as { total: number; results: { id: string }[] };
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(body.results.some((entry) => entry.id === story.id)).toBe(true);
  });

  test("returns 400 for a search request without a query", async ({ request }) => {
    const response = await request.get(`${API_URL}/search`, { timeout: API_TIMEOUT });
    expect(response.status()).toBe(400);
  });

  test("never exposes drafts belonging to another account through the public search index", async ({ request }) => {
    // The public search route pins `status: 'published'` rather than forwarding the query string,
    // because forwarding it made `?status=draft` an anonymous dump of every unpublished story.
    const { tokens } = await registerThroughApi(request, "draft");
    const marker = `draftmarker${uniqueSuffix()}`;

    const created = await request.post(`${API_URL}/stories`, {
      timeout: API_TIMEOUT,
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      data: { title: `Draft ${marker}`, slug: `draft-${marker}`, content: "<p>hidden</p>" },
    });
    expect(created.status()).toBe(201);

    const anonymous = await request.get(`${API_URL}/search?query=${marker}&status=draft`, {
      timeout: API_TIMEOUT,
    });
    expect(anonymous.status()).toBe(200);
    const body = (await anonymous.json()) as { total: number };
    expect(body.total).toBe(0);
  });
});
