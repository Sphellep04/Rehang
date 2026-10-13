"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

export function DisputeDecision({ orderId, completed }: { orderId: string; completed: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(decision: string, warning: string) {
    if (note.trim().length < 10) return setError("Write a short reason first. Both people will read it.");
    if (!window.confirm(warning)) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await createClient().rpc("decide_dispute", { p_order: orderId, p_decision: decision, p_note: note.trim() });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    router.refresh();
  }

  return (
    <div className="admin-actions">
      <label className="sr-only" htmlFor={`dispute-note-${orderId}`}>Reason shown to both people</label>
      <textarea id={`dispute-note-${orderId}`} rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason shown to both people: facts, rule applied, outcome" />
      <div className="offer-buttons">
        <button className="button button-outline" type="button" disabled={busy} onClick={() => void decide("seller_at_fault", "The seller gets a strike and the order is cancelled. Continue?")}>Seller at fault</button>
        <button className="button button-outline" type="button" disabled={busy} onClick={() => void decide("buyer_at_fault", "The buyer gets a strike and the order is cancelled. Continue?")}>Buyer at fault</button>
        <button className="button button-outline" type="button" disabled={busy} onClick={() => void decide("no_fault", "The order is cancelled with no strike. Continue?")}>No fault</button>
        {!completed && <button className="button button-outline" type="button" disabled={busy} onClick={() => void decide("completed", "The order is marked completed and the item sold. Continue?")}>It did happen</button>}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
