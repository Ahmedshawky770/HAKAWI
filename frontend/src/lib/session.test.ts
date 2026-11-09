import { describe, expect, it, vi, beforeEach } from "vitest";

import { clearUnobservedQueries, startSession } from "@/lib/session";
import { STORED_USER_FIXTURE } from "@/test-utils/fixtures-session";

const mockSetStoredUser = vi.hoisted(() => vi.fn());
const mockClearStoredUser = vi.hoisted(() => vi.fn());
const mockLogout = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", () => ({
  api: { logout: mockLogout },
  clearStoredUser: mockClearStoredUser,
  setStoredUser: mockSetStoredUser,
}));

describe("clearUnobservedQueries", () => {
  it("removes queries that have no observers", () => {
    const remove = vi.fn();
    const getObserversCount = vi.fn(() => 0);
    const getAll = vi.fn(() => [{ getObserversCount, remove }]);
    const getQueryCache = vi.fn(() => ({ getAll, remove }));

    const queryClient = { getQueryCache } as unknown as ReturnType<
      typeof import("@tanstack/react-query").useQueryClient
    >;

    clearUnobservedQueries(queryClient);

    expect(remove).toHaveBeenCalled();
  });

  it("keeps queries that have observers", () => {
    const remove = vi.fn();
    const getObserversCount = vi.fn(() => 1);
    const getAll = vi.fn(() => [{ getObserversCount, remove }]);
    const getQueryCache = vi.fn(() => ({ getAll, remove }));

    const queryClient = { getQueryCache } as unknown as ReturnType<
      typeof import("@tanstack/react-query").useQueryClient
    >;

    clearUnobservedQueries(queryClient);

    expect(remove).not.toHaveBeenCalled();
  });
});

describe("startSession", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("clears the query cache before storing the user", () => {
    const clear = vi.fn();

    const queryClient = { clear } as unknown as ReturnType<
      typeof import("@tanstack/react-query").useQueryClient
    >;

    startSession(queryClient, STORED_USER_FIXTURE);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(mockSetStoredUser).toHaveBeenCalledWith(STORED_USER_FIXTURE);
    expect(clear.mock.invocationCallOrder[0]).toBeLessThan(
      mockSetStoredUser.mock.invocationCallOrder[0],
    );
  });
});
