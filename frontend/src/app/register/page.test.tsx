/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils/render";
import userEvent from "@testing-library/user-event";

import { AnchorLink, router } from "@/test-utils/navigation-mock";
import { createDeferred } from "@/test-utils/support";
import { AUTH_RESPONSE, AUTH_USER, SESSION_RESPONSE } from "@/test-utils/fixtures";
import { api, setStoredUser } from "@/lib/api";
import { stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";
import { type OAuthProvider } from "@hakawi/shared-types";
import RegisterPage from "@/app/register/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/api", () => ({
  API_URL: "http://localhost:3001/api/v1",
  api: {
    register: vi.fn(),
    getSession: vi.fn(),
  },
  setStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedSetStoredUser = vi.mocked(setStoredUser);

const authStrings = stringsFor(DEFAULT_LOCALE).auth;

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: authStrings.oauthGoogle,
  facebook: authStrings.oauthFacebook,
  github: authStrings.oauthGithub,
  apple: authStrings.oauthApple,
  tiktok: authStrings.oauthTiktok,
};

const PASSWORD = "SecurePass123!";

async function fillForm(user: ReturnType<typeof userEvent.setup>, confirmPassword = PASSWORD) {
  await user.type(screen.getByLabelText("الاسم الكامل"), "أحمد محمد");
  await user.type(screen.getByLabelText("اسم المستخدم"), "ahmed");
  await user.type(screen.getByLabelText("البريد الإلكتروني"), "ahmed@example.com");
  await user.type(screen.getByLabelText("كلمة المرور"), PASSWORD);
  await user.type(screen.getByLabelText("تأكيد كلمة المرور"), confirmPassword);
}

describe("register page", () => {
  beforeEach(() => {
    mockedApi.register.mockResolvedValue(AUTH_RESPONSE);
    mockedApi.getSession.mockResolvedValue(SESSION_RESPONSE);
  });

  it("renders the registration heading and a link back to login", () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByRole("heading", { name: "إنشاء حساب جديد" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تسجيل الدخول" })).toHaveAttribute("href", "/login");
  });

  it("renders the registration title as the only level one heading", () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByRole("heading", { level: 1, name: "إنشاء حساب جديد" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows the wordmark without linking it to the authenticated home", () => {
    const { container } = renderWithProviders(<RegisterPage />);
    expect(container).toHaveTextContent("حكاوي");
    expect(screen.queryByRole("link", { name: /^حكاوي/ })).not.toBeInTheDocument();
  });

  it("renders every required field of the registration form", () => {
    renderWithProviders(<RegisterPage />);
    for (const label of ["الاسم الكامل", "اسم المستخدم", "البريد الإلكتروني", "كلمة المرور", "تأكيد كلمة المرور"]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveAttribute("type", "email");
    expect(screen.getByLabelText("كلمة المرور")).toHaveAttribute("type", "password");
  });

  it("offers one link per social provider below the registration form", () => {
    const { container } = renderWithProviders(<RegisterPage />);

    const links = Object.values(PROVIDER_LABELS).map((label) =>
      screen.getAllByRole("link", { name: label })
    );

    // Each provider gets exactly one link.
    for (const linkGroup of links) {
      expect(linkGroup).toHaveLength(1);
    }

    // The links sit outside the registration form: they must not submit it.
    const form = container.querySelector("form");
    expect(form).toBeInTheDocument();
    for (const linkGroup of links) {
      expect(form).not.toContain(linkGroup[0]);
    }
  });

  it("points every social link at the provider's handshake route", () => {
    renderWithProviders(<RegisterPage />);

    for (const [provider, label] of Object.entries(PROVIDER_LABELS)) {
      expect(
        screen.getByRole("link", { name: label })
      ).toHaveAttribute("href", expect.stringContaining(`/auth/oauth/${provider}`));
    }
  });

  it("surfaces a mismatch message inside an alert region", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RegisterPage />);

    await fillForm(user, "DifferentPass123!");
    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("كلمتا المرور غير متطابقتين");
  });

  it("rejects a mismatched password confirmation without calling the API", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RegisterPage />);

    await fillForm(user, "DifferentPass123!");
    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    expect(await screen.findByText("كلمتا المرور غير متطابقتين")).toBeInTheDocument();
    expect(mockedApi.register).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("keeps the mismatch error visible while the form stays filled", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RegisterPage />);

    await fillForm(user, "DifferentPass123!");
    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    await screen.findByText("كلمتا المرور غير متطابقتين");
    expect(screen.getByLabelText("البريد الإلكتروني")).toHaveValue("ahmed@example.com");
  });

  it("accepts a matching confirmation and registers the account", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RegisterPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    await waitFor(() => {
      expect(mockedApi.register).toHaveBeenCalledWith({
        name: "أحمد محمد",
        username: "ahmed",
        email: "ahmed@example.com",
        password: PASSWORD,
      });
    });
  });

  it("stores the session user and moves to the authenticated home after registering", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RegisterPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/");
    });
    expect(mockedSetStoredUser).toHaveBeenCalledWith({ ...AUTH_USER });
  });

  it("never navigates to the removed dashboard route", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<RegisterPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalled();
    });
    expect(router.push).not.toHaveBeenCalledWith("/dashboard");
  });

  it("says a duplicate account in the reader's language, not the server's", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.register.mockRejectedValue(new Error("Email already registered"));
    renderWithProviders(<RegisterPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    // The server's English wording is a fact about the API. The reader is told
    // what it means for them, in their language.
    expect(await screen.findByText(/هذا البريد الإلكتروني مسجّل بالفعل/)).toBeInTheDocument();
    expect(screen.queryByText("Email already registered")).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("falls back to a readable sentence for a failure it does not recognise", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.register.mockRejectedValue(new Error("password"));
    renderWithProviders(<RegisterPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    expect(await screen.findByText(/تعذّر إتمام العملية/)).toBeInTheDocument();
    expect(screen.queryByText("password")).not.toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight", async () => {
    const user = userEvent.setup({ delay: null });
    const deferred = createDeferred<typeof AUTH_RESPONSE>();
    mockedApi.register.mockReturnValue(deferred.promise);
    renderWithProviders(<RegisterPage />);

    await fillForm(user);
    const submit = screen.getByRole("button", { name: "إنشاء الحساب" });
    await user.click(submit);

    await waitFor(() => {
      expect(submit).toBeDisabled();
    });

    deferred.resolve(AUTH_RESPONSE);
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
  });

  it("clears a previous error when the form is submitted again", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.register.mockRejectedValueOnce(new Error("Email already registered"));
    renderWithProviders(<RegisterPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
    expect(await screen.findByText(/هذا البريد الإلكتروني مسجّل بالفعل/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));

    await waitFor(() => {
      expect(screen.queryByText(/هذا البريد الإلكتروني مسجّل بالفعل/)).not.toBeInTheDocument();
    });
  });
});
