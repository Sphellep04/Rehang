"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInviteCode, inviteFromWaitlist, type InviteResult } from "./actions";

export function InviteButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<InviteResult | null>(null);
  return (
    <div className="admin-actions">
      <button className="button button-outline" type="button" disabled={pending || result?.ok} onClick={() => start(async () => { setResult(await inviteFromWaitlist(id)); router.refresh(); })}>{pending ? "Sending…" : "Send invite"}</button>
      {result && <p className={result.ok ? "trade-success" : "inline-error"} role="status">{result.message}</p>}
    </div>
  );
}

export function MakeCode() {
  const [uses, setUses] = useState(1);
  const [days, setDays] = useState(14);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<InviteResult | null>(null);
  return (
    <div className="order-form">
      <h3>Make an invite code</h3>
      <div className="order-form-row">
        <div><label htmlFor="invite-uses">Uses</label><input id="invite-uses" type="number" min={1} max={100} value={uses} onChange={(event) => setUses(Number(event.target.value))} /></div>
        <div><label htmlFor="invite-days">Valid for (days)</label><input id="invite-days" type="number" min={1} max={90} value={days} onChange={(event) => setDays(Number(event.target.value))} /></div>
      </div>
      <label htmlFor="invite-note">Note (who or what it is for)</label>
      <input id="invite-note" maxLength={100} value={note} onChange={(event) => setNote(event.target.value)} />
      <button className="button button-outline" type="button" disabled={pending} onClick={() => start(async () => setResult(await createInviteCode(uses, days, note)))}>{pending ? "Making…" : "Make code"}</button>
      {result && <p className={result.ok ? "trade-success" : "inline-error"} role="status">{result.ok ? <>Code: <b>{result.code}</b></> : result.message}</p>}
    </div>
  );
}
