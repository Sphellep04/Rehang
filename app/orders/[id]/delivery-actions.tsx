"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";
import { simulatePayment } from "./simulate";

type Props = {
  orderId: string;
  role: "buyer" | "seller";
  status: string;
  simulator: boolean;
};

/** The buttons for a posted order: pay (or simulate), add tracking, mark received, accept. */
export function DeliveryActions({ orderId, role, status, simulator }: Props) {
  const router = useRouter();
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(task: () => Promise<{ message?: string } | null>) {
    setBusy(true);
    setError("");
    const result = await task();
    setBusy(false);
    if (result?.message) return setError(result.message);
    router.refresh();
  }
  const rpc = (name: string, args: Record<string, unknown>) => async () => {
    const { error: rpcError } = await createClient().rpc(name, args);
    return rpcError ? { message: tradeError(rpcError.message) } : null;
  };

  return (
    <div className="order-form">
      {status === "awaiting_payment" && role === "buyer" && (
        simulator
          ? <>
              <p className="trade-hint">Staging only: no real payment partner is connected. This button pretends the payment went through.</p>
              <button className="button button-coral" type="button" disabled={busy} onClick={() => void run(async () => { const r = await simulatePayment(orderId); return r.ok ? null : { message: r.message }; })}>Simulate payment</button>
            </>
          : <p className="trade-hint">Online payment isn&apos;t switched on yet. If you are waiting, the order will cancel by itself and the item goes back on sale.</p>
      )}
      {status === "awaiting_payment" && role === "seller" && <p className="trade-hint">Waiting for the buyer to pay. The item is held for them.</p>}

      {status === "paid_held" && role === "seller" && (
        <>
          <h3>Post the item</h3>
          <p className="trade-hint">Hand it to the courier or post office, then add the tracking number so the buyer can follow it.</p>
          <label htmlFor="tracking">Tracking number</label>
          <input id="tracking" value={tracking} maxLength={60} onChange={(event) => setTracking(event.target.value)} />
          <button className="button button-coral" type="button" disabled={busy || tracking.trim().length < 3} onClick={() => void run(rpc("mark_shipped", { p_order: orderId, p_tracking: tracking.trim() }))}>I have posted it</button>
        </>
      )}
      {status === "paid_held" && role === "buyer" && <p className="trade-hint">Paid. Your money is held safely until the item arrives.</p>}

      {status === "shipped" && role === "buyer" && (
        <>
          <h3>Has it arrived?</h3>
          <p className="trade-hint">Tap the button once the parcel is in your hands.</p>
          <button className="button button-coral" type="button" disabled={busy} onClick={() => void run(rpc("confirm_received", { p_order: orderId }))}>I have received it</button>
        </>
      )}
      {status === "shipped" && role === "seller" && <p className="trade-hint">On its way. The buyer will confirm when it arrives.</p>}

      {status === "delivered" && role === "buyer" && (
        <>
          <h3>Happy with it?</h3>
          <button className="button button-coral" type="button" disabled={busy} onClick={() => void run(rpc("accept_delivery", { p_order: orderId }))}>Yes, release the payment</button>
        </>
      )}
      {status === "delivered" && role === "seller" && <p className="trade-hint">Delivered. Your payout is released when the buyer confirms, or after the confirm window ends.</p>}
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
