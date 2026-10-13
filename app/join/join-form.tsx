"use client";

import { useActionState } from "react";
import { joinWaitlist, type JoinState } from "./actions";

export function JoinForm({ source, towns }: { source: string; towns: string[] }) {
  const [state, action, pending] = useActionState<JoinState, FormData>(joinWaitlist, { status: "idle" });
  if (state.status === "done") return <p className="trade-success" role="status">{state.message}</p>;
  return (
    <form className="auth-form" action={action}>
      <label htmlFor="join-email">Email</label>
      <input id="join-email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="join-role">I want to</label>
      <select id="join-role" name="role" defaultValue="both">
        <option value="buyer">Buy</option>
        <option value="seller">Sell</option>
        <option value="both">Buy and sell</option>
      </select>
      <label htmlFor="join-town">Town</label>
      <select id="join-town" name="town" defaultValue="">
        <option value="">Choose a town</option>
        {towns.map((town) => <option key={town} value={town}>{town}</option>)}
      </select>
      <input type="hidden" name="source" value={source} />
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label htmlFor="join-website">Leave this empty</label>
        <input id="join-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.status === "error" && <p className="inline-error" role="alert">{state.message}</p>}
      <button className="button button-ink" type="submit" disabled={pending}>{pending ? "Joining…" : "Join the waiting list"}</button>
    </form>
  );
}
