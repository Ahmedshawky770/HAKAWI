import { describe, expect, it } from "vitest";

import { countReadout } from "@/lib/count-readout";

describe("countReadout", () => {
  it("formats zero in English as '0 other'", () => {
    expect(countReadout(0, "en", { other: "items" })).toEqual({
      count: "0",
      label: "items",
    });
  });

  it("formats one in English as '1 item'", () => {
    expect(countReadout(1, "en", { one: "item", other: "items" })).toEqual({
      count: "1",
      label: "item",
    });
  });

  it("formats two in English as '2 items'", () => {
    expect(countReadout(2, "en", { one: "item", other: "items" })).toEqual({
      count: "2",
      label: "items",
    });
  });

  it("formats Arabic with Eastern Arabic digits disabled", () => {
    const out = countReadout(1500, "ar", { other: "قصص" });
    expect(out.count).toBe("1,500");
    expect(out.label).toBe("قصص");
  });

  it("uses the Arabic 'one' form for 1", () => {
    const out = countReadout(1, "ar", { one: "قصة", other: "قصص" });
    expect(out.count).toBe("1");
    expect(out.label).toBe("قصة");
  });

  it("uses the Arabic 'two' form for 2", () => {
    const out = countReadout(2, "ar", { two: "قصتان", other: "قصص" });
    expect(out.count).toBe("2");
    expect(out.label).toBe("قصتان");
  });

  it("falls back to 'other' when the category has no form", () => {
    const out = countReadout(5, "en", { one: "item", other: "items" });
    expect(out.label).toBe("items");
  });

  it("always uses 'other' when it is the only form", () => {
    const out = countReadout(42, "en", { other: "items" });
    expect(out.label).toBe("items");
  });
});
