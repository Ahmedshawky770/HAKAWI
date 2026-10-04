/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider, useToast } from "@/components/providers/ToastProvider";
import { render } from "@testing-library/react";

function Trigger() {
  const { notify } = useToast();
  return (
    <div>
      <button type="button" onClick={() => notify("تم نشر حكايتك", "success")}>
        success
      </button>
      <button type="button" onClick={() => notify("تعذّر تسجيل التفاعل", "error")}>
        error
      </button>
      <button type="button" onClick={() => notify("معلومة")}>
        info
      </button>
    </div>
  );
}

function renderToast() {
  return render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

describe("ToastProvider", () => {
  it("announces politely, so it never interrupts what is being read", async () => {
    const user = userEvent.setup();
    const { container } = renderToast();

    const region = container.querySelector("[aria-live='polite']");
    expect(region).not.toBeNull();
    // Deliberately NOT `role="status"`: an always-present empty status region
    // makes every `getByRole("status")` in the product ambiguous.
    expect(region).not.toHaveAttribute("role", "status");

    await user.click(screen.getByRole("button", { name: "info" }));

    expect(region).toHaveTextContent("معلومة");
  });

  it("escalates a failure to an alert", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "error" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("تعذّر تسجيل التفاعل");
  });

  it("does not escalate a confirmation", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "success" }));

    expect(await screen.findByText("تم نشر حكايتك")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("colours each tone with its semantic tokens, so it follows the theme", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "error" }));

    const alert = await screen.findByRole("alert");
    expect(alert.className).toContain("text-error-ink");
    expect(alert.className).toContain("bg-error-soft");
  });

  it("is dismissable by the reader", async () => {
    const user = userEvent.setup();
    renderToast();

    await user.click(screen.getByRole("button", { name: "info" }));
    await user.click(await screen.findByRole("button", { name: /معلومة/ }));

    expect(screen.queryByText("معلومة")).not.toBeInTheDocument();
  });

  it("stacks several messages instead of replacing the earlier one", async () => {
    const user = userEvent.setup();
    const { container } = renderToast();

    await user.click(screen.getByRole("button", { name: "info" }));
    await user.click(screen.getByRole("button", { name: "success" }));

    const region = container.querySelector("[aria-live='polite']");
    expect(region).toHaveTextContent("معلومة");
    expect(region).toHaveTextContent("تم نشر حكايتك");
  });
});
