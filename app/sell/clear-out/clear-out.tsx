"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { listingProblem } from "@/lib/listing-rules";
import { colorChoices, conditions, type CategoryOption, type SizeOption, type TownOption } from "@/lib/listing-options";
import { uploadEntries, type PhotoEntry } from "@/lib/photo-client";
import { deleteDraft, listDrafts, saveDraft, type ClearOutDraft } from "@/lib/clearout-store";
import { tradeError } from "@/lib/trade";
import { PhotoPicker } from "../../_components/photo-picker";

type Props = { categories: CategoryOption[]; sizes: SizeOption[]; towns: TownOption[]; defaultTownId: number | null; brands: string[] };
type Outcome = { live: number; waiting: number; saved: number; failed: number };

function thumbUrls(drafts: ClearOutDraft[]) {
  return new Map(drafts.map((draft) => [draft.id, URL.createObjectURL((draft.photos.find((photo) => photo.kind === "front") ?? draft.photos[0]).blobs.thumb)]));
}

export function ClearOut({ categories, sizes, towns, defaultTownId, brands }: Props) {
  const [drafts, setDrafts] = useState<ClearOutDraft[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [colours, setColours] = useState<string[]>([]);
  // These carry over from one item to the next, because a wardrobe clear-out is mostly the same few choices.
  const [sticky, setSticky] = useState({ category_id: "", size_id: "", condition: "", town_id: defaultTownId?.toString() ?? "", brand_text: "" });
  const [formKey, setFormKey] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [publishAfter, setPublishAfter] = useState(true);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [online, setOnline] = useState(true);

  const previews = useMemo(() => thumbUrls(drafts.filter((draft) => draft.photos.length > 0)), [drafts]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const reload = useCallback(async () => {
    try {
      setDrafts(await listDrafts());
      setStorageError("");
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Could not read the drafts on this phone.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    // Reading the drafts kept on this phone is the point of this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, [reload]);

  function toggleColour(colour: string) {
    setColours((current) => (current.includes(colour) ? current.filter((value) => value !== colour) : current.length >= 2 ? current : [...current, colour]));
  }

  async function addToPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setOutcome(null);
    const data = new FormData(event.currentTarget);
    const fields = {
      title: String(data.get("title") ?? "").trim(),
      description: String(data.get("description") ?? "").trim(),
      brand_text: String(data.get("brand_text") ?? "").trim(),
      condition: String(data.get("condition") ?? ""),
      price: Number(data.get("price")),
      category_id: Number(data.get("category_id")),
      size_id: Number(data.get("size_id")),
      town_id: Number(data.get("town_id")),
      colours,
    };
    const problem = listingProblem({ ...fields, colourCount: colours.length, photoKinds: photos.map((photo) => photo.kind) });
    if (problem) return setMessage(problem);
    if (!fields.category_id || !fields.size_id || !fields.town_id || !fields.condition) return setMessage("Choose a category, size, condition and town.");

    const draft: ClearOutDraft = {
      id: crypto.randomUUID(),
      savedAt: Date.now(),
      fields,
      photos: photos.flatMap((entry) => (entry.source.type === "new"
        ? [{ id: entry.id, kind: entry.kind, width: entry.width, height: entry.height, phash: entry.phash, blurry: entry.blurry, blobs: entry.source.blobs }]
        : [])),
    };
    try {
      await saveDraft(draft);
    } catch (error) {
      return setMessage(error instanceof Error ? error.message : "This phone could not keep the draft. Free up some space and try again.");
    }
    setSticky({ category_id: String(fields.category_id), size_id: String(fields.size_id), condition: fields.condition, town_id: String(fields.town_id), brand_text: fields.brand_text });
    setPhotos([]);
    setFormKey((value) => value + 1);
    setMessage(`Kept on this phone. ${drafts.length + 1} ready to upload.`);
    await reload();
  }

  async function remove(id: string) {
    try { await deleteDraft(id); } catch { /* the list reloads below either way */ }
    await reload();
  }

  async function uploadAll() {
    setBusy(true);
    setMessage("");
    setOutcome(null);
    const result: Outcome = { live: 0, waiting: 0, saved: 0, failed: 0 };
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMessage("Your sign-in expired. Sign in again, then come back. Your drafts are still on this phone."); return; }

      const queue = await listDrafts();
      for (const [index, draft] of queue.entries()) {
        const label = `Item ${index + 1} of ${queue.length}`;
        try {
          setProgress(`${label}: saving details…`);
          let itemId = draft.remoteItemId;
          if (!itemId) {
            const { data: item, error } = await supabase.from("items").insert({
              title: draft.fields.title,
              description: draft.fields.description || null,
              category_id: draft.fields.category_id,
              size_id: draft.fields.size_id,
              condition: draft.fields.condition,
              brand_text: draft.fields.brand_text || null,
              colours: draft.fields.colours,
              price_cents: draft.fields.price * 100,
              town_id: draft.fields.town_id,
            }).select("id").single();
            if (error || !item) throw new Error("The details were not accepted. Check this item and try again.");
            itemId = item.id as string;
            draft.remoteItemId = itemId;
            await saveDraft(draft);
          }
          if (!draft.photosSet) {
            const entries: PhotoEntry[] = draft.photos.map((photo) => ({
              id: photo.id, kind: photo.kind, previewUrl: "", width: photo.width, height: photo.height, phash: photo.phash, blurry: photo.blurry,
              source: { type: "new", blobs: photo.blobs },
            }));
            const { rows, uploaded } = await uploadEntries(supabase, user.id, itemId, entries, (done, total) => setProgress(`${label}: photo ${Math.min(done + 1, total)} of ${total}…`));
            const { error: photoError } = await supabase.rpc("set_item_photos", { p_item: itemId, p_photos: rows });
            if (photoError) {
              if (uploaded.length) await supabase.storage.from("item-photos").remove(uploaded);
              throw new Error(tradeError(photoError.message));
            }
            draft.photosSet = true;
            await saveDraft(draft);
          }
          if (publishAfter) {
            setProgress(`${label}: publishing…`);
            const { data: status, error: publishError } = await supabase.rpc("publish_item", { p_item: itemId });
            if (publishError) throw new Error(`Saved as a draft on Rehang. ${tradeError(publishError.message)}`);
            if (status === "active") result.live += 1; else result.waiting += 1;
          } else {
            result.saved += 1;
          }
          await deleteDraft(draft.id);
        } catch (error) {
          result.failed += 1;
          draft.error = error instanceof Error ? error.message : "This item could not be uploaded.";
          // The ids and flags saved above mean a retry carries on from where this stopped, with no second copy.
          try { await saveDraft(draft); } catch { /* keep going with the rest */ }
          if (!navigator.onLine) break;
        }
      }
      setOutcome(result);
    } finally {
      setBusy(false);
      setProgress("");
      await reload();
    }
  }

  const needsUpload = drafts.length;

  return (
    <div className="sell-layout">
      <div className="sell-heading">
        <p className="eyebrow">CLEARING OUT YOUR WARDROBE</p>
        <h1>List many items.</h1>
        <p>Add each item with its photos. They are kept on this phone, so you can do it without a signal. When you have Wi-Fi, upload them all at once. Keep this page open if you lose your connection, because it cannot be opened again until you are back online.</p>
      </div>

      {storageError && <p className="listing-save-note" role="alert">{storageError}</p>}
      {!online && <p className="listing-save-note" role="status">You are offline. You can keep adding items. Uploading waits for a connection.</p>}

      <form className="listing-form" key={formKey} onSubmit={addToPhone}>
        <section className="listing-form-section">
          <div className="form-section-heading"><span>01</span><div><h2>Item details</h2><p>Category, size, condition, town and brand stay as you left them for the next item.</p></div></div>
          <div className="form-fields">
            <label className="field-span-two">Title<input name="title" minLength={10} maxLength={60} placeholder="Brand, item and detail" required /></label>
            <label>Category<select name="category_id" required value={sticky.category_id} onChange={(e) => setSticky({ ...sticky, category_id: e.target.value })}><option value="" disabled>Choose a category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label>Size<select name="size_id" required value={sticky.size_id} onChange={(e) => setSticky({ ...sticky, size_id: e.target.value })}><option value="" disabled>Choose a size</option>{sizes.map((s) => <option key={s.id} value={s.id}>{s.system.replaceAll("_", " ")} · {s.value}</option>)}</select></label>
            <label>Condition<select name="condition" required value={sticky.condition} onChange={(e) => setSticky({ ...sticky, condition: e.target.value })}><option value="" disabled>Choose condition</option>{conditions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Brand <span>(optional)</span><input name="brand_text" maxLength={60} list="clear-out-brands" autoComplete="off" value={sticky.brand_text} onChange={(e) => setSticky({ ...sticky, brand_text: e.target.value })} /><datalist id="clear-out-brands">{brands.map((name) => <option key={name} value={name} />)}</datalist></label>
            <label className="field-span-two">Description <span>(optional)</span><textarea name="description" maxLength={500} placeholder="Fit, fabric, measurements or anything a buyer should know" /></label>
            <fieldset className="field-span-two color-field"><legend>Colour <span>(choose 1 or 2)</span></legend><div className="color-options">{colorChoices.map((color) => <label className="color-option" key={color}><input type="checkbox" checked={colours.includes(color)} onChange={() => toggleColour(color)} /><span className="color-swatch" data-color={color.toLowerCase().replaceAll("/", "-")} />{color}</label>)}</div></fieldset>
            <label>Price in N$<input name="price" type="number" min={20} max={20000} step={1} placeholder="250" required /></label>
            <label>Town<select name="town_id" required value={sticky.town_id} onChange={(e) => setSticky({ ...sticky, town_id: e.target.value })}><option value="" disabled>Choose a town</option>{towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          </div>
        </section>
        <section className="listing-form-section">
          <div className="form-section-heading"><span>02</span><div><h2>Photos</h2><p>Front, back and care label are required.</p></div></div>
          <PhotoPicker entries={photos} setEntries={setPhotos} />
        </section>
        <p className="listing-save-note" role="status" aria-live="polite">{message}</p>
        <div className="listing-submit-row"><p>Nothing is uploaded yet. This only saves the item on your phone.</p><button className="button button-ink" type="submit">Keep on this phone</button></div>
      </form>

      <section className="listing-form-section">
        <div className="form-section-heading"><span>03</span><div><h2>Ready to upload ({needsUpload})</h2><p>Uploading sends about 100 to 300 KB per photo, so Wi-Fi is best.</p></div></div>
        {!ready ? <p className="trade-hint">Reading your drafts…</p> : drafts.length === 0 ? <p className="trade-hint">No items waiting. Add one above.</p> : (
          <ul className="list-cards">
            {drafts.map((draft) => (
              <li className="list-card" key={draft.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {previews.get(draft.id) && <img src={previews.get(draft.id)} alt="" width={56} height={68} style={{ objectFit: "cover" }} />}
                <div className="list-card-main">
                  <b>{draft.fields.title}</b>
                  <p>N${draft.fields.price} · {draft.photos.length} photos{draft.remoteItemId ? " · started uploading" : ""}</p>
                  {draft.error && <small role="alert">{draft.error}</small>}
                </div>
                <button className="plain-button" type="button" disabled={busy} onClick={() => void remove(draft.id)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        <label className="check-row"><input type="checkbox" checked={publishAfter} onChange={(e) => setPublishAfter(e.target.checked)} /><span>Publish each item as it uploads</span></label>
        <button className="button button-ink" type="button" disabled={busy || drafts.length === 0 || !online} onClick={() => void uploadAll()}>
          {busy ? (progress || "Uploading…") : online ? `Upload ${drafts.length} ${drafts.length === 1 ? "item" : "items"}` : "Waiting for a connection"}
        </button>
        {outcome && (
          <p className="listing-save-note" role="status">
            {outcome.live > 0 && `${outcome.live} live. `}
            {outcome.waiting > 0 && `${outcome.waiting} will go live when your ID is verified. `}
            {outcome.saved > 0 && `${outcome.saved} saved as drafts in My listings. `}
            {outcome.failed > 0 && `${outcome.failed} did not upload and are still on this phone. Try again. `}
            <Link href="/my-listings">See my listings</Link>
          </p>
        )}
      </section>
    </div>
  );
}
