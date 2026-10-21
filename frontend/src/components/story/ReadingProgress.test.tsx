/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test-utils/render";
import { ReadingProgress } from "@/components/story/ReadingProgress";

/**
 * The reading progress is a scroll measurement, and a scroll measurement needs
 * a scrollable page. The component reads the geometry of the element it is
 * told to watch, so the test gives it one: a body of a known height, and a
 * reader who has not scrolled.
 */
function renderProgress(content = "<p>" + "كلمة ".repeat(400) + "</p>") {
  return renderWithProviders(
    <div>
      <div id="story-body" style={{ height: "4000px" }} />
      <ReadingProgress content={content} targetId="story-body" />
    </div>,
  );
}

describe("ReadingProgress", () => {
  it("says how far through the story the reader is", () => {
    renderProgress();

    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("estimates the time that is left", () => {
    renderProgress();

    // 400 words at 180 words a minute is three minutes; nothing is read yet.
    expect(screen.getByText("بقي 3 دقيقة")).toBeInTheDocument();
  });

  it("does not report a reading time for a story with no words", () => {
    renderProgress("");

    expect(screen.getByText("بقي دقيقة واحدة")).toBeInTheDocument();
  });

  it("labels itself for a screen reader", () => {
    renderProgress();

    expect(screen.getByText("تقدّم القراءة")).toBeInTheDocument();
  });
});
