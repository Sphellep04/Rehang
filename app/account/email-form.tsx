"use client";

import { useActionState } from "react";
import { saveEmailPreferences, type EmailPrefsState } from "./actions";

export function EmailForm({ alerts, digest }: { alerts: boolean; digest: boolean }) {
  const [state, action, pending] = useActionState<EmailPrefsState, FormData>(saveEmailPreferences, {});
  return (
    <form className="order-form" action={action}>
      <h3>Emails</h3>
      <p className="trade-hint">Sign-in and password emails always send. These are optional.</p>
      <label className="terms-check"><input type="checkbox" name="alerts" defaultChecked={alerts} /> Offers, orders, meet-up reminders and price drops</label>
      <label className="terms-check"><input type="checkbox" name="digest" defaultChecked={digest} /> A daily summary of new listings from shops I follow</label>
      <button className="button" type="submit" disabled={pending}>{pending ? "Saving…" : "Save email settings"}</button>
      {state.message && <p className={state.ok ? "trade-hint" : "inline-error"} role="status">{state.message}</p>}
    </form>
  );
}
