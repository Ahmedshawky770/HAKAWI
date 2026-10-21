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
import { ApiError } from "@/lib/errors";
import { renderCaptcha } from "@/lib/captcha";
import { stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";
import { type OAuthProvider } from "@hakawi/shared-types";
import LoginPage from "@/app/login/page";

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
    login: vi.fn(),
    getSession: vi.fn(),
  },
  setStoredUser: vi.fn(),
}));

/**
 * THE VERIFICATION WIDGET, WITHOUT THE THIRD PARTY.
 *
 * The widget is drawn by a script the provider serves, and a test must not fetch it. So
 * the loader is replaced by one that resolves, and the renderer by one that hands back a
 * token — which is all the sign-in screen actually uses.
 */
vi.mock("@/lib/captcha", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/captcha")>();
  return {
    ...original,
    loadCaptchaScript: vi.fn().mockResolvedValue(undefined),
    renderCaptcha: vi.fn((_provider, _container, _siteKey, onToken) => {
      // The real widget calls the callback with its token; the mock has to do the
      // same, or the sign-in screen never learns that there is an answer to send.
      onToken("token-from-widget");
      return "widget-1";
    }),
    removeCaptcha: vi.fn(),
    resetCaptcha: vi.fn(),
  };
});

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

async function fillCredentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("البريد الإلكتروني"), "ahmed@example.com");
  await user.type(screen.getByLabelText("كلمة المرور"), "SecurePass123!");
}

