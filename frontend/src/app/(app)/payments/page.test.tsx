/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { PAYMENT } from "@/test-utils/fixtures";
import PaymentsPage from "@/app/(app)/payments/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall(): { input: string; init?: RequestInit } | undefined {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return call ? { input: call[0], init: call[1] } : undefined;
}

describe("payments page", () => {
  it("announces a loading state while payments are in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<PaymentsPage />);

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("requests the current user's payment history", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ payments: [PAYMENT], total: 1, page: 1, limit: 20 }),
    );

    renderWithProviders(<PaymentsPage />);

    await screen.findByText(PAYMENT.id);
    expect(lastCall()?.input).toContain("/payments");
  });

  it("renders each payment in a row", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ payments: [PAYMENT], total: 1, page: 1, limit: 20 }),
    );

    renderWithProviders(<PaymentsPage />);

    expect(await screen.findByText(PAYMENT.id)).toBeInTheDocument();
  });

  it("renders each payment in the list", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ payments: [PAYMENT], total: 1, page: 1, limit: 20 }),
    );

    renderWithProviders(<PaymentsPage />);

    expect(await screen.findByText(`${PAYMENT.amount} ${PAYMENT.currency}`)).toBeInTheDocument();
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ payments: [PAYMENT], total: 1, page: 1, limit: 20 }));

    renderWithProviders(<PaymentsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Unauthorized");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByText(PAYMENT.id)).toBeInTheDocument();
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ payments: [PAYMENT], total: 1, page: 1, limit: 20 }),
    );

    const { container } = renderWithProviders(<PaymentsPage />);
    await screen.findByText(PAYMENT.id);

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|text-red-6/);
  });
});
