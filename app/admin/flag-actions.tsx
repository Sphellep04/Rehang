"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tradeError } from "@/lib/trade";

type Props = { kind: "item"; id: string; reason: "duplicate_photo" | "brand_check" | "price_low" } | { kind: "account"; id: string };

export function FlagActions(props: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: string, warning?: string) {
    if (warning && !window.confirm(warning)) return;
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: rpcError } = props.kind === "item"
      ? await supabase.rpc("resolve_item_flag", { p_flag: props.id, p_action: action, p_note: note.trim() || null })
      : await supabase.rpc("resolve_account_flag", { p_flag: props.id, p_action: action, p_note: note.trim() || null });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    router.refresh();
  }

  return (
    <div className="admin-actions">
      <label className="sr-only" htmlFor={`flag-note-${props.id}`}>Note for the action log</label>
      <input id={`flag-note-${props.id}`} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Note for the log (optional)" />
      <div className="offer-buttons">
        {props.kind === "item" && props.reason === "brand_check" && (
          <button className="button button-outline" type="button" disabled={busy} onClick={() => void run("approve")}>Photos look right</button>
        )}
        <button className="button button-outline" type="button" disabled={busy} onClick={() => void run("dismiss")}>{props.kind === "item" && props.reason === "brand_check" ? "Not convincing" : "Looks fine"}</button>
        {props.kind === "account" && (
          <>
            <button className="button button-outline" type="button" disabled={busy} onClick={() => void run("restrict_user", "Restrict this account for 7 days?")}>Restrict 7 days</button>
            <button className="button button-outline" type="button" disabled={busy} onClick={() => void run("suspend_user", "Suspend this account?")}>Suspend</button>
          </>
        )}
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </div>
  );
}
