import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema, safeNext } from "@/lib/auth";

describe("safeNext", () => {
  it("keeps paths inside the site", () => {
    expect(safeNext("/orders/123?tab=a")).toBe("/orders/123?tab=a");
  });
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", undefined, 42])("rejects %s", (value) => {
    expect(safeNext(value)).toBe("/");
  });
  it.each(["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/ /evil.com", "/\u0000/x", "/\u200b/x\u0085", "/" + "a".repeat(600)])("rejects hidden characters and very long values %#", (value) => {
    expect(safeNext(value)).toBe("/");
  });
  it("still allows ordinary paths with queries and encoded characters", () => {
    expect(safeNext("/browse?town=Windhoek&size=M")).toBe("/browse?town=Windhoek&size=M");
    expect(safeNext("/item/abc%20def")).toBe("/item/abc%20def");
  });
  it("uses the given fallback", () => {
    expect(safeNext("https://evil.com", "/browse")).toBe("/browse");
  });
});

describe("password and email rules", () => {
  it("needs 10 characters with a letter and a digit", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("allletterslong").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890123").success).toBe(false);
    expect(passwordSchema.safeParse("goodpass1234").success).toBe(true);
  });
  it("lowercases and trims email", () => {
    expect(emailSchema.parse("  Ann@Example.COM ")).toBe("ann@example.com");
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});
