import { describe, expect, it } from "vitest";
import { differenceHash, hashDistance, laplacianVariance, toGrey } from "@/lib/photo-tools";

function noise(width: number, height: number, seed = 1) {
  let state = seed;
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i += 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    grey[i] = (state / 4294967296) * 255;
  }
  return grey;
}

describe("laplacianVariance", () => {
  it("is zero for a flat image and high for noise", () => {
    expect(laplacianVariance(new Float32Array(100 * 100).fill(120), 100, 100)).toBe(0);
    expect(laplacianVariance(noise(100, 100), 100, 100)).toBeGreaterThan(1000);
  });
  it("drops when an image is smoothed", () => {
    const sharp = noise(64, 64);
    const smooth = new Float32Array(sharp);
    for (let pass = 0; pass < 3; pass += 1) {
      const copy = new Float32Array(smooth);
      for (let y = 1; y < 63; y += 1) for (let x = 1; x < 63; x += 1) {
        const i = y * 64 + x;
        smooth[i] = (copy[i] + copy[i - 1] + copy[i + 1] + copy[i - 64] + copy[i + 64]) / 5;
      }
    }
    expect(laplacianVariance(smooth, 64, 64)).toBeLessThan(laplacianVariance(sharp, 64, 64) / 10);
  });
  it("handles tiny images", () => {
    expect(laplacianVariance(new Float32Array(4), 2, 2)).toBe(0);
  });
});

describe("toGrey", () => {
  it("weights green most", () => {
    const grey = toGrey(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]), 3, 1);
    expect(grey[1]).toBeGreaterThan(grey[0]);
    expect(grey[0]).toBeGreaterThan(grey[2]);
  });
});

describe("differenceHash and hashDistance", () => {
  it("is 16 hex characters and stable", () => {
    const grid = noise(9, 8, 7);
    expect(differenceHash(grid)).toMatch(/^[0-9a-f]{16}$/);
    expect(differenceHash(grid)).toBe(differenceHash(new Float32Array(grid)));
  });
  it("is unchanged by brightening", () => {
    const grid = noise(9, 8, 3);
    const brighter = grid.map((value) => value + 20);
    expect(hashDistance(differenceHash(grid), differenceHash(brighter))).toBe(0);
  });
  it("differs a lot for unrelated images", () => {
    expect(hashDistance(differenceHash(noise(9, 8, 1)), differenceHash(noise(9, 8, 99)))).toBeGreaterThan(10);
  });
  it("counts bits", () => {
    expect(hashDistance("0000000000000000", "000000000000000f")).toBe(4);
    expect(hashDistance("ffffffffffffffff", "0000000000000000")).toBe(64);
    expect(hashDistance("abc", "abcd")).toBe(64);
  });
});
