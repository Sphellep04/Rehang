"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

export function DisputeDecision({ orderId, completed, refundableCents = 0 }: { orderId: string; completed: boolean; refundableCents?: number }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState("");
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

  async function partialRefund() {
    const dollars = Number(refund);
    const cents = Math.round(dollars * 100);
    if (!Number.isFinite(dollars) || cents < 100 || cents >= refundableCents) return setError(`Enter a refund from N$1 up to less than N$${Math.round(refundableCents / 100)}.`);
    if (note.trim().length < 10) return setError("Write a short reason first. Both people will read it.");
    if (!window.confirm(`Refund the buyer N$${dollars}, pay the seller the rest and complete the order. Continue?`)) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await createClient().rpc("partial_refund", { p_order: orderId, p_refund_cents: cents, p_note: note.trim() });
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
      {refundableCents > 0 && (
        <div className="offer-row">
          <label className="sr-only" htmlFor={`refund-${orderId}`}>Partial refund in N$</label>
          <span aria-hidden="true">N$</span>
          <input id={`refund-${orderId}`} type="number" inputMode="numeric" min={1} max={Math.floor(refundableCents / 100)} value={refund} onChange={(event) => setRefund(event.target.value)} placeholder="Part refund" />
          <button className="button button-outline" type="button" disabled={busy || refund === ""} onClick={() => void partialRefund()}>Part refund and complete</button>
        </div>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
