/// <reference types="@testing-library/jest-dom/vitest" />

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnchorLink, router } from "@/test-utils/navigation-mock";
import { renderWithProviders } from "@/test-utils/render";
import { createDeferred, jsonResponse } from "@/test-utils/support";
import { AUTH_USER, STORY, STORY_RECORD } from "@/test-utils/fixtures";
import StoryDetailPage from "@/app/(app)/stories/[id]/page";

vi.mock("next/link", () => ({
  __esModule: true,
  default: AnchorLink,
}));

const paramsMock = vi.fn<() => { id: string }>();

vi.mock("next/navigation", () => ({
  useParams: () => paramsMock(),
  useRouter: () => router,
}));

const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

/** The story endpoint, matched exactly. `/reactions/stories/:id` also contains
 *  `/stories/:id`, so the reaction URLs are excluded by a lookbehind. */
const STORY_ENDPOINT = /(?<!reactions\/)stories\/[^/?]+(\?|$)/;

beforeEach(() => {
  paramsMock.mockReturnValue({ id: "story-1" });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

/**
 * Answers the story endpoint with `payload` and the two reaction endpoints with
 * the shapes their schemas expect. The page now renders `ReactionBar`, so the
 * story test has three requests in flight rather than one; a single `mockResolved`
 * would feed a story body to the reaction counts and every case would fail on a
 * schema rejection it did not mean to test.
 */
function mockStory(payload: unknown = STORY, status = 200): void {
  fetchMock.mockImplementation((input, init) => {
    const url = String(input);
    if (init?.method === "DELETE") {
      // `emptyResponseSchema` is `z.undefined()`: a delete answers 204 with no body.
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (/\/reactions\/stories\/[^/]+\/counts(\?|$)/.test(url)) {
      return Promise.resolve(jsonResponse({ like: payload === STORY ? 42 : 0 }));
    }
    if (/\/reactions\/stories\/[^/]+(\?|$)/.test(url)) {
      return Promise.resolve(jsonResponse({ reactions: [], total: 0, page: 1, limit: 50 }));
    }
    return Promise.resolve(jsonResponse(payload, status));
  });
}

function statusTexts(): (string | null)[] {
  return screen.queryAllByRole("status").map((region) => region.textContent);
}

/**
 * Finds a metadata row by the text of the whole row.
 *
 * `getByText` only concatenates an element's DIRECT text children, so a count and
 * its unit are two nodes by design: the figure sits inside `.hk-numeric` — an LTR
 * isolate, because an unisolated figure reorders next to its Arabic unit — and the
 * unit is the row's own text. The row is what a reader reads, so the row is what is
 * asserted, and the isolated figure inside it is asserted separately.
 */
function countRow(text: string): HTMLElement {
  return screen.getByText((_, element) => element?.textContent?.trim() === text);
}

function lastRequestUrl(): string {
  const [input] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] ?? [];
  return String(input);
}

describe("story detail page", () => {
  it("announces a loading state while the story is fetched", () => {
    fetchMock.mockReturnValue(createDeferred<Response>().promise);

    renderWithProviders(<StoryDetailPage />);

    // `renderWithProviders` mounts the toast region, which is a `role="status"`
    // element of its own — so the assertion is that one of the status regions
    // carries the loading text, not that there is only one status region.
    expect(statusTexts()).toContain("جارٍ التحميل…");
  });

  it("requests the story of the route parameter", async () => {
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { name: STORY.title });
    expect(fetchMock.mock.calls.some(([input]) => STORY_ENDPOINT.test(String(input)))).toBe(true);
    expect(lastRequestUrl()).toContain("/stories/story-1");
  });

  it("renders the story title as the page heading", async () => {
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: STORY.title })).toBeInTheDocument();
  });

  it("renders exactly one level one heading", async () => {
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("renders the story body as markup inside the reading surface", async () => {
    mockStory();

    const { container } = renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.getByText("نص القصة")).toBeInTheDocument();
    // `hk-prose` is a stylesheet rule for the descendants of the container, so it
    // has to be ON the container the API's HTML is injected into.
    expect(container.querySelector(".hk-prose")).toHaveTextContent("نص القصة");
  });

  it("renders the view count, the reaction count and the category", async () => {
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(countRow("1,500 مشاهدة")).toBeInTheDocument();
    expect(countRow("42 تفاعل")).toBeInTheDocument();
    // The figure itself is the isolated numeric run, not the whole phrase.
    expect(countRow("1,500 مشاهدة").querySelector(".hk-numeric")).toHaveTextContent("1,500");
    expect(countRow("42 تفاعل").querySelector(".hk-numeric")).toHaveTextContent("42");
    expect(screen.getByText("fiction")).toBeInTheDocument();
  });

  it("offers the six amber reactions", async () => {
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.getByRole("group", { name: "التفاعلات" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /أعجبني/ })).toBeInTheDocument();
  });

  it("links to the author profile", async () => {
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByRole("link", { name: `بواسطة ${STORY.author.name}` })).toHaveAttribute(
      "href",
      `/users/${STORY.author.id}`,
    );
  });

  it("offers a link back to the story index", async () => {
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByRole("link", { name: /العودة للقصص/ })).toHaveAttribute("href", "/stories");
  });

  it("omits the byline when the author name is missing", async () => {
    mockStory({ ...STORY, author: { id: "user-1", name: "" } });

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
  });

  it("keeps author profile reachable when the author name is missing", async () => {
    mockStory({ ...STORY, author: { id: "user-9", name: null } });

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByRole("link", { name: "ملف الكاتب" })).toHaveAttribute("href", "/users/user-9");
  });

  it("shows the uncategorized affordance when the category is null", async () => {
    mockStory({ ...STORY, category: null });

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.getByText("بدون تصنيف")).toBeInTheDocument();
    expect(screen.queryByText("fiction")).not.toBeInTheDocument();
  });

  it("normalizes a record that carries no author name into a page without a byline", async () => {
    mockStory(STORY_RECORD);

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY_RECORD.title });
    expect(screen.queryByText(/بواسطة/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ملف الكاتب" })).toHaveAttribute("href", `/users/${STORY_RECORD.authorId}`);
  });

  it("normalizes a record that carries an author name into a byline", async () => {
    mockStory({ ...STORY_RECORD, authorName: "أحمد محمد" });

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByRole("link", { name: "بواسطة أحمد محمد" })).toHaveAttribute(
      "href",
      `/users/${STORY_RECORD.authorId}`,
    );
  });

  it("shows the uncategorized affordance for a record without a category", async () => {
    mockStory({ ...STORY_RECORD, categoryId: null });

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY_RECORD.title });
    expect(screen.getByText("بدون تصنيف")).toBeInTheDocument();
  });

  it("renders an empty body note for a story without content", async () => {
    mockStory({ ...STORY, content: null });

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByText("لا يوجد محتوى")).toBeInTheDocument();
  });

  it("normalizes a stored story record into the wire shape the page renders", async () => {
    mockStory(STORY_RECORD);

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByRole("heading", { level: 1, name: STORY_RECORD.title })).toBeInTheDocument();
    expect(countRow("1,500 مشاهدة")).toBeInTheDocument();
    expect(countRow("42 تفاعل")).toBeInTheDocument();
    expect(screen.getByText("fiction")).toBeInTheDocument();
  });

  it("renders the not found message of the server", async () => {
    mockStory({ message: "Story not found" }, 404);

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByText("Story not found")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("renders the unauthorized message of an expired session", async () => {
    mockStory({ message: "Unauthorized" }, 401);

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByText("Unauthorized")).toBeInTheDocument();
  });

  it("renders the schema rejection of a malformed story payload", async () => {
    mockStory({ id: "story-1", title: "ناقص" });

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByText(/^Invalid server response:/)).toBeInTheDocument();
  });

  it("renders the schema rejection of a payload whose counters are strings", async () => {
    mockStory({ ...STORY, views: "1500" });

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByText(/^Invalid server response:/)).toBeInTheDocument();
  });

  it("renders the failure of an unreachable server", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    renderWithProviders(<StoryDetailPage />);

    expect(await screen.findByText("Failed to fetch")).toBeInTheDocument();
  });

  it("recovers when the reader retries a failed story", async () => {
    const user = userEvent.setup({ delay: null });
    mockStory({ message: "Story not found" }, 404);

    renderWithProviders(<StoryDetailPage />);

    await screen.findByText("Story not found");
    mockStory();
    await user.click(screen.getByRole("button", { name: "أعد المحاولة" }));

    expect(await screen.findByRole("heading", { level: 1, name: STORY.title })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offers the owner the edit and delete affordances on their own story", async () => {
    window.localStorage.setItem("hakawi_user", JSON.stringify(AUTH_USER));
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.getByRole("link", { name: /تعديل القصة/ })).toHaveAttribute(
      "href",
      `/stories/${STORY.id}/edit`,
    );
    expect(screen.getByRole("button", { name: /حذف القصة/ })).toBeInTheDocument();
  });

  it("offers no destructive affordance on a story the reader does not own", async () => {
    window.localStorage.setItem("hakawi_user", JSON.stringify({ ...AUTH_USER, id: "user-2" }));
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(screen.queryByRole("button", { name: /حذف القصة/ })).not.toBeInTheDocument();
  });

  it("deletes an owned story only after the delete is confirmed", async () => {
    const user = userEvent.setup({ delay: null });
    window.localStorage.setItem("hakawi_user", JSON.stringify(AUTH_USER));
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });

    const arm = screen.getByRole("button", { name: /حذف القصة/ });
    await user.click(arm);
    expect(screen.getByRole("button", { name: /تأكيد الحذف/ })).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /تأكيد الحذف/ }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/stories");
    });
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => STORY_ENDPOINT.test(String(input)) && init?.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("stops announcing the loading state once the story is rendered", async () => {
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    expect(statusTexts()).not.toContain("جارٍ التحميل…");
  });

  it("fetches the story once per rendered story", async () => {
    mockStory();

    renderWithProviders(<StoryDetailPage />);

    await screen.findByRole("heading", { level: 1, name: STORY.title });
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => STORY_ENDPOINT.test(String(input)))).toHaveLength(1);
    });
  });
});