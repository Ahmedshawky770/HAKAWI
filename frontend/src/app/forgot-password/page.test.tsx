/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/Button", () => ({__esModule: true, default: {to: "/", className: ""}}));
vi.mock("@/components/ui/Card", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/EmptyState", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/ErrorMessage", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Loading", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Skeleton", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Avatar", () => ({__esModule: true, default: "div"}));

import { AnchorLink } from "@/test-utils/navigation-mock";
import { createDeferred } from "@/test-utils/support";
import { messageOnlySchema } from "@/lib/schemas";
import { api } from "@/lib/api";
import ForgotPasswordPage from "@/app/forgot-password/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("@/lib/api", () => ({
  api: {
    request: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);
const SUCCESS_TEXT = "إذا كان هناك حساب بهذا البريد الإلكتروني، فقد أرسلنا رابط إعادة تعيين كلمة المرور.";

describe("forgot password page", () => {
  beforeEach(() => {
    mockedApi.request.mockResolvedValue({ message: "reset link sent" });
  });

  it("renders the recovery heading and the email field", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("heading", { name: "استعادة كلمة المرور" })).toBeInTheDocument();
    expect(screen.getByLabelText("البريد الإلكتروني")).toBeRequired();
  });

  it("offers a link back to the login page", () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole("link", { name: "العودة لتسجيل الدخول" })).toHaveAttribute("href", "/login");
  });

  it("posts the email through the message only schema", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("البريد الإلكتروني"), "ahmed@example.com");
    await user.click(screen.getByRole("button", { name: "إرسال رابط إعادة التعيين" }));

    await waitFor(() => {
      expect(mockedApi.request).toHaveBeenCalledWith(
        messageOnlySchema,
        "/auth/forgot-password",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "ahmed@example.com" }),
        }),
      );
    });
  });

  it("confirms the request with a neutral message that leaks no account existence", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("البريد الإلكتروني"), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: "إرسال رابط إعادة التعيين" }));

    expect(await screen.findByText(SUCCESS_TEXT)).toBeInTheDocument();
  });

  it("hides the form once the request succeeds", async () => {
    const user = userEvent.setup();
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("البريد الإلكتروني"), "ahmed@example.com");
    await user.click(screen.getByRole("button", { name: "إرسال رابط إعادة التعيين" }));

    await screen.findByText(SUCCESS_TEXT);
    expect(screen.queryByLabelText("البريد الإلكتروني")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إرسال رابط إعادة التعيين" })).not.toBeInTheDocument();
  });

  it("renders the server failure and keeps the form available for a retry", async () => {
    const user = userEvent.setup();
    mockedApi.request.mockRejectedValue(new Error("Too many requests"));
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("البريد الإلكتروني"), "ahmed@example.com");
    await user.click(screen.getByRole("button", { name: "إرسال رابط إعادة التعيين" }));

    expect(await screen.findByText("Too many requests")).toBeInTheDocument();
    expect(screen.getByLabelText("البريد الإلكتروني")).toBeInTheDocument();
  });

  it("disables the submit button while the request is in flight", async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{ message: string }>();
    mockedApi.request.mockReturnValue(deferred.promise);
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("البريد الإلكتروني"), "ahmed@example.com");
    const submit = screen.getByRole("button", { name: "إرسال رابط إعادة التعيين" });
    await user.click(submit);

    await waitFor(() => {
      expect(submit).toBeDisabled();
    });

    deferred.resolve({ message: "reset link sent" });
    await screen.findByText(SUCCESS_TEXT);
  });
});
