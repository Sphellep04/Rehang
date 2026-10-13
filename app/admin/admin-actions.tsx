"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

type Props =
  | { kind: "report"; id: string; targetType: "item" | "user" | "message" }
  | { kind: "verification"; id: string };

export function AdminActions(props: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(task: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError("");
    const { error: rpcError } = await task();
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    setNote("");
    router.refresh();
  }

  const supabase = () => createClient();
  const report = (action: string) => run(() => supabase().rpc("moderate_report", { p_report: props.id, p_action: action, p_note: note.trim() || null }));
  const verify = (decision: string) => run(() => supabase().rpc("review_verification", { p_verification: props.id, p_decision: decision, p_reason: note.trim() || null }));
  const confirmThen = (message: string, task: () => Promise<void>) => { if (window.confirm(message)) void task(); };

  return (
    <div className="admin-actions">
      <label className="sr-only" htmlFor={`note-${props.id}`}>Note for the action log</label>
      <input id={`note-${props.id}`} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder={props.kind === "verification" ? "Reason (needed to reject)" : "Note for the log (optional)"} />
      <div className="offer-buttons">
        {props.kind === "report" ? (
          <>
            <button className="button button-outline" type="button" disabled={busy} onClick={() => void report("dismiss")}>Dismiss</button>
            {props.targetType === "item" && <button className="button button-ink" type="button" disabled={busy} onClick={() => confirmThen("Remove this listing?", () => report("remove_item"))}>Remove listing</button>}
            <button className="button button-outline" type="button" disabled={busy} onClick={() => confirmThen("Restrict this account for 7 days?", () => report("restrict_user"))}>Restrict 7 days</button>
            <button className="button button-coral" type="button" disabled={busy} onClick={() => confirmThen("Suspend this account?", () => report("suspend_user"))}>Suspend</button>
          </>
        ) : (
          <>
            <button className="button button-ink" type="button" disabled={busy} onClick={() => void verify("approve")}>Approve</button>
            <button className="button button-outline" type="button" disabled={busy || note.trim() === ""} onClick={() => void verify("reject")}>Reject</button>
            <button className="plain-button" type="button" disabled={busy} onClick={() => void verify("escalate")}>Escalate</button>
          </>
        )}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
