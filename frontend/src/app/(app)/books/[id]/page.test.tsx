/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink, router } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { BOOK } from "@/test-utils/fixtures";
import BookDetailPage from "@/app/(app)/books/[id]/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "book-1" }),
  useRouter: () => router,
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();
const originalLocation = Object.getOwnPropertyDescriptor(window, "location");

const CHECKOUT = {
  paymentId: "payment-1",
  orderId: "order-1",
  checkoutUrl: "https://accept.paymob.com/acceptance/iframes/abc",
  acceptUrl: "https://accept.paymob.com/acceptance/accepts/abc",
  status: "pending",
};

beforeEach(() => {
  fetchMock.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { assign: vi.fn() },
  });
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.setItem(
    "hakawi_user",
    JSON.stringify({ id: "user-1", email: "a@b.c", name: "أحمد" }),
  );
});

afterEach(() => {
  if (originalLocation) Object.defineProperty(window, "location", originalLocation);
  window.localStorage.clear();
});

function lastCall(): { input: string; init?: RequestInit } | undefined {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return call ? { input: call[0], init: call[1] } : undefined;
}

/**
 * The body of the call that went to a given path.
 *
 * Not "the last call": starting a payment invalidates the book, so a refetch
 * follows it, and the last call is the refetch.
 */
function bodySentTo(path: string): string {
  const call = fetchMock.mock.calls.find(([input]) => String(input).includes(path));
  return String(call?.[1]?.body ?? "");
}

describe("book detail page", () => {
  it("announces a loading state while the book is in flight", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<BookDetailPage />);

    expect(screen.getByText("جارٍ التحميل…")).toBeInTheDocument();
  });

  it("requests the book of the route parameter", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    await screen.findByRole("heading", { level: 1, name: BOOK.title });
    expect(lastCall()?.input).toContain("/books/book-1");
  });

  it("renders the title as the one level one heading, with the author and the price", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
    expect(screen.getByText(`بواسطة ${BOOK.author}`)).toBeInTheDocument();
    expect(screen.getByText("25.00 ج.م")).toHaveClass("hk-numeric");
  });

  it("offers a way back to the catalogue", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    expect(await screen.findByRole("link", { name: /العودة للكتب/ })).toHaveAttribute("href", "/books");
  });

  it("quotes the default rental length from the shared daily rate", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    await screen.findByRole("heading", { level: 1, name: BOOK.title });
    expect(screen.getByText(/ج\.م \/ 14 يوم/)).toBeInTheDocument();
  });

  it("re-quotes the rental when another length is chosen", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة الإيجار" }), "30");

    expect(screen.getByText(/ج\.م \/ 30 يوم/)).toBeInTheDocument();
  });

  it("offers every rental length the shared vocabulary allows", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    const values = Array.from(
      screen.getByRole("combobox", { name: "مدة الإيجار" }).querySelectorAll("option"),
    ).map((option) => option.value);
    expect(values).toEqual(["1", "3", "7", "14", "30", "90"]);
  });

  it("never asks the reader for a payment-method identifier", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    // The identifier is a fact about the GATEWAY. A reader has never seen one
    // and cannot know one, so the field is gone rather than optional.
    expect(screen.queryByLabelText("معرّف طريقة الدفع")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("pm_123456")).not.toBeInTheDocument();
  });

  it("opens a checkout that asks how the reader wants to pay", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "اشترِ الكتاب" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /بطاقة ائتمانية/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /محفظة إلكترونية/ })).toBeInTheDocument();
  });

  it("charges the chosen method and opens the gateway", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));
    fetchMock.mockResolvedValueOnce(jsonResponse(BOOK)).mockResolvedValueOnce(jsonResponse(CHECKOUT));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "اشترِ الكتاب" }));
    await userEvent.click(await screen.findByRole("radio", { name: /محفظة إلكترونية/ }));
    await userEvent.click(screen.getByRole("button", { name: "متابعة الدفع" }));

    await waitFor(() => {
      expect(bodySentTo("/purchase")).not.toBe("");
    });
    // WHAT THE PAGE IS RESPONSIBLE FOR: the reader's CHOICE reaches the API — "card" or
    // "wallet", never a gateway identifier the reader could not know. The KEY the body carries it
    // under belongs to the API client (`src/lib/api.ts`), so the assertion is on the value.
    const purchaseBody = JSON.parse(bodySentTo("/purchase")) as Record<string, unknown>;
    expect(purchaseBody.paymentMethod ?? purchaseBody.paymentMethodId).toBe("wallet");
    // The gateway is a FRAME: `checkoutUrl` is Paymob's iframe target, and the
    // hosted page is offered beside it for a browser that refuses the frame.
    const frame = await screen.findByTitle("بوابة الدفع");
    expect(frame).toHaveAttribute("src", CHECKOUT.checkoutUrl);
    expect(screen.getByRole("link", { name: /افتح صفحة الدفع/ })).toHaveAttribute(
      "href",
      CHECKOUT.acceptUrl,
    );
  });

  it("rents with the chosen length and the same gateway contract", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));
    fetchMock.mockResolvedValueOnce(jsonResponse(BOOK)).mockResolvedValueOnce(jsonResponse(CHECKOUT));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "مدة الإيجار" }), "7");
    await userEvent.click(screen.getByRole("button", { name: "استئجار الكتاب" }));
    await userEvent.click(await screen.findByRole("button", { name: "متابعة الدفع" }));

    await waitFor(() => {
      expect(bodySentTo("/rent")).toContain('"durationDays":7');
    });
    const frame = await screen.findByTitle("بوابة الدفع");
    expect(frame).toHaveAttribute("src", CHECKOUT.checkoutUrl);
  });

  it("surfaces a refused payment inline and in a toast, never in an alert dialog", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(BOOK))
      .mockResolvedValueOnce(jsonResponse({ message: "Payment method declined" }, 402));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    await userEvent.click(screen.getByRole("button", { name: "اشترِ الكتاب" }));
    await userEvent.click(await screen.findByRole("button", { name: "متابعة الدفع" }));

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((alert) => alert.textContent?.includes("لم تكتمل عملية الدفع"))).toBe(true);
    expect(screen.queryByTitle("بوابة الدفع")).not.toBeInTheDocument();
  });

  it("reports a failed load with a retry", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ message: "Book not found" }, 404))
      .mockResolvedValueOnce(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent("لم نعثر على ما تبحث عنه");

    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { level: 1, name: BOOK.title })).toBeInTheDocument();
  });

  it("makes the owner delete two steps, and says what is about to happen", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    // The first press arms the control; nothing is deleted yet.
    await userEvent.click(screen.getByRole("button", { name: /حذف الكتاب/ }));
    expect(screen.getByRole("button", { name: /تأكيد الحذف/ })).toBeInTheDocument();
    expect(screen.getByText("سيُحذف الكتاب نهائياً. لا يمكن التراجع عن هذه الخطوة.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: /تأكيد الحذف/ }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => call[1]?.method === "DELETE")).toBe(true);
    });
  });

  it("does not reach for a stock palette", async () => {
    fetchMock.mockResolvedValue(jsonResponse(BOOK));

    const { container } = renderWithProviders(<BookDetailPage />);
    await screen.findByRole("heading", { level: 1, name: BOOK.title });

    expect(container.innerHTML).not.toMatch(/text-gray-|bg-white|bg-blue-|text-red-6/);
  });
});
