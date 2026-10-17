"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

export function GiftDecision({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(action: "accept" | "decline" | "collected") {
    setBusy(true);
    setError("");
    const { error: rpcError } = await createClient().rpc("decide_donation", { p_donation: id, p_action: action, p_note: note.trim() || null });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    router.refresh();
  }

  return (
    <div className="admin-actions">
      <label className="sr-only" htmlFor={`gift-note-${id}`}>Note</label>
      <textarea id={`gift-note-${id}`} rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (needed to decline, shown to the donor)" />
      <div className="offer-buttons">
        {status === "offered" && <button className="button button-outline" type="button" disabled={busy} onClick={() => void decide("accept")}>Accept</button>}
        {status === "offered" && <button className="button button-outline" type="button" disabled={busy} onClick={() => void decide("decline")}>Decline</button>}
        {status === "accepted" && <button className="button button-outline" type="button" disabled={busy} onClick={() => void decide("collected")}>Mark handed over</button>}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}

export function PartnerForm({ towns }: { towns: { id: number; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const { error } = await createClient().rpc("save_donation_partner", {
      p_id: null,
      p_name: String(form.get("name") ?? ""),
      p_town: Number(form.get("town")) || null,
      p_contact: String(form.get("contact") ?? ""),
      p_description: String(form.get("description") ?? ""),
      p_accepts: String(form.get("accepts") ?? ""),
      p_active: form.get("active") === "on",
    });
    setBusy(false);
    setFailed(Boolean(error));
    setMessage(error ? tradeError(error.message) : "Saved.");
    if (!error) { event.currentTarget.reset(); router.refresh(); }
  }

  return (
    <form className="form-fields" onSubmit={submit}>
      <h2 className="list-heading field-span-two">Add a home</h2>
      <p className="trade-hint field-span-two">Only turn on &quot;Show on the Give page&quot; after you have visited or spoken to the home and checked it is real.</p>
      <label className="field-span-two" htmlFor="home-name">Name<input id="home-name" name="name" maxLength={100} required /></label>
      <label htmlFor="home-town">Town<select id="home-town" name="town"><option value="">Choose</option>{towns.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label htmlFor="home-contact">Contact (staff only)<input id="home-contact" name="contact" maxLength={200} /></label>
      <label className="field-span-two" htmlFor="home-description">About the home <span>(400 characters)</span><textarea id="home-description" name="description" rows={3} maxLength={400} /></label>
      <label className="field-span-two" htmlFor="home-accepts">What they need <span>(200 characters)</span><input id="home-accepts" name="accepts" maxLength={200} /></label>
      <label className="field-span-two"><input type="checkbox" name="active" /> Show on the Give page</label>
      <div className="field-span-two"><button className="button button-coral" type="submit" disabled={busy}>{busy ? "Saving…" : "Save home"}</button></div>
      {message && <p className={failed ? "inline-error" : "trade-hint"} role={failed ? "alert" : "status"}>{message}</p>}
    </form>
  );
}
