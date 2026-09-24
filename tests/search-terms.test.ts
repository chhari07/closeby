import { describe, expect, it } from "vitest";
import { matchingTerm, normalizeQuery, queryWords, sanitizeTerms } from "../src/lib/search-terms";

describe("search terms", () => {
  it("normalises the query for matching and caching", () => {
    expect(normalizeQuery("  Kuch   THANDA peene ko ")).toBe("kuch thanda peene ko");
  });

  it("keeps the meaningful words and drops filler", () => {
    expect(queryWords("dal aur chawal chahiye 2 kg")).toEqual(["dal", "chawal"]);
    expect(queryWords("I need some milk for the kids")).toEqual(["milk", "kids"]);
    expect(queryWords("मुझे चावल चाहिए")).toEqual(["मुझे", "चावल", "चाहिए"]);
  });

  it("cleans the AI's terms: short, unique, at most 6", () => {
    expect(sanitizeTerms(["Cold Drink", "cold drink", "juice!", "x", 5, "a very very long product name that is silly", "water", "soda", "lassi", "buttermilk", "tea"])).toEqual([
      "cold drink",
      "juice",
      "water",
      "soda",
      "lassi",
      "buttermilk",
    ]);
    expect(sanitizeTerms("not a list")).toEqual([]);
  });

  it("matches a product by name or alias", () => {
    const rice = { name: "Basmati Rice", aliases: ["chawal", "chaval"] };
    expect(matchingTerm(rice, ["dal", "chawal"])).toBe("chawal");
    expect(matchingTerm(rice, ["rice"])).toBe("rice");
    expect(matchingTerm(rice, ["milk"])).toBeNull();
    expect(matchingTerm({ name: "LED Bulb 9 W" }, ["bulb"])).toBe("bulb");
  });
});

describe("multi-word terms from the AI", () => {
  const charger = { name: "USB-C Fast Charger", aliases: ["charger", "type c charger", "mobile charger"] };
  const cable = { name: "USB-C Cable", aliases: ["type c cable", "data cable", "charging cable"] };
  const batteries = { name: "AA Batteries", aliases: ["battery", "cell", "pencil cell"] };
  const racket = { name: "Mosquito Racket", aliases: ["machhar racket", "mosquito bat"] };
  const kettle = { name: "Electric Kettle", aliases: ["kettle"] };

  it("matches when all but one word is there, with plurals", () => {
    expect(matchingTerm(charger, ["phone charger"])).toBe("phone charger");
    expect(matchingTerm(cable, ["mobile charging cable"])).toBe("mobile charging cable");
    expect(matchingTerm({ name: "AA Batteries" }, ["remote batteries"])).toBe("remote batteries");
    expect(matchingTerm(batteries, ["remote battery"])).toBe("remote battery");
    expect(matchingTerm(racket, ["mosquito bat"])).toBe("mosquito bat");
  });

  it("needs the main (last) word: a 'phone cable' is a cable, not a phone cover", () => {
    expect(matchingTerm({ name: "Phone Back Cover" }, ["phone cable"])).toBeNull();
    expect(matchingTerm({ name: "Power Bank 20000 mAh" }, ["power backup"])).toBeNull();
    expect(matchingTerm(racket, ["mosquito repellent"])).toBeNull();
  });

  it("doesn't match on one word out of three, or on nothing", () => {
    expect(matchingTerm(kettle, ["electric table fan"])).toBeNull();
    expect(matchingTerm(charger, ["cold drink"])).toBeNull();
  });
});

describe("word endings", () => {
  it("allows short endings but not a different word with the same start", () => {
    expect(matchingTerm({ name: "USB-C Cable", aliases: ["charging cable"] }, ["phone charge cable"])).not.toBeNull();
    expect(matchingTerm({ name: "Lightning Cable" }, ["emergency light"])).toBeNull();
    expect(matchingTerm({ name: "Wireless Mouse" }, ["charger wire"])).toBeNull();
  });
});
