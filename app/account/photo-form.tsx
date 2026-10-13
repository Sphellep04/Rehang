"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;

/** Crops to a centred square and re-encodes as WebP. This also strips location data (EXIF) from the photo. */
async function toSquareWebp(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode"))), "image/webp", 0.82));
}

export function PhotoForm({ userId, currentUrl, name }: { userId: string; currentUrl: string | null; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Please choose a photo.");
    if (file.size > MAX_INPUT_BYTES) return setError("That photo is too large. Choose one under 8 MB.");

    setBusy(true);
    setError("");
    setDone(false);
    try {
      const blob = await toSquareWebp(file);
      const supabase = createClient();
      const path = `${userId}/${crypto.randomUUID()}.webp`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp" });
      if (uploadError) throw new Error("upload");
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: rpcError } = await supabase.rpc("set_profile_photo", { p_url: data.publicUrl });
      if (rpcError) throw new Error("save");
      setDone(true);
      router.refresh();
    } catch {
      setError("We couldn't update your photo. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="order-form photo-form">
      <h3>Profile photo</h3>
      <div className="photo-form-row">
        <span className="shop-avatar photo-form-avatar">
          {currentUrl ? <Image src={currentUrl} alt={`${name}'s profile photo`} width={72} height={72} unoptimized /> : <span>{name.charAt(0).toUpperCase()}</span>}
        </span>
        <div>
          <label className="button button-outline" htmlFor="photo-input">{busy ? "Uploading…" : currentUrl ? "Change photo" : "Add a photo"}</label>
          <input id="photo-input" className="sr-only" type="file" accept="image/*" disabled={busy} onChange={(event) => void onChange(event)} />
          <p className="trade-hint">A clear face photo helps buyers trust you. It is cropped to a square and location data is removed.</p>
        </div>
      </div>
      {done && <p className="trade-success" role="status">Photo updated.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
