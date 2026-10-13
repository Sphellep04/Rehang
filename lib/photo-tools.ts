/** Pure image maths used by the photo uploader. No browser APIs here, so it can be unit tested. */

/** Greyscale (0 to 255) from RGBA pixels. */
export function toGrey(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Float32Array {
  const grey = new Float32Array(width * height);
  for (let i = 0; i < grey.length; i += 1) {
    grey[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  }
  return grey;
}

/**
 * Variance of the Laplacian: sharp photos have strong edges so the value is high, blurry ones are low.
 * Measured on a small copy of the photo (about 256 pixels) so the result does not depend on camera size.
 */
export function laplacianVariance(grey: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value = grey[i - width] + grey[i + width] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  const mean = sum / count;
  return sumSquares / count - mean * mean;
}

/** Below this the photo is probably blurry. A warning only, never a block, because dark or plain items score low too. */
export const BLUR_THRESHOLD = 40;

/** "Difference hash": compares each pixel with its right neighbour on a 9 by 8 greyscale grid. Returns 16 hex characters. */
export function differenceHash(grey9x8: Float32Array): string {
  let bits = "";
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      bits += grey9x8[y * 9 + x] < grey9x8[y * 9 + x + 1] ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) hex += Number.parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

/** Number of differing bits between two 16 character hashes. Small numbers mean near identical photos. */
export function hashDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let x = Number.parseInt(a[i], 16) ^ Number.parseInt(b[i], 16);
    while (x) { distance += x & 1; x >>= 1; }
  }
  return distance;
}

/** Same threshold as the database uses when it compares against other sellers. */
export const DUPLICATE_DISTANCE = 4;
