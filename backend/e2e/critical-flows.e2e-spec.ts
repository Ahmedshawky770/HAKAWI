import { expect, test } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? 'http://localhost:3001';
const API_URL = `${BACKEND_URL}/api/v1`;
const PASSWORD = 'SecurePass123!';
const API_TIMEOUT = 30_000;

interface ApiUser {
  id: string;
  email: string;
  username: string;
  name: string;
  accountType: string;
}

interface ApiStory {
  id: string;
  title: string;
  slug: string;
  status: string;
}

interface AuthResponse {
  user: ApiUser;
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
      username: `${prefix}${suffix}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 29),
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
      content: '<p>Critical flow body copy.</p>',
      excerpt: 'Playwright excerpt',
    },
  });

  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const story = (await createResponse.json()) as ApiStory;
  expect(story.status).toBe('draft');

  const publishResponse = await request.post(`${API_URL}/stories/${story.id}/publish`, {
    timeout: API_TIMEOUT,
    headers: { Authorization: `Bearer ${token}` },
    data: {},
  });

  expect(publishResponse.status(), await publishResponse.text()).toBe(201);
  expect(((await publishResponse.json()) as ApiStory).status).toBe('published');

  return story;
}

async function fillRegisterForm(page: Page, email: string, username: string): Promise<void> {
  await page.getByRole('heading', { name: 'إنشاء حساب جديد' }).waitFor();
  await page.locator('input[name="name"]').fill('Playwright User');
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('input[name="confirmPassword"]').fill(PASSWORD);
}

test.describe('Critical Flows E2E', () => {
  test.describe('Browser: register, login, browse feed, open story', () => {
    test('registers a new account through the UI and lands on the dashboard', async ({ page }) => {
      const suffix = uniqueSuffix();
      const email = `browser${suffix}@example.com`;
      const username = `browser${suffix}`.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 29);

      await page.goto('/register');

      const registerResponse = page.waitForResponse((response) => response.url().includes('/api/v1/auth/register'));
      await fillRegisterForm(page, email, username);
      await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
      expect((await registerResponse).status()).toBe(201);

      await page.waitForURL('**/dashboard', { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'لوحة التحكم' })).toBeVisible();
    });

    test('signs in with an existing account through the UI', async ({ page, request }) => {
      const { user } = await registerThroughApi(request, 'login');

      await page.goto('/login');
      await page.getByRole('heading', { name: 'تسجيل الدخول' }).waitFor();

      const loginResponse = page.waitForResponse((response) => response.url().includes('/api/v1/auth/login'));
      await page.locator('input[type="email"]').fill(user.email);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
      expect((await loginResponse).status()).toBe(200);

      await page.waitForURL('**/dashboard', { timeout: 30_000 });
      await expect(page.getByRole('heading', { name: 'لوحة التحكم' })).toBeVisible();
    });

    test('surfaces a validation error when the UI login is wrong', async ({ page }) => {
      await page.goto('/login');
      await page.locator('input[type="email"]').fill(`nobody-${uniqueSuffix()}@example.com`);
      await page.locator('input[type="password"]').fill('DefinitelyWrong1!');
      await page.getByRole('button', { name: 'تسجيل الدخول' }).click();

      await expect(page.getByText('فشل تسجيل الدخول')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });

    test('browses the story feed and opens a story from it', async ({ page, request }) => {
      const { tokens } = await registerThroughApi(request, 'feed');
      const title = `Playwright Feed ${uniqueSuffix()}`;
      const story = await publishStoryThroughApi(request, tokens.accessToken, title);

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'لوحة التحكم' })).toBeVisible();
      await expect(page.getByText('أحدث القصص')).toBeVisible();

      const storiesResponse = page.waitForResponse((response) => response.url().includes('/api/v1/stories'));
      await page.getByRole('link', { name: title }).click();
      expect((await storiesResponse).status()).toBe(200);

      await expect(page).toHaveURL(new RegExp(`/stories/${story.id}$`));
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    });

    test('lists stories on the stories index page', async ({ page, request }) => {
      const { tokens } = await registerThroughApi(request, 'index');
      const title = `Playwright Index ${uniqueSuffix()}`;
      await publishStoryThroughApi(request, tokens.accessToken, title);

      await page.goto('/stories');
      await expect(page.getByRole('heading', { name: 'القصص' })).toBeVisible();
      await expect(page.getByRole('link', { name: title })).toBeVisible();
    });
  });

  test.describe('API: critical path status codes', () => {
    test('rejects an unauthenticated story creation with 401', async ({ request }) => {
      const response = await request.post(`${API_URL}/stories`, {
        timeout: API_TIMEOUT,
        data: { title: 'Anonymous', slug: `anon-${uniqueSuffix()}` },
      });

      expect(response.status()).toBe(401);
    });

    test('rejects a duplicate story slug with 409', async ({ request }) => {
      const { tokens } = await registerThroughApi(request, 'slug');
      const slug = `dup-${uniqueSuffix()}`;

      const first = await request.post(`${API_URL}/stories`, {
        timeout: API_TIMEOUT,
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        data: { title: 'First', slug, content: '<p>a</p>' },
      });
      expect(first.status()).toBe(201);

      const second = await request.post(`${API_URL}/stories`, {
        timeout: API_TIMEOUT,
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        data: { title: 'Second', slug, content: '<p>b</p>' },
      });
      expect(second.status()).toBe(409);
    });

    test('rejects publishing a story owned by another user with 403', async ({ request }) => {
      const owner = await registerThroughApi(request, 'owner');
      const intruder = await registerThroughApi(request, 'intruder');
      const story = await publishStoryThroughApi(request, owner.tokens.accessToken, `Owned ${uniqueSuffix()}`);

      const response = await request.post(`${API_URL}/stories/${story.id}/archive`, {
        timeout: API_TIMEOUT,
        headers: { Authorization: `Bearer ${intruder.tokens.accessToken}` },
        data: {},
      });

      expect(response.status()).toBe(403);
    });

    test('finds the published story through the search endpoint', async ({ request }) => {
      const { tokens } = await registerThroughApi(request, 'search');
      const marker = `marker${uniqueSuffix()}`;
      const story = await publishStoryThroughApi(request, tokens.accessToken, `Searchable ${marker}`);

      const response = await request.get(`${API_URL}/search?query=${marker}`, { timeout: API_TIMEOUT });

      expect(response.status()).toBe(200);
      const body = (await response.json()) as { total: number; results: { id: string }[] };
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.results.some((entry) => entry.id === story.id)).toBe(true);
    });

    test('returns 400 for a search request without a query', async ({ request }) => {
      const response = await request.get(`${API_URL}/search`, { timeout: API_TIMEOUT });

      expect(response.status()).toBe(400);
    });
  });
});
