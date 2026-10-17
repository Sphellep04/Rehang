"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

type Props = { itemId: string; price: number; postageCents: number; feeCents: number; signedIn: boolean };

const money = (cents: number) => `N$${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

/** "Have it delivered": the buyer gives an address and the order waits for payment. */
export function DeliveryPanel({ itemId, price, postageCents, feeCents, signedIn }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("courier");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const total = price * 100 + postageCents + feeCents;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!signedIn) return router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    if (address.trim().length < 10) return setError("Please enter your full delivery address.");
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await createClient().rpc("buy_with_delivery", { p_item: itemId, p_method: method, p_address: address.trim() });
    setBusy(false);
    if (rpcError || !data) return setError(tradeError(rpcError?.message));
    router.push(`/orders/${data}`);
  }

  if (!open) {
    return (
      <div className="trade-panel">
        <button className="button button-outline" type="button" onClick={() => setOpen(true)}>Have it delivered · postage {money(postageCents)}</button>
        <p className="trade-hint">Pay online. We hold your money until you confirm the item arrived.</p>
      </div>
    );
  }

  return (
    <form className="order-form" onSubmit={(event) => void submit(event)}>
      <h3>Have it delivered</h3>
      <dl className="order-facts">
        <div><dt>Item</dt><dd>{money(price * 100)}</dd></div>
        <div><dt>Postage</dt><dd>{money(postageCents)}</dd></div>
        {feeCents > 0 && <div><dt>Buyer fee</dt><dd>{money(feeCents)}</dd></div>}
        <div><dt>Total</dt><dd><b>{money(total)}</b></dd></div>
      </dl>
      <label htmlFor="delivery-method">How</label>
      <select id="delivery-method" value={method} onChange={(event) => setMethod(event.target.value)}>
        <option value="courier">Courier</option>
        <option value="post">Post office</option>
      </select>
      <label htmlFor="delivery-address">Delivery address</label>
      <textarea id="delivery-address" rows={3} maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Name, street, suburb, town" required />
      <p className="trade-hint">Only the seller of this order sees your address. You then have 30 minutes to pay.</p>
      <button className="button button-coral" type="submit" disabled={busy}>{busy ? "Reserving…" : "Continue to payment"}</button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </form>
  );
}
