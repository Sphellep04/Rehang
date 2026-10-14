import type { SupabaseClient } from "@supabase/supabase-js";
import { BLUR_THRESHOLD, differenceHash, laplacianVariance, toGrey } from "./photo-tools";

/** Browser-only helpers. Import these from client components only. */

export type PhotoKind = "front" | "back" | "label" | "flaw" | "tags" | "other";
export type PhotoSize = "thumb" | "card" | "full";
export const SIZE_PIXELS: Record<PhotoSize, number> = { thumb: 320, card: 720, full: 1600 };

export type PhotoPaths = Record<PhotoSize, string>;

export type PhotoEntry = {
  id: string;
  kind: PhotoKind;
  previewUrl: string;
  width: number;
  height: number;
  phash: string | null;
  blurry: boolean;
  /** "new" photos still have to be uploaded; "existing" ones are already stored and keep their files. */
  source: { type: "new"; blobs: Record<PhotoSize, Blob> } | { type: "existing"; paths: PhotoPaths };
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MIN_SIDE = 600;

async function decode(file: File): Promise<ImageBitmap> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`${file.name} is too large. Use a photo under 25 MB.`);
  const looksHeic = /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
  if (looksHeic) {
    // iPhone photos. The converter is large, so it only loads when someone actually picks one.
    const { heicTo, isHeic } = await import("heic-to/csp");
    if (await isHeic(file)) {
      try {
        return await heicTo({ blob: file, type: "bitmap" });
      } catch {
        throw new Error(`${file.name} could not be read. Try taking the photo again or choosing a JPEG.`);
      }
    }
  }
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(`${file.name} is not a photo this browser can read. Use a JPEG, PNG, WebP or iPhone photo.`);
  }
}

function drawn(bitmap: ImageBitmap, width: number, height: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser could not prepare the photo. Try another browser.");
  context.drawImage(bitmap, 0, 0, width, height);
  return context;
}

function measure(bitmap: ImageBitmap): { blurry: boolean; phash: string } {
  const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(3, Math.round(bitmap.width * scale));
  const h = Math.max(3, Math.round(bitmap.height * scale));
  const big = drawn(bitmap, w, h).getImageData(0, 0, w, h);
  const variance = laplacianVariance(toGrey(big.data, w, h), w, h);
  const small = drawn(bitmap, 9, 8).getImageData(0, 0, 9, 8);
  return { blurry: variance < BLUR_THRESHOLD, phash: differenceHash(toGrey(small.data, 9, 8)) };
}

async function encode(bitmap: ImageBitmap, size: PhotoSize): Promise<{ blob: Blob; width: number; height: number }> {
  const ratio = Math.min(1, SIZE_PIXELS[size] / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * ratio);
  const height = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not prepare the photo. Try another browser.");
  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error("This browser could not save the photo as WebP. Try another browser.");
  return { blob, width, height };
}

/** Reads a chosen file, checks it, measures blur and a fingerprint, and makes the three upload sizes. Re-encoding also removes location data. */
export async function preparePhoto(file: File, kind: PhotoKind): Promise<PhotoEntry> {
  const bitmap = await decode(file);
  try {
    if (Math.min(bitmap.width, bitmap.height) < MIN_SIDE) {
      throw new Error(`${file.name}: use a photo at least ${MIN_SIDE} pixels on its shortest side.`);
    }
    const { blurry, phash } = measure(bitmap);
    const [thumb, card, full] = await Promise.all([encode(bitmap, "thumb"), encode(bitmap, "card"), encode(bitmap, "full")]);
    return {
      id: crypto.randomUUID(),
      kind,
      previewUrl: URL.createObjectURL(card.blob),
      width: full.width,
      height: full.height,
      phash,
      blurry,
      source: { type: "new", blobs: { thumb: thumb.blob, card: card.blob, full: full.blob } },
    };
  } finally {
    bitmap.close();
  }
}

export const slotOrder: PhotoKind[] = ["front", "back", "label", "flaw", "tags", "other"];

export function inListingOrder(entries: PhotoEntry[]): PhotoEntry[] {
  return [...entries].sort((a, b) => slotOrder.indexOf(a.kind) - slotOrder.indexOf(b.kind));
}

async function uploadOnce(supabase: SupabaseClient, path: string, blob: Blob) {
  return supabase.storage.from("item-photos").upload(path, blob, { contentType: "image/webp", upsert: false });
}

/**
 * Uploads every new photo, reusing the stored files of existing ones. Returns the rows to hand to set_item_photos
 * and the list of files uploaded now, so they can be removed again if saving fails.
 */
export async function uploadEntries(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  entries: PhotoEntry[],
  onProgress: (done: number, total: number) => void,
): Promise<{ rows: Record<string, unknown>[]; uploaded: string[] }> {
  const ordered = inListingOrder(entries);
  const uploaded: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const total = ordered.filter((entry) => entry.source.type === "new").length;
  let done = 0;
  onProgress(0, total);

  try {
    for (const entry of ordered) {
      if (entry.source.type === "existing") {
        const { paths } = entry.source;
        rows.push({ kind: entry.kind, path_thumb: paths.thumb, path_card: paths.card, path_full: paths.full, width: entry.width, height: entry.height, phash: entry.phash });
        continue;
      }
      const paths: PhotoPaths = { thumb: "", card: "", full: "" };
      for (const size of ["thumb", "card", "full"] as PhotoSize[]) {
        const path = `${userId}/${itemId}/${crypto.randomUUID()}-${size}.webp`;
        let result = await uploadOnce(supabase, path, entry.source.blobs[size]);
        if (result.error) result = await uploadOnce(supabase, path, entry.source.blobs[size]);
        if (result.error) throw new Error("A photo could not be uploaded. Check your connection and try again.");
        uploaded.push(path);
        paths[size] = path;
      }
      rows.push({ kind: entry.kind, path_thumb: paths.thumb, path_card: paths.card, path_full: paths.full, width: entry.width, height: entry.height, phash: entry.phash });
      done += 1;
      onProgress(done, total);
    }
  } catch (error) {
    if (uploaded.length) await supabase.storage.from("item-photos").remove(uploaded);
    throw error;
  }
  return { rows, uploaded };
}
