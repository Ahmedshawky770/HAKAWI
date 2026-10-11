/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink, router } from "@/test-utils/navigation-mock";
import { createDeferred } from "@/test-utils/support";
import { AUTH_RESPONSE, AUTH_USER, SESSION_RESPONSE } from "@/test-utils/fixtures";
import { api, setStoredUser } from "@/lib/api";
import LoginPage from "@/app/login/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/api", () => ({
  api: {
    login: vi.fn(),
    getSession: vi.fn(),
  },
  setStoredUser: vi.fn(),
}));

const mockedApi = vi.mocked(api);
const mockedSetStoredUser = vi.mocked(setStoredUser);

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
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "إنشاء حساب جديد" })).toHaveAttribute("href", "/register");
  });

  it("renders the login title as the only level one heading", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { level: 1, name: "تسجيل الدخول" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("shows the wordmark without linking it to the authenticated home", () => {
    const { container } = render(<LoginPage />);
    expect(container).toHaveTextContent("حكاوي");
    expect(screen.queryByRole("link", { name: "حكاوي - الصفحة الرئيسية" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^حكاوي/ })).not.toBeInTheDocument();
  });

  it("renders a labelled email field that is required and of type email", () => {
    render(<LoginPage />);
    const email = screen.getByLabelText("البريد الإلكتروني");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toBeRequired();
    expect(email).toHaveValue("");
  });

  it("renders a labelled password field that is required and masked", () => {
    render(<LoginPage />);
    const password = screen.getByLabelText("كلمة المرور");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toBeRequired();
  });

  it("offers a link to the password recovery flow", () => {
    render(<LoginPage />);
    expect(screen.getByRole("link", { name: "نسيت كلمة المرور؟" })).toHaveAttribute("href", "/forgot-password");
  });

  it("shows no error before the form is submitted", () => {
    render(<LoginPage />);
    expect(screen.queryByText("Unauthorized")).not.toBeInTheDocument();
  });

  it("submits the typed credentials", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await waitFor(() => {
      expect(mockedApi.login).toHaveBeenCalledWith({
        email: "ahmed@example.com",
        password: "SecurePass123!",
      });
    });
  });

  it("stores the session user and moves to the authenticated home after a successful login", async () => {
    const user = userEvent.setup({ delay: null });
    render(<LoginPage />);

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
    render(<LoginPage />);

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
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
  });

  it("does not navigate when the credentials are rejected", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValue(new Error("Invalid email or password"));
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(mockedSetStoredUser).not.toHaveBeenCalled();
  });

  it("surfaces the unauthorized message of an expired session", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValue(new Error("Unauthorized"));
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight", async () => {
    const user = userEvent.setup({ delay: null });
    const deferred = createDeferred<typeof AUTH_RESPONSE>();
    mockedApi.login.mockReturnValue(deferred.promise);
    render(<LoginPage />);

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
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تسجيل الدخول" })).toBeEnabled();
  });

  it("clears a previous error when the form is submitted again", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValueOnce(new Error("Invalid email or password"));
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await waitFor(() => {
      expect(screen.queryByText("Invalid email or password")).not.toBeInTheDocument();
    });
  });

  it("does not call the session endpoint when the login itself fails", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.login.mockRejectedValue(new Error("Invalid email or password"));
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    await screen.findByText("Invalid email or password");
    expect(mockedApi.getSession).not.toHaveBeenCalled();
  });

  it("reports a failure of the session lookup after a successful login", async () => {
    const user = userEvent.setup({ delay: null });
    mockedApi.getSession.mockRejectedValue(new Error("Invalid session"));
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "تسجيل الدخول" }));

    expect(await screen.findByText("Invalid session")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
