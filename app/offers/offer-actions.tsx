"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dollarsToCents, tradeError } from "@/lib/trade";

type Props = {
  offerId: string;
  /** What the signed-in person can do with this offer right now. */
  mode: "seller_answer" | "buyer_answer" | "buyer_withdraw";
  priceDollars: number;
  offerDollars: number;
};

export function OfferActions({ offerId, mode, priceDollars, offerDollars }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [counter, setCounter] = useState("");
  const [countering, setCountering] = useState(false);

  async function respond(action: "accept" | "decline" | "counter", counterCents?: number) {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("respond_to_offer", {
      p_offer: offerId,
      p_action: action,
      p_counter_cents: counterCents ?? null,
    });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    const result = data as { action: string; order_id?: string } | null;
    if (result?.action === "accepted" && result.order_id) return router.push(`/orders/${result.order_id}`);
    if (result?.action === "expired") setError("This offer has expired.");
    router.refresh();
  }

  async function withdraw() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("withdraw_offer", { p_offer: offerId });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    router.refresh();
  }

  function submitCounter(event: React.FormEvent) {
    event.preventDefault();
    const cents = dollarsToCents(counter);
    if (cents === null) return setError("Enter a whole dollar amount.");
    void respond("counter", cents);
  }

  return (
    <div className="offer-actions">
      <div className="offer-buttons">
        {mode === "buyer_withdraw" && <button className="button button-outline" type="button" disabled={busy} onClick={() => void withdraw()}>Withdraw</button>}
        {mode !== "buyer_withdraw" && (
          <>
            <button className="button button-ink" type="button" disabled={busy} onClick={() => void respond("accept")}>Accept N${offerDollars.toLocaleString("en-ZA")}</button>
            {mode === "seller_answer" && <button className="button button-outline" type="button" disabled={busy} onClick={() => setCountering((value) => !value)}>Counter</button>}
            <button className="plain-button" type="button" disabled={busy} onClick={() => void respond("decline")}>Decline</button>
          </>
        )}
      </div>
      {countering && mode === "seller_answer" && (
        <form className="offer-row" onSubmit={submitCounter}>
          <span aria-hidden="true">N$</span>
          <label className="sr-only" htmlFor={`counter-${offerId}`}>Counter amount</label>
          <input id={`counter-${offerId}`} type="number" inputMode="numeric" min={offerDollars + 1} max={priceDollars} step={1} value={counter} onChange={(event) => setCounter(event.target.value)} placeholder={String(Math.min(priceDollars, offerDollars + 10))} />
          <button className="button button-coral" type="submit" disabled={busy || counter === ""}>Send counter</button>
        </form>
      )}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
