/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test-utils/render";
import { UnreadBadge } from "@/components/layout/UnreadBadge";

describe("UnreadBadge", () => {
  it("shows nothing when there is nothing unread", () => {
    renderWithProviders(<UnreadBadge count={0} label="unread notifications" />);

    expect(screen.queryByText(/unread notifications/)).not.toBeInTheDocument();
  });

  it("shows the count", () => {
    renderWithProviders(<UnreadBadge count={3} label="unread notifications" />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("caps the visible number so the badge keeps its shape", () => {
    renderWithProviders(<UnreadBadge count={120} label="unread notifications" />);

    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("says what is being counted, once, for a screen reader", () => {
    renderWithProviders(<UnreadBadge count={3} label="unread notifications" />);

    // The visible digits are decoration: the sentence carries the number AND
    // the thing, so a reader hears "3 unread notifications" rather than "3 3".
    expect(screen.getByText("3 unread notifications")).toBeInTheDocument();
  });
});
