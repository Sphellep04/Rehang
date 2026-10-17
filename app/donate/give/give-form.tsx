"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

export function GiveForm({ items, partners }: { items: { id: string; title: string }[]; partners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [item, setItem] = useState("");
  const [partner, setPartner] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  if (items.length === 0) return <p className="trade-hint">You have no listings to give yet. Add an item from the Sell page first.</p>;
  if (partners.length === 0) return <p className="trade-hint">No homes are open for gifts right now.</p>;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await createClient().rpc("offer_donation", { p_item: item, p_partner: partner, p_note: note.trim() || null });
    setBusy(false);
    setFailed(Boolean(error));
    if (error) return setMessage(tradeError(error.message));
    setMessage("Thank you! The team will look at your gift soon.");
    setItem(""); setNote("");
    router.refresh();
  }

  return (
    <form className="form-fields" onSubmit={submit}>
      <label className="field-span-two" htmlFor="gift-item">Item
        <select id="gift-item" value={item} onChange={(e) => setItem(e.target.value)} required>
          <option value="">Choose a listing</option>
          {items.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </select>
      </label>
      <label className="field-span-two" htmlFor="gift-home">Home
        <select id="gift-home" value={partner} onChange={(e) => setPartner(e.target.value)} required>
          <option value="">Choose a home</option>
          {partners.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      </label>
      <label className="field-span-two" htmlFor="gift-note">Note for the team <span>(optional · 200 characters)</span>
        <textarea id="gift-note" rows={3} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Size, condition, anything we should know" />
      </label>
      <div className="field-span-two">
        <button className="button button-coral" type="submit" disabled={busy || !item || !partner}>{busy ? "Sending…" : "Offer this gift"}</button>
      </div>
      {message && <p className={failed ? "inline-error" : "trade-hint"} role={failed ? "alert" : "status"}>{message}</p>}
    </form>
  );
}

export function CancelGift({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function cancel() {
    if (!window.confirm("Cancel this gift? The item goes back on sale.")) return;
    setBusy(true);
    await createClient().rpc("cancel_donation", { p_donation: id });
    setBusy(false);
    router.refresh();
  }
  return <button className="button button-outline" type="button" disabled={busy} onClick={() => void cancel()}>Cancel</button>;
}
