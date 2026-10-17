"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

const reasons = [
  ["not_as_described", "The item is not as described"],
  ["unsafe", "I felt unsafe or was pressured"],
  ["other", "Something else went wrong"],
] as const;

/** "Report a problem" form, or the answer form when the other person reported one. */
export function DisputePanel({ orderId, mode, posted = false }: { orderId: string; mode: "report" | "respond"; posted?: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState<string>(posted ? "not_received" : "not_as_described");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (statement.trim().length < 10) return setError("Please explain in at least 10 characters.");
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: rpcError } = mode === "report"
      ? await supabase.rpc("open_dispute", { p_order: orderId, p_reason: reason, p_statement: statement.trim() })
      : await supabase.rpc("respond_to_dispute", { p_order: orderId, p_statement: statement.trim() });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    router.refresh();
  }

  return (
    <form className="order-form" onSubmit={(event) => void submit(event)}>
      <h3>{mode === "report" ? "Report a problem" : "Tell us your side"}</h3>
      <p className="trade-hint">{mode === "report" ? "Our team will read both sides and the chat, then decide. The other person will be able to reply." : "Keep it factual. Our team reads both sides, then decides."}</p>
      {mode === "report" && (
        <>
          <label htmlFor="dispute-reason">What happened?</label>
          <select id="dispute-reason" value={reason} onChange={(event) => setReason(event.target.value)}>
            {(posted ? ([["not_received", "The item has not arrived"], ...reasons] as const) : reasons).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </>
      )}
      <label htmlFor="dispute-statement">{mode === "report" ? "Describe the problem" : "Your reply"}</label>
      <textarea id="dispute-statement" rows={4} maxLength={500} value={statement} onChange={(event) => setStatement(event.target.value)} required />
      <button className="button button-outline" type="submit" disabled={busy}>{busy ? "Sending…" : mode === "report" ? "Send report" : "Send reply"}</button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </form>
  );
}
