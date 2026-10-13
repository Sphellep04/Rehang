"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toWindhoekIso, tradeError } from "@/lib/trade";

export type Spot = { id: number; name: string; address: string };

type Props = {
  orderId: string;
  role: "buyer" | "seller";
  /** Server-computed view of where the order is, so the buttons always match the rules. */
  stage: "needs_meetup" | "awaiting_confirmation" | "confirmed";
  spots: Spot[];
  canReportNoShow: boolean;
  noShowReportedByOther: boolean;
  noShowReportedByMe: boolean;
  cancelAgreementRequestedByOther: boolean;
};

const cancelCopy: Record<string, string> = {
  buyer_cancelled: "Cancel this order",
  seller_cancelled: "Cancel this order",
  item_damaged_or_lost: "Item is damaged or lost",
};

export function OrderActions(props: Props) {
  const { orderId, role, stage, spots, canReportNoShow, noShowReportedByOther, noShowReportedByMe, cancelAgreementRequestedByOther } = props;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [spot, setSpot] = useState(spots[0] ? String(spots[0].id) : "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [code, setCode] = useState("");

  async function run(task: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) {
    setBusy(true);
    setError("");
    setNotice("");
    const { error: rpcError } = await task();
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    after?.();
    router.refresh();
  }

  const supabase = () => createClient();

  function propose(event: React.FormEvent) {
    event.preventDefault();
    if (!spot || !date || !time) return setError("Pick a spot, a date and a time.");
    void run(() => supabase().rpc("propose_meetup", { p_order: orderId, p_spot: Number(spot), p_meetup_at: toWindhoekIso(date, time) }));
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("The code is 6 digits.");
    setBusy(true);
    setError("");
    setNotice("");
    const { data, error: rpcError } = await supabase().rpc("complete_meetup", { p_order: orderId, p_code: code });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    const row = (Array.isArray(data) ? data[0] : data) as { result: string; attempts_left: number } | null;
    if (!row) return setError("Something went wrong. Please try again.");
    if (row.result === "completed") return router.refresh();
    setCode("");
    if (row.result === "wrong_code") return setError(`That code doesn't match. ${row.attempts_left} ${row.attempts_left === 1 ? "try" : "tries"} left.`);
    if (row.result === "locked") return setError("Too many wrong codes. This order is locked and our team will review it.");
    if (row.result === "outside_window") return setError("The code only works from 1 hour before the meet-up until 24 hours after.");
  }

  async function cancel(reason: "buyer_cancelled" | "seller_cancelled" | "item_damaged_or_lost" | "agreement") {
    if (reason === "seller_cancelled" && stage === "confirmed" && !window.confirm("Cancelling after you agreed gives you a strike. Continue?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    const { data, error: rpcError } = await supabase().rpc("cancel_order", { p_order: orderId, p_reason: reason });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    if ((data as { status?: string } | null)?.status === "requested") setNotice("Request sent. The order cancels when the other person agrees too.");
    router.refresh();
  }

  const cancelReasons = role === "buyer" ? (["buyer_cancelled"] as const) : (["seller_cancelled", "item_damaged_or_lost"] as const);

  return (
    <div className="order-actions">
      {role === "buyer" && stage === "needs_meetup" && (
        spots.length === 0 ? (
          <p className="trade-hint">No meet-up spots are open in this town yet. We will let you know as soon as one is. You can also message the seller to arrange it.</p>
        ) : (
          <form className="order-form" onSubmit={propose}>
            <h3>Choose where and when to meet</h3>
            <label htmlFor="spot">Safe meet-up spot</label>
            <select id="spot" value={spot} onChange={(event) => setSpot(event.target.value)}>
              {spots.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.address}</option>)}
            </select>
            <div className="order-form-row">
              <div><label htmlFor="meet-date">Date</label><input id="meet-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
              <div><label htmlFor="meet-time">Time (Windhoek)</label><input id="meet-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div>
            </div>
            <button className="button button-coral" type="submit" disabled={busy}>{busy ? "Sending…" : "Send to seller"}</button>
          </form>
        )
      )}

      {role === "seller" && stage === "awaiting_confirmation" && (
        <button className="button button-coral" type="button" disabled={busy} onClick={() => void run(() => supabase().rpc("confirm_meetup", { p_order: orderId }))}>Confirm this meet-up</button>
      )}

      {role === "buyer" && stage === "awaiting_confirmation" && (
        <p className="trade-hint">Waiting for the seller to confirm. They can also suggest a change by messaging you.</p>
      )}

      {role === "seller" && stage === "confirmed" && (
        <form className="order-form" onSubmit={(event) => void submitCode(event)}>
          <h3>Handed over the item?</h3>
          <label htmlFor="meet-code">Ask the buyer for their 6 digit code</label>
          <div className="offer-row">
            <input id="meet-code" inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" />
            <button className="button button-coral" type="submit" disabled={busy || code.length !== 6}>Complete sale</button>
          </div>
        </form>
      )}

      {canReportNoShow && !noShowReportedByMe && (
        <button className="button button-outline" type="button" disabled={busy} onClick={() => void run(() => supabase().rpc("report_no_show", { p_order: orderId }))}>The other person did not turn up</button>
      )}
      {noShowReportedByMe && <p className="trade-hint">You reported a no-show. Our team will take a look if the other person disagrees.</p>}
      {noShowReportedByOther && (
        <div className="order-form">
          <p className="trade-hint">The other person says you did not turn up. If that is wrong, tell us and we will review it.</p>
          <button className="button button-outline" type="button" disabled={busy} onClick={() => void run(() => supabase().rpc("dispute_no_show", { p_order: orderId }))}>That is not right</button>
        </div>
      )}

      <div className="order-cancel">
        {cancelReasons.map((reason) => (
          <button key={reason} className="plain-button" type="button" disabled={busy} onClick={() => void cancel(reason)}>{cancelCopy[reason]}</button>
        ))}
        <button className="plain-button" type="button" disabled={busy} onClick={() => void cancel("agreement")}>{cancelAgreementRequestedByOther ? "Agree to cancel" : "Ask to cancel together"}</button>
      </div>

      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="trade-success" role="status">{notice}</p>}
    </div>
  );
}
