/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithProviders } from "@/test-utils/render";
import { CheckoutDialog } from "@/components/commerce/CheckoutDialog";
import { AR, EN } from "@/lib/i18n/checkout";

const SESSION = {
  checkoutUrl: "https://accept.paymob.com/acceptance/iframes/abc",
  acceptUrl: "https://accept.paymob.com/acceptance/accepts/abc",
};

function renderDialog(props: Partial<React.ComponentProps<typeof CheckoutDialog>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();

  renderWithProviders(
    <CheckoutDialog
      open
      title="Buy the book"
      amount="25.00 ج.م"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );

  return { onConfirm, onClose };
}

describe("CheckoutDialog", () => {
  it("is a modal dialog with a name", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("Buy the book");
  });

  it("asks the reader how they want to pay, and never for an identifier", () => {
    renderDialog();

    expect(screen.getByRole("radio", { name: /بطاقة ائتمانية/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /محفظة إلكترونية/ })).toBeInTheDocument();
    // The identifier the old form demanded was a fact about the gateway.
    expect(screen.queryByLabelText(/معرّف/)).not.toBeInTheDocument();
  });

  it("speaks about the choice in both languages, with the same keys", () => {
    // The choice is the reader's, so it has to be said in the reader's language — and the two
    // dictionaries have to carry the same words, or one of them falls back to a key nobody sees.
    expect(Object.keys(EN)).toEqual(Object.keys(AR));
    expect(AR.cardLabel).not.toBe(EN.cardLabel);
    expect(AR.walletLabel).not.toBe(EN.walletLabel);
  });

  it("sends the chosen method, not the default one", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("radio", { name: /محفظة إلكترونية/ }));
    await user.click(screen.getByRole("button", { name: "متابعة الدفع" }));

    expect(onConfirm).toHaveBeenCalledWith("wallet");
  });

  it("shows the amount that is about to be charged", () => {
    renderDialog({ amount: "140.00 ج.م" });

    expect(screen.getByText("140.00 ج.م")).toBeInTheDocument();
  });

  it("frames the gateway and offers the hosted page beside it", () => {
    renderDialog({ session: SESSION });

    const frame = screen.getByTitle("بوابة الدفع");
    expect(frame).toHaveAttribute("src", SESSION.checkoutUrl);
    expect(screen.getByRole("link", { name: /افتح صفحة الدفع/ })).toHaveAttribute(
      "href",
      SESSION.acceptUrl,
    );
  });

  it("sandboxes the framed gateway page", () => {
    renderDialog({ session: SESSION });

    // The framed document is a third party's page. Without a sandbox it is
    // fully privileged: it can navigate this window out of the dialog and
    // submit a form to any origin.
    expect(screen.getByTitle("بوابة الدفع")).toHaveAttribute("sandbox");
  });

  it("refuses a gateway URL that is not the gateway's own", () => {
    renderDialog({
      session: {
        checkoutUrl: "https://evil.example.com/acceptance/iframes/abc",
        acceptUrl: "https://evil.example.com/acceptance/accepts/abc",
      },
    });

    // A URL is an instruction to the browser, and an API response is not a
    // place to take that instruction from without a check.
    expect(screen.queryByTitle("بوابة الدفع")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /افتح صفحة الدفع/ })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("leaves on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing while it is closed", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /**
   * THE FOCUS TRAP, AND THE GAP IN IT.
   *
   * The trap used to act only when the focus was on the FIRST or the LAST focusable element, so
   * it did nothing when the focus was somewhere else entirely — including on `document.body`,
   * which is where the focus lands when the panel swaps the radio group for the gateway block and
   * the control that had the focus is removed with it. Tab then moved the focus into the PAGE
   * BEHIND the modal, which is the one thing a modal must not let a keyboard do.
   */
  describe("the focus trap", () => {
    const focusableIn = (dialog: HTMLElement): HTMLElement[] =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
        ),
      );

    it("pulls the focus back when it has escaped to the page behind", () => {
      renderDialog();
      const dialog = screen.getByRole("dialog");
      const [first] = focusableIn(dialog);

      // The focus is inside the panel when it opens...
      expect(dialog.contains(document.activeElement)).toBe(true);

      // ...and it can leave it without the reader asking for that.
      const outside = document.createElement("button");
      document.body.appendChild(outside);
      outside.focus();
      expect(document.activeElement).toBe(outside);

      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      document.dispatchEvent(event);

      // The browser's own move is refused, and the focus comes back to the first control in the
      // panel — a reader using a keyboard must not be able to tab into the page behind a modal.
      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);
      expect(dialog.contains(document.activeElement)).toBe(true);

      outside.remove();
    });

    it("pulls the focus back on Shift+Tab as well", () => {
      renderDialog();
      const dialog = screen.getByRole("dialog");
      const [first] = focusableIn(dialog);

      const outside = document.createElement("button");
      document.body.appendChild(outside);
      outside.focus();

      const event = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(first);

      outside.remove();
    });

    it("still wraps the focus at both ends of the panel", () => {
      renderDialog();
      const dialog = screen.getByRole("dialog");
      const focusable = focusableIn(dialog);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      first.focus();
      const backwards = new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(backwards);
      expect(document.activeElement).toBe(last);

      last.focus();
      const forwards = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
      document.dispatchEvent(forwards);
      expect(document.activeElement).toBe(first);
    });
  });
});
