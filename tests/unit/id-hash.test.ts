import { afterEach, describe, expect, it } from "vitest";
import { hashIdNumber, isPlausibleIdNumber, normaliseIdNumber } from "@/lib/id-hash";

const pepper = "a".repeat(40);
afterEach(() => { delete process.env.ID_HASH_PEPPER; });

describe("ID number hashing", () => {
  it("normalises spaces, dashes and case", () => {
    expect(normaliseIdNumber("ab-123 456")).toBe("AB123456");
  });
  it("checks plausibility", () => {
    expect(isPlausibleIdNumber("12345")).toBe(false);
    expect(isPlausibleIdNumber("AB123456")).toBe(true);
    expect(isPlausibleIdNumber("AB 123456")).toBe(false);
  });
  it("gives the same hash however the number is typed", () => {
    process.env.ID_HASH_PEPPER = pepper;
    expect(hashIdNumber("ab-123 456")).toBe(hashIdNumber("AB123456"));
    expect(hashIdNumber("AB123456")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes with the pepper and refuses a weak one", () => {
    process.env.ID_HASH_PEPPER = pepper;
    const first = hashIdNumber("AB123456");
    process.env.ID_HASH_PEPPER = "b".repeat(40);
    expect(hashIdNumber("AB123456")).not.toBe(first);
    process.env.ID_HASH_PEPPER = "short";
    expect(hashIdNumber("AB123456")).toBeNull();
  });
});
