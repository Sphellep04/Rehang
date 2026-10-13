"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dollarsToCents, tradeError } from "@/lib/trade";

type Props = { itemId: string; price: number; signedIn: boolean; minimumPercent?: number };

export function TradePanel({ itemId, price, signedIn, minimumPercent = 60 }: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<"buy" | "offer" | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const minimum = Math.ceil((price * minimumPercent) / 100);

  async function buyNow() {
    if (!signedIn) return router.push("/login");
    setBusy("buy");
    setError("");
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc("buy_now", { p_item: itemId });
    setBusy(null);
    if (rpcError || !data) return setError(tradeError(rpcError?.message));
    router.push(`/orders/${data}`);
  }

  async function sendOffer(event: React.FormEvent) {
    event.preventDefault();
    if (!signedIn) return router.push("/login");
    const cents = dollarsToCents(amount);
    if (cents === null) return setError("Enter a whole dollar amount.");
    setBusy("offer");
    setError("");
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("make_offer", { p_item: itemId, p_amount_cents: cents });
    setBusy(null);
    if (rpcError) return setError(tradeError(rpcError.message));
    setSent(true);
    setAmount("");
  }

  return (
    <div className="trade-panel">
      <button className="button button-coral trade-buy" type="button" disabled={busy !== null} onClick={() => void buyNow()}>
        {busy === "buy" ? "Reserving…" : `Buy now · N$${price.toLocaleString("en-ZA")}`}
      </button>
      <p className="trade-hint">You pay the seller in person when you meet. Nothing is charged online.</p>

      <form className="offer-form" onSubmit={(event) => void sendOffer(event)}>
        <label htmlFor="offer-amount">Or make an offer (from N${minimum})</label>
        <div className="offer-row">
          <span aria-hidden="true">N$</span>
          <input id="offer-amount" type="number" inputMode="numeric" min={minimum} max={price - 1} step={1} value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={String(minimum)} />
          <button className="button button-outline" type="submit" disabled={busy !== null || amount === ""}>{busy === "offer" ? "Sending…" : "Send offer"}</button>
        </div>
      </form>

      {error && <p className="inline-error" role="alert">{error}</p>}
      {sent && <p className="trade-success" role="status">Offer sent. The seller has 24 hours to reply. <Link href="/offers">See your offers</Link></p>}
    </div>
  );
}
