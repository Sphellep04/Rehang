"use client";

import { useActionState } from "react";
import { deleteAccount, type DeleteState } from "./actions";

export function DeleteForm() {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccount, {});
  return (
    <form className="order-form danger-zone" action={action}>
      <h3>Delete my account</h3>
      <p className="trade-hint">
        This removes your listings, saved items, follows and personal details, and queues your ID photos for deletion. Completed orders stay on record for the other person, and
        reviews you received remain, without your name. This cannot be undone.
      </p>
      <label htmlFor="delete-confirm">Type DELETE to confirm</label>
      <input id="delete-confirm" name="confirm" autoComplete="off" required />
      {state.message && <p className="inline-error" role="alert">{state.message}</p>}
      <button className="button button-ink" type="submit" disabled={pending}>{pending ? "Deleting…" : "Delete my account"}</button>
    </form>
  );
}
