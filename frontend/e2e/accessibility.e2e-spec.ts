import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function scan(page: Page): Promise<{ id: string; impact: string | null; nodes: number }[]> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    nodes: violation.nodes.length,
  }));
}

test.describe("Accessibility of the authentication pages", () => {
  test("the login page has no detectable WCAG A and AA violations", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("heading", { name: "تسجيل الدخول" }).waitFor();

    expect(await scan(page)).toEqual([]);
  });

  test("the register page has no detectable WCAG A and AA violations", async ({ page }) => {
    await page.goto("/register");
    await page.getByRole("heading", { name: "إنشاء حساب جديد" }).waitFor();

    expect(await scan(page)).toEqual([]);
  });

  test("the login page labels every form control", async ({ page }) => {
    await page.goto("/login");

    // `exact` is required because "كلمة المرور" is a substring of "تأكيد كلمة المرور";
    // the default substring match resolves to both inputs and trips a strict-mode violation.
    const email = page.getByLabel("البريد الإلكتروني", { exact: true });
    const password = page.getByLabel("كلمة المرور", { exact: true });

    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeVisible();
  });

  test("the register page labels all five fields of the form", async ({ page }) => {
    await page.goto("/register");

    const labels = [
      "الاسم الكامل",
      "اسم المستخدم",
      "البريد الإلكتروني",
      "كلمة المرور",
      "تأكيد كلمة المرور",
    ];

    for (const label of labels) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
  });
});