describe("login page", () => {
  beforeEach(() => {
    mockedApi.login.mockResolvedValue(AUTH_RESPONSE);
    mockedApi.getSession.mockResolvedValue(SESSION_RESPONSE);
  });

  it("renders the login heading and the sign up link", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole("heading", { name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "إنشاء حساب جديد" })).toHaveAttribute("href", "/register");
  });

  it("renders the login title as the only level one heading", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1, name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows the wordmark without linking it to the authenticated home", () => {
    const { container } = renderWithProviders(<LoginPage />);
    expect(container).toHaveTextContent("حكاوي");
    expect(screen.queryByRole("link", { name: "حكاوي - الصفحة الرئيسية" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^حكاوي/ })).not.toBeInTheDocument();
  });

  it("renders a labelled email field that is required and of type email", () => {
    renderWithProviders(<LoginPage />);
    const email = screen.getByLabelText("البريد الإلكتروني");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toBeRequired();
    expect(email).toHaveValue("");
  });

  it("renders a labelled password field that is required and masked", () => {
    renderWithProviders(<LoginPage />);
    const password = screen.getByLabelText("كلمة المرور");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toBeRequired();
  });

  it("offers one link per social provider below the password form", () => {
    const { container } = renderWithProviders(<LoginPage />);

    const links = Object.values(PROVIDER_LABELS).map((label) =>
      screen.getAllByRole("link", { name: label })
    );

    // Each provider gets exactly one link.
    for (const linkGroup of links) {
      expect(linkGroup).toHaveLength(1);
    }

    // The links sit outside the password form: they must not submit it.
    const form = container.querySelector("form");
    expect(form).toBeInTheDocument();
    for (const linkGroup of links) {
      expect(form).not.toContain(linkGroup[0]);
    }
  });

  it("points every social link at the provider's handshake route", () => {
    renderWithProviders(<LoginPage />);

    for (const [provider, label] of Object.entries(PROVIDER_LABELS)) {
      expect(
        screen.getByRole("link", { name: label })
      ).toHaveAttribute("href", expect.stringContaining(`/auth/oauth/${provider}`));
    }
  });

  it("offers a link to the password recovery flow", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole("link", { name: "نسيت كلمة المرور؟" })).toHaveAttribute("href", "/forgot-password");
  });

  it("shows no error before the form is submitted", () => {
    renderWithProviders(<LoginPage />);
    expect(screen.queryByText(/انتهت جلستك/)).not.toBeInTheDocument();
  });

  it("submits the typed credentials", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await waitFor(() => {
      expect(mockedApi.login).toHaveBeenCalledWith({
        email: "ahmed@example.com",
        password: "SecurePass123!",
        // There is no verification yet: the server has not asked for one.
        captchaToken: null,
      });
    });
  });

  /**
   * THE SERVER ASKS FOR A VERIFICATION, AND THE READER IS SHOWN ONE.
   *
   * The server refuses a sign-in that is under a watch with a 401 and a body naming the
   * provider and the site key. The refusal used to be shown as "that password is wrong",
   * which sent the reader looking for a typo instead of a verification — and the sign-in
   * could not be completed at all, because there was no way to answer the server.
   */
  it("draws the verification the server asks for, and sends the token", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValueOnce(
      new ApiError("CAPTCHA verification required", 401, {
        captchaRequired: true,
        captchaProvider: "turnstile",
        captchaSiteKey: "site-key-1",
        endsSession: false,
      }),
    );
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    // The widget is drawn, with the provider and the key the server named.
    await waitFor(() => {
      expect(renderCaptcha).toHaveBeenCalledWith(
        "turnstile",
        expect.anything(),
        "site-key-1",
        expect.any(Function),
      );
    });
    expect(screen.getByText(authStrings.captchaLabel)).toBeInTheDocument();

    // And the answer is sent with the next attempt.
    mockedApi.login.mockResolvedValueOnce(AUTH_RESPONSE);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await waitFor(() => {
      expect(mockedApi.login).toHaveBeenLastCalledWith({
        email: "ahmed@example.com",
        password: "SecurePass123!",
        captchaToken: "token-from-widget",
      });
    });
  });

  it("stores the session user and moves to the authenticated home after a successful login", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/");
    });
    expect(mockedApi.getSession).toHaveBeenCalledTimes(1);
    expect(mockedSetStoredUser).toHaveBeenCalledWith({ ...AUTH_USER });
  });

  it("never navigates to the removed dashboard route", async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalled();
    });
    expect(router.push).not.toHaveBeenCalledWith("/dashboard");
  });

  it("surfaces a rejected credential message inside an alert region", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValue(new Error("Invalid email or password"));
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    // The server's own English is a fact about the API, not an explanation for
    // the reader, and it does not belong on an Arabic screen.
    expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
  });

  it("does not navigate when the credentials are rejected", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValue(new Error("Invalid email or password"));
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByText(/البريد الإلكتروني أو كلمة المرور غير صحيحة/)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(mockedSetStoredUser).not.toHaveBeenCalled();
  });

  it("surfaces the unauthorized message of an expired session", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValue(new Error("Unauthorized"));
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByText(/انتهت جلستك/)).toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight", async () => {
    const user = userEvent.setup({ delay: null });
    const deferred = createDeferred<typeof AUTH_RESPONSE>();
    mockedApi.login.mockReturnValue(deferred.promise);
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    const submit = screen.getByRole("button", { name: "تسجيل الدخول" });
    await user.click(submit);

    await waitFor(() => {
      expect(submit).toBeDisabled();
    });

    deferred.resolve(AUTH_RESPONSE);
    await waitFor(() => {
      expect(submit).toBeEnabled();
    });
  });

  it("re-enables the submit button after a failure", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValue(new Error("Invalid email or password"));
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByText(/البريد الإلكتروني أو كلمة المرور غير صحيحة/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تسجيل الدخول" })).toBeEnabled();
  });

  it("clears a previous error when the form is submitted again", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValueOnce(new Error("Invalid email or password"));
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    expect(await screen.findByText(/البريد الإلكتروني أو كلمة المرور غير صحيحة/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await waitFor(() => {
      expect(screen.queryByText(/البريد الإلكتروني أو كلمة المرور غير صحيحة/)).not.toBeInTheDocument();
    });
  });

  it("does not call the session endpoint when the login itself fails", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValue(new Error("Invalid email or password"));
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await screen.findByText(/البريد الإلكتروني أو كلمة المرور غير صحيحة/);
    expect(mockedApi.getSession).not.toHaveBeenCalled();
  });

  it("reports a failure of the session lookup after a successful login", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.getSession.mockRejectedValue(new Error("Invalid session"));
    renderWithProviders(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByText(/انتهت جلستك/)).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
