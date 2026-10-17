"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Props = { itemId: string; title: string; description: string; brand: string; priceDollars: number; live: boolean; delivery?: boolean; postageDollars?: number | null };

export function EditForm(props: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(props.title);
  const [description, setDescription] = useState(props.description);
  const [brand, setBrand] = useState(props.brand);
  const [price, setPrice] = useState(String(props.priceDollars));
  const [postage, setPostage] = useState(props.postageDollars == null ? "" : String(props.postageDollars));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    const amount = Number(price);
    if (title.trim().length < 10 || title.trim().length > 60) return setError("Title must be 10 to 60 characters.");
    if (description.length > 500) return setError("Description must be 500 characters or fewer.");
    if (!Number.isInteger(amount) || amount < 20 || amount > 20000) return setError("Price must be a whole amount from N$20 to N$20,000.");
    const postageAmount = postage.trim() === "" ? null : Number(postage);
    if (props.delivery && postageAmount !== null && (!Number.isInteger(postageAmount) || postageAmount < 0 || postageAmount > 1000)) return setError("Postage must be a whole amount from N$0 to N$1,000, or empty for meet-up only.");
    setBusy(true);
    setError("");
    const { error: writeError } = await createClient()
      .from("items")
      .update({ title: title.trim(), description: description.trim() || null, brand_text: brand.trim() || null, price_cents: amount * 100, ...(props.delivery ? { shipping_cents: postageAmount === null ? null : postageAmount * 100 } : {}) })
      .eq("id", props.itemId);
    setBusy(false);
    if (writeError) return setError("We couldn't save your changes. The item may have just been reserved.");
    setSaved(true);
    router.refresh();
  }

  const dropping = props.live && Number(price) > 0 && Number(price) <= props.priceDollars * 0.95;

  return (
    <form className="order-form" onSubmit={(event) => void save(event)}>
      <label htmlFor="edit-title">Title</label>
      <input id="edit-title" value={title} maxLength={60} onChange={(event) => setTitle(event.target.value)} required />
      <label htmlFor="edit-brand">Brand (optional)</label>
      <input id="edit-brand" value={brand} maxLength={60} onChange={(event) => setBrand(event.target.value)} />
      <label htmlFor="edit-description">Description (optional)</label>
      <textarea id="edit-description" rows={4} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} />
      <label htmlFor="edit-price">Price in N$</label>
      <input id="edit-price" type="number" min={20} max={20000} step={1} value={price} onChange={(event) => setPrice(event.target.value)} required />
      {props.delivery && (<>
        <label htmlFor="edit-postage">Postage price in N$ (optional)</label>
        <input id="edit-postage" type="number" inputMode="numeric" min={0} max={1000} step={1} value={postage} onChange={(event) => setPostage(event.target.value)} placeholder="Empty means meet-up only" />
      </>)}
      {dropping && <p className="trade-hint">Lowering the price tells everyone who saved this item.</p>}
      <p className="trade-hint">Size, condition and colour can&apos;t be changed. Remove the listing and add it again if they are wrong.</p>
      <button className="button button-coral" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {saved && <p className="trade-success" role="status">Saved.</p>}
    </form>
  );
}
