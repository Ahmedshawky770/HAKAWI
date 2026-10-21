/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test-utils/render";
import { RetrySurface } from "@/components/ui/RetrySurface";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

describe("RetrySurface", () => {
  it("names the failure in the reader's language", () => {
    renderWithProviders(<RetrySurface errorCode="network" />);

    expect(screen.getByRole("alert")).toHaveTextContent("تعذّر الاتصال بالإنترنت");
  });

  it("offers a retry, which is the only way out of a server-rendered failure", () => {
    renderWithProviders(<RetrySurface errorCode="unknown" />);

    expect(screen.getByRole("button", { name: "أعد المحاولة" })).toBeInTheDocument();
  });
});
