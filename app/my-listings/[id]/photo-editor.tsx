"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadEntries, type PhotoEntry, type PhotoPaths } from "@/lib/photo-client";
import { tradeError } from "@/lib/trade";
import { PhotoPicker } from "../../_components/photo-picker";

export type StoredPhoto = { id: string; kind: PhotoEntry["kind"]; previewUrl: string; paths: PhotoPaths; width: number; height: number; phash: string | null };

export function PhotoEditor({ itemId, condition, stored }: { itemId: string; condition: string; stored: StoredPhoto[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState<PhotoEntry[]>(() =>
    stored.map((photo) => ({ id: photo.id, kind: photo.kind, previewUrl: photo.previewUrl, width: photo.width, height: photo.height, phash: photo.phash, blurry: false, source: { type: "existing", paths: photo.paths } })),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaved(false);
    const has = (kind: string) => entries.some((entry) => entry.kind === kind);
    if (entries.length < 3 || entries.length > 8 || !has("front") || !has("back") || !has("label")) return setMessage("Keep front, back and care-label photos. Listings need 3 to 8 photos.");
    if ((condition === "good" || condition === "fair") && !has("flaw")) return setMessage("Add a photo showing the item's wear or flaws.");
    if (condition === "new_with_tags" && !has("tags")) return setMessage("Add a photo showing the original tags.");

    setBusy(true);
    setMessage("");
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your sign-in expired. Sign in again to save.");
      const { rows, uploaded } = await uploadEntries(supabase, user.id, itemId, entries, (done, total) => setMessage(total ? `Uploading photo ${Math.min(done + 1, total)} of ${total}…` : ""));
      setMessage("Saving…");
      const { data: unused, error } = await supabase.rpc("set_item_photos", { p_item: itemId, p_photos: rows });
      if (error) {
        if (uploaded.length) await supabase.storage.from("item-photos").remove(uploaded);
        throw new Error(tradeError(error.message));
      }
      // The old files are only deleted once the new set is safely saved.
      const old = (unused ?? []) as string[];
      if (old.length) await supabase.storage.from("item-photos").remove(old);
      setSaved(true);
      setMessage("");
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not save your photos. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="order-form">
      <h3>Photos</h3>
      <p className="trade-hint">Tap a slot to replace a photo, or the × to remove one. Changes are saved when you press Save photos.</p>
      <PhotoPicker entries={entries} setEntries={setEntries} />
      <button className="button button-coral" type="button" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save photos"}</button>
      {message && <p className="inline-error" role="status">{message}</p>}
      {saved && <p className="trade-success" role="status">Photos saved.</p>}
    </div>
  );
}
