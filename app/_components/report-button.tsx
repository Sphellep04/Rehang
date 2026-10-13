"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { reportReasons } from "@/lib/moderation";
import { tradeError } from "@/lib/trade";


type Props = { targetType: "item" | "user" | "message"; targetId: string; signedIn: boolean; label?: string };

export function ReportButton({ targetType, targetId, signedIn, label = "Report" }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("scam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: rpcError } = await createClient().rpc("file_report", {
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: reason,
      p_details: details.trim() || null,
    });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    setDone(true);
  }

  if (done) return <p className="trade-success" role="status">Thank you. Our team will take a look.</p>;

  return (
    <div className="report-box">
      {!open ? (
        <button className="plain-button report-link" type="button" onClick={() => (signedIn ? setOpen(true) : router.push("/login"))}>⚑ {label}</button>
      ) : (
        <form className="order-form" onSubmit={(event) => void submit(event)}>
          <h3>What is wrong?</h3>
          <label htmlFor={`reason-${targetId}`}>Reason</label>
          <select id={`reason-${targetId}`} value={reason} onChange={(event) => setReason(event.target.value)}>
            {reportReasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <label htmlFor={`details-${targetId}`}>More detail (optional)</label>
          <textarea id={`details-${targetId}`} rows={3} maxLength={500} value={details} onChange={(event) => setDetails(event.target.value)} />
          <div className="offer-buttons">
            <button className="button button-ink" type="submit" disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
            <button className="plain-button" type="button" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          {error && <p className="inline-error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
