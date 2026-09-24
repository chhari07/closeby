import { describe, expect, it } from "vitest";
import { joinFinals } from "../src/lib/hooks/use-voice-input";

describe("joinFinals", () => {
  it("joins separate phrases (desktop Chrome)", () => {
    expect(joinFinals(["rice 5kg 60", " dal 120", " atta 10kg 350"])).toBe("rice 5kg 60 dal 120 atta 10kg 350");
  });

  it("collapses Android's cumulative repeats", () => {
    expect(joinFinals(["rice", "rice 5kg", "rice 5kg 60"])).toBe("rice 5kg 60");
    expect(joinFinals(["rice 5kg 60", "rice 5kg 60 dal 120"])).toBe("rice 5kg 60 dal 120");
  });

  it("drops an exact repeat of the last phrase", () => {
    expect(joinFinals(["dal 120", "dal 120"])).toBe("dal 120");
  });

  it("ignores empty results", () => {
    expect(joinFinals(["", "  ", "cheeni 1 kilo"])).toBe("cheeni 1 kilo");
  });
});
