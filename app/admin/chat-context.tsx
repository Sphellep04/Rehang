"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatWindhoek, tradeError } from "@/lib/trade";

type Line = { message_id: string; sender_id: string; body: string; created_at: string; is_reported: boolean };

/** Loads the reported message with the ones around it. Every load is written to the action log. */
export function ChatContext({ reportId }: { reportId: string }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await createClient().rpc("report_context", { p_report: reportId });
    setBusy(false);
    if (rpcError) return setError(tradeError(rpcError.message));
    setLines((data ?? []) as Line[]);
  }

  if (!lines) {
    return (
      <>
        <button className="plain-button" type="button" disabled={busy} onClick={() => void load()}>{busy ? "Loading…" : "Read the conversation (logged)"}</button>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </>
    );
  }
  const senders = [...new Set(lines.map((line) => line.sender_id))];
  return (
    <ol className="admin-chat">
      {lines.map((line) => (
        <li key={line.message_id} data-reported={line.is_reported}>
          <b>Person {senders.indexOf(line.sender_id) + 1}</b> <small>{formatWindhoek(line.created_at)}</small>
          <p>{line.body}</p>
        </li>
      ))}
    </ol>
  );
}
