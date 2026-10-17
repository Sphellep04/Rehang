import { describe, expect, it } from "vitest";
import { listingProblem, type ListingCheck } from "@/lib/listing-rules";

const good: ListingCheck = {
  title: "Zara linen shirt, size M",
  description: "",
  price: 120,
  colourCount: 1,
  condition: "very_good",
  photoKinds: ["front", "back", "label"],
};

describe("listingProblem", () => {
  it("accepts a complete listing", () => {
    expect(listingProblem(good)).toBeNull();
  });
  it.each([
    [{ title: "Too short" }, /Title/],
    [{ title: "x".repeat(61) }, /Title/],
    [{ description: "x".repeat(501) }, /Description/],
    [{ price: 19 }, /Price/],
    [{ price: 20001 }, /Price/],
    [{ price: 12.5 }, /Price/],
    [{ price: Number.NaN }, /Price/],
    [{ colourCount: 0 }, /colour/],
    [{ colourCount: 3 }, /colour/],
    [{ photoKinds: ["front", "back"] }, /front, back and care-label/],
    [{ photoKinds: ["front", "back", "label", "other", "other", "other", "other", "other", "other"] }, /3 to 8/],
    [{ condition: "fair" }, /wear or flaws/],
    [{ condition: "good" }, /wear or flaws/],
    [{ condition: "new_with_tags" }, /tags/],
  ])("refuses %j", (change, message) => {
    expect(listingProblem({ ...good, ...change })).toMatch(message);
  });
  it("accepts a flaw or tags photo when the condition needs it", () => {
    expect(listingProblem({ ...good, condition: "fair", photoKinds: [...good.photoKinds, "flaw"] })).toBeNull();
    expect(listingProblem({ ...good, condition: "new_with_tags", photoKinds: [...good.photoKinds, "tags"] })).toBeNull();
  });
});
