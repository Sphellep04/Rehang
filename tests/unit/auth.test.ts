import { describe, expect, it } from "vitest";
import { emailSchema, passwordSchema, safeNext } from "@/lib/auth";

describe("safeNext", () => {
  it("keeps paths inside the site", () => {
    expect(safeNext("/orders/123?tab=a")).toBe("/orders/123?tab=a");
  });
  it.each(["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", undefined, 42])("rejects %s", (value) => {
    expect(safeNext(value)).toBe("/");
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
