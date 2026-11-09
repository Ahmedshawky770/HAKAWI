import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  notifySessionChanged,
  notifySessionLost,
  onSessionChanged,
  onSessionLost,
} from "@/lib/session-events";

describe("session-events", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe("notifySessionLost / onSessionLost", () => {
  it("delivers the error to all listeners", () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    const unsubscribe1 = onSessionLost(listener1);
    const unsubscribe2 = onSessionLost(listener2);

    notifySessionLost(new Error("session expired"));

    expect(listener1).toHaveBeenCalledWith(new Error("session expired"));
    expect(listener2).toHaveBeenCalledWith(new Error("session expired"));

    unsubscribe1();
    unsubscribe2();
    notifySessionLost(new Error("second"));
    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

    it("does not crash when a listener throws", () => {
      const throwing = vi.fn(() => {
        throw new Error("boom");
      });
      const safe = vi.fn();
      onSessionLost(throwing);
      onSessionLost(safe);

      expect(() => notifySessionLost(new Error("x"))).not.toThrow();
      expect(safe).toHaveBeenCalled();
    });

    it("works with no listeners", () => {
      expect(() => notifySessionLost()).not.toThrow();
    });

    it("passes undefined error when none provided", () => {
      const listener = vi.fn();
      onSessionLost(listener);
      notifySessionLost();
      expect(listener).toHaveBeenCalledWith(undefined);
    });
  });

  describe("notifySessionChanged / onSessionChanged", () => {
    it("notifies all listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      onSessionChanged(listener1);
      onSessionChanged(listener2);

      notifySessionChanged();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("stops notifying after unsubscribe", () => {
      const listener = vi.fn();
      const unsubscribe = onSessionChanged(listener);

      notifySessionChanged();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      notifySessionChanged();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("works with no listeners", () => {
      expect(() => notifySessionChanged()).not.toThrow();
    });

    it("does not crash when a listener throws", () => {
      const throwing = vi.fn(() => {
        throw new Error("boom");
      });
      const safe = vi.fn();
      onSessionChanged(throwing);
      onSessionChanged(safe);

      expect(() => notifySessionChanged()).not.toThrow();
      expect(safe).toHaveBeenCalled();
    });
  });
});
