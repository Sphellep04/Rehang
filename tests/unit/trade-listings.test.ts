import { describe, expect, it } from "vitest";
import { parseFilters } from "@/lib/listings";
import { dollarsToCents, formatWindhoek, toWindhoekIso, tradeError } from "@/lib/trade";

describe("trade helpers", () => {
  it("maps known and unknown error codes", () => {
    expect(tradeError("offer_too_low")).toContain("60%");
    expect(tradeError("nope")).toBe("Something went wrong. Please try again.");
    expect(tradeError(undefined)).toBe("Something went wrong. Please try again.");
  });
  it("converts whole dollars only", () => {
    expect(dollarsToCents("150")).toBe(15000);
    expect(dollarsToCents("12.5")).toBeNull();
    expect(dollarsToCents("-3")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
  });
  it("treats Windhoek as UTC+2", () => {
    expect(toWindhoekIso("2026-10-14", "10:00")).toBe("2026-10-14T10:00:00+02:00");
    expect(formatWindhoek("2026-10-14T22:30:00Z", { hour: "2-digit", minute: "2-digit", hour12: false })).toBe("00:30");
  });
});

describe("parseFilters", () => {
  it("uses safe defaults", () => {
    const filters = parseFilters(new URLSearchParams());
    expect(filters.sort).toBe("newest");
    expect(filters.page).toBe(1);
  });
  it("ignores unknown sorts, conditions and silly pages", () => {
    const filters = parseFilters(new URLSearchParams("sort=hax&condition=broken&page=99999"));
    expect(filters.sort).toBe("newest");
    expect(filters.condition).toBeUndefined();
    expect(filters.page).toBe(1);
  });
  it("reads the town and trims it", () => {
    expect(parseFilters({ town: "  Swakopmund " }).town).toBe("Swakopmund");
    expect(parseFilters({}).town).toBeUndefined();
  });
  it("reads valid values", () => {
    const filters = parseFilters({ q: "denim", condition: "good", sort: "price_asc", page: "3" });
    expect(filters).toMatchObject({ q: "denim", condition: "good", sort: "price_asc", page: 3 });
  });
});
