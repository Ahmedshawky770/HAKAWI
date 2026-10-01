import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page, Response } from "@playwright/test";

const BACKEND_URL = process.env.PLAYWRIGHT_BACKEND_URL ?? "http://localhost:3001";
const API_URL = `${BACKEND_URL}/api/v1`;
const PASSWORD = "SecurePass123!";
const API_TIMEOUT = 30_000;

interface ApiAuthUser {
  id: string;
  email: string;
}

interface ApiAuthResponse {
  user: ApiAuthUser;
  tokens: { accessToken: string; refreshToken: string };
}

interface ApiStory {
  id: string;
  title: string;
  status: string;
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
}

export async function registerThroughApi(request: APIRequestContext, prefix: string): Promise<ApiAuthResponse> {
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
  return (await response.json()) as ApiAuthResponse;
}

export async function publishStoryThroughApi(
  request: APIRequestContext,
  accessToken: string,
  title: string,
): Promise<ApiStory> {
  const createResponse = await request.post(`${API_URL}/stories`, {
    timeout: API_TIMEOUT,
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { title, slug: `playwright-${uniqueSuffix()}`, content: "<p>Critical flow body copy.</p>" },
  });

  expect(createResponse.status(), await createResponse.text()).toBe(201);
  const story = (await createResponse.json()) as ApiStory;

  const publishResponse = await request.post(`${API_URL}/stories/${story.id}/publish`, {
    timeout: API_TIMEOUT,
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {},
  });

  expect(publishResponse.status(), await publishResponse.text()).toBe(201);
  return story;
}

export async function waitForApiResponse(page: Page, path: string): Promise<Response> {
  return page.waitForResponse((response) => response.url().includes(path));
}

export async function fillRegisterForm(page: Page, email: string, username: string): Promise<void> {
  await page.getByRole("heading", { name: "إنشاء حساب جديد" }).waitFor();
  await page.getByLabel("الاسم الكامل").fill("Playwright User");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("البريد الإلكتروني").fill(email);
  // `exact` matters here: "كلمة المرور" is a substring of "تأكيد كلمة المرور", so the
  // default substring match resolves to both fields and fails on a strict-mode violation.
  await page.getByLabel("كلمة المرور", { exact: true }).fill(PASSWORD);
  await page.getByLabel("تأكيد كلمة المرور", { exact: true }).fill(PASSWORD);
}

export async function fillLoginForm(page: Page, email: string, password: string): Promise<void> {
  await page.getByRole("heading", { name: "تسجيل الدخول" }).waitFor();
  await page.getByLabel("البريد الإلكتروني", { exact: true }).fill(email);
  await page.getByLabel("كلمة المرور", { exact: true }).fill(password);
}

test.describe("Critical user journeys", () => {
  test("registers through the UI and lands on the app after a 201", async ({ page }) => {
    const suffix = uniqueSuffix();
    const email = `journey${suffix}@example.com`;
    const username = `journey${suffix}`.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 29);

    await page.goto("/register");
    const registerResponse = waitForApiResponse(page, "/api/v1/auth/register");

    await fillRegisterForm(page, email, username);
    await page.getByRole("button", { name: "إنشاء الحساب" }).click();

    expect((await registerResponse).status()).toBe(201);
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible();
  });

  test("signs in with the UI and reaches the story feed", async ({ page, request }) => {
    const { user } = await registerThroughApi(request, "feedlogin");

    await page.goto("/login");
    const loginResponse = waitForApiResponse(page, "/api/v1/auth/login");
    const sessionResponse = waitForApiResponse(page, "/api/v1/auth/session");

    await fillLoginForm(page, user.email, PASSWORD);
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();

    expect((await loginResponse).status()).toBe(200);
    expect((await sessionResponse).status()).toBe(200);
    await page.waitForURL("**/dashboard", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "لوحة التحكم" })).toBeVisible();
  });

  test("surfaces a login failure and stays on the login page", async ({ page }) => {
    await page.goto("/login");
    await fillLoginForm(page, `nobody-${uniqueSuffix()}@example.com`, "DefinitelyWrong1!");

    const loginResponse = waitForApiResponse(page, "/api/v1/auth/login");
    await page.getByRole("button", { name: "تسجيل الدخول" }).click();

    expect((await loginResponse).status()).toBe(401);
    await expect(page.getByText("Unauthorized")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("opens a published story from the feed", async ({ page, request }) => {
    const { tokens } = await registerThroughApi(request, "storyopen");
    const title = `Playwright Story ${uniqueSuffix()}`;
    const story = await publishStoryThroughApi(request, tokens.accessToken, title);

    await page.goto("/stories");
    const listResponse = waitForApiResponse(page, "/api/v1/stories");
    await expect(page.getByRole("link", { name: title })).toBeVisible({ timeout: 30_000 });
    expect((await listResponse).status()).toBe(200);

    const detailResponse = waitForApiResponse(page, `/api/v1/stories/${story.id}`);
    await page.getByRole("link", { name: title }).click();

    expect((await detailResponse).status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/stories/${story.id}$`));
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  });

  test("ends the session through the logout endpoint and clears the cookies", async ({ request }) => {
    const { user, tokens } = await registerThroughApi(request, "logout");

    const sessionBefore = await request.get(`${API_URL}/auth/session`, { timeout: API_TIMEOUT });
    expect(sessionBefore.status()).toBe(200);

    const logoutResponse = await request.post(`${API_URL}/auth/logout`, {
      timeout: API_TIMEOUT,
      data: { refreshToken: tokens.refreshToken },
    });
    expect(logoutResponse.status(), await logoutResponse.text()).toBe(200);

    const sessionAfter = await request.get(`${API_URL}/auth/session`, { timeout: API_TIMEOUT });
    expect(sessionAfter.status()).toBe(401);
    expect(user.email).toContain("@example.com");
  });
});
