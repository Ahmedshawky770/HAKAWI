/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ui/Button", () => ({__esModule: true, default: {to: "/", className: ""}}));
vi.mock("@/components/ui/Card", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/EmptyState", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/ErrorMessage", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Loading", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Skeleton", () => ({__esModule: true, default: "div"}));
vi.mock("@/components/ui/Avatar", () => ({__esModule: true, default: "div"}));

import { AnchorLink, router } from "@/test-utils/navigation-mock";
import { messageOnlySchema } from "@/lib/schemas";
import { api } from "@/lib/api";
import ResetPasswordPage from "@/app/reset-password/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

vi.mock("@/lib/api", () => ({
  api: {
    request: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);
const PASSWORD = "NewSecurePass123!";
const SUCCESS_TEXT = "تم إعادة تعيين كلمة المرور بنجاح! جاري التحويل لتسجيل الدخول...";

function setResetToken(token: string) {
  window.history.replaceState({}, "", token ? `/reset-password?token=${token}` : "/reset-password");
}

async function fillForm(user: ReturnType<typeof userEvent.setup>, confirmation = PASSWORD) {
  await user.type(screen.getByLabelText("كلمة المرور الجديدة"), PASSWORD);
  await user.type(screen.getByLabelText("تأكيد كلمة المرور الجديدة"), confirmation);
}

describe("reset password page", () => {
  const scheduledRedirects: Array<() => void> = [];
  let restoreTimeout: () => void = () => undefined;

  beforeEach(() => {
    setResetToken("reset-token-1");
    mockedApi.request.mockResolvedValue({ message: "Password reset successfully" });
    scheduledRedirects.length = 0;

    const realSetTimeout: typeof globalThis.setTimeout = globalThis.setTimeout;
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation((handler, ms) => {
      if (ms === 3000 && typeof handler === "function") {
        scheduledRedirects.push(() => {
          handler();
        });
        return realSetTimeout(() => undefined, 0);
      }
      return realSetTimeout(handler, ms);
    });
    restoreTimeout = () => {
      timeoutSpy.mockRestore();
    };
  });

  afterEach(() => {
    restoreTimeout();
    setResetToken("");
  });

  it("renders the reset heading and both password fields", () => {
    render(<ResetPasswordPage />);
    expect(screen.getByRole("heading", { name: "إعادة تعيين كلمة المرور" })).toBeInTheDocument();
    expect(screen.getByLabelText("كلمة المرور الجديدة")).toBeRequired();
    expect(screen.getByLabelText("تأكيد كلمة المرور الجديدة")).toBeRequired();
  });

  it("rejects a mismatched confirmation without calling the API", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await fillForm(user, "AnotherPass123!");
    await user.click(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" }));

    expect(await screen.findByText("كلمتا المرور غير متطابقتين")).toBeInTheDocument();
    expect(mockedApi.request).not.toHaveBeenCalled();
  });

  it("rejects a link without a token", async () => {
    const user = userEvent.setup();
    setResetToken("");
    render(<ResetPasswordPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" }));

    expect(await screen.findByText("رابط إعادة التعيين غير صالح")).toBeInTheDocument();
    expect(mockedApi.request).not.toHaveBeenCalled();
  });

  it("posts the token and the new password through the message only schema", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" }));

    await waitFor(() => {
      expect(mockedApi.request).toHaveBeenCalledWith(
        messageOnlySchema,
        "/auth/reset-password",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ token: "reset-token-1", password: PASSWORD }),
        }),
      );
    });
  });

  it("confirms the reset and hides the form", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" }));

    expect(await screen.findByText(SUCCESS_TEXT)).toBeInTheDocument();
    expect(screen.queryByLabelText("كلمة المرور الجديدة")).not.toBeInTheDocument();
  });

  it("redirects to the login page after a successful reset", async () => {
    const user = userEvent.setup();
    render(<ResetPasswordPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" }));

    await screen.findByText(SUCCESS_TEXT);
    expect(scheduledRedirects).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();

    scheduledRedirects[0]?.();
    expect(router.push).toHaveBeenCalledWith("/login");
  });

  it("renders the server failure of a rejected token", async () => {
    const user = userEvent.setup();
    mockedApi.request.mockRejectedValue(new Error("Invalid or expired reset token"));
    render(<ResetPasswordPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" }));

    expect(await screen.findByText("Invalid or expired reset token")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("renders a schema rejection of a malformed server response", async () => {
    const user = userEvent.setup();
    mockedApi.request.mockRejectedValue(new Error("Invalid server response: message"));
    render(<ResetPasswordPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" }));

    expect(await screen.findByText("Invalid server response: message")).toBeInTheDocument();
  });

  it("keeps the recovery form after a failure so the request can be retried", async () => {
    const user = userEvent.setup();
    mockedApi.request.mockRejectedValue(new Error("Invalid or expired reset token"));
    render(<ResetPasswordPage />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" }));

    await screen.findByText("Invalid or expired reset token");
    expect(screen.getByLabelText("كلمة المرور الجديدة")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إعادة تعيين كلمة المرور" })).toBeEnabled();
  });
});
