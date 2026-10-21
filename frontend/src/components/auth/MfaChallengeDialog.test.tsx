/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test-utils/render";
import { stringsFor } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/preferences";
import { MfaChallengeDialog } from "@/components/auth/MfaChallengeDialog";

const authStrings = stringsFor(DEFAULT_LOCALE).auth;

/**
 * THE SECOND FACTOR, ASKED FOR AT THE MOMENT IT IS NEEDED.
 *
 * Some actions demand one — the financial routes, the moderation routes, the admin
 * break-glass one — and the API refuses a caller who has an admin role unless the request
 * carries a TOTP code or a backup code.
 *
 * It is asked for HERE, and not at sign-in: a second factor is a step up, not a condition
 * of being signed in. Most of what a reader does does not need one, and asking for a code
 * every time the app opens would train them to type codes into fields they do not
 * understand.
 */
describe("MfaChallengeDialog", () => {
  it("is a dialog that names the step", () => {
    renderWithProviders(<MfaChallengeDialog open onSubmit={vi.fn()} onClose={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName(authStrings.mfaChallengeTitle);
  });

  it("asks for a code and hands it over", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderWithProviders(<MfaChallengeDialog open onSubmit={onSubmit} onClose={vi.fn()} />);

    await user.type(screen.getByLabelText(authStrings.mfaCodeLabel), "123456");
    await user.click(screen.getByRole("button", { name: authStrings.mfaChallengeConfirm }));

    expect(onSubmit).toHaveBeenCalledWith("123456");
  });

  it("will not hand over an empty code", async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn();
    renderWithProviders(<MfaChallengeDialog open onSubmit={onSubmit} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: authStrings.mfaChallengeConfirm }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the error from the last attempt", () => {
    renderWithProviders(
      <MfaChallengeDialog open onSubmit={vi.fn()} onClose={vi.fn()} error={authStrings.mfaInvalidCode} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(authStrings.mfaInvalidCode);
  });

  it("leaves on Escape", async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    renderWithProviders(<MfaChallengeDialog open onSubmit={vi.fn()} onClose={onClose} />);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("moves the focus into the field, because the field is what the panel is about", async () => {
    renderWithProviders(<MfaChallengeDialog open onSubmit={vi.fn()} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(authStrings.mfaCodeLabel)).toHaveFocus();
    });
  });

  it("renders nothing at all when it is closed", () => {
    renderWithProviders(<MfaChallengeDialog open={false} onSubmit={vi.fn()} onClose={vi.fn()} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
