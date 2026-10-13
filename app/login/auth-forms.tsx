"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, signIn, signUp, updatePassword, type AuthState } from "./actions";

const initial: AuthState = { status: "idle" };

function Message({ state }: { state: AuthState }) {
  return <p className={state.status === "error" ? "inline-error" : "auth-message"} role={state.status === "error" ? "alert" : "status"} aria-live="polite">{state.message}</p>;
}

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form className="auth-form" action={action}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <Message state={state} />
      <button className="button button-ink" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="auth-links"><Link href="/forgot-password">Forgot your password?</Link><Link href={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link></p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, initial);
  if (state.status === "done") return <p className="trade-success" role="status">{state.message} Open it on this device to finish setting up your shop.</p>;
  return (
    <form className="auth-form" action={action}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Password</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
      <small className="auth-hint">At least 10 characters, with a letter and a number.</small>
      <label htmlFor="confirm">Repeat password</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
      <Message state={state} />
      <button className="button button-ink" type="submit" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      <p className="auth-links"><Link href="/login">I already have an account</Link></p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  if (state.status === "done") return <p className="trade-success" role="status">{state.message}</p>;
  return (
    <form className="auth-form" action={action}>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <Message state={state} />
      <button className="button button-ink" type="submit" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
      <p className="auth-links"><Link href="/login">Back to sign in</Link></p>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form className="auth-form" action={action}>
      <label htmlFor="password">New password</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
      <small className="auth-hint">At least 10 characters, with a letter and a number.</small>
      <label htmlFor="confirm">Repeat new password</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} maxLength={72} required />
      <Message state={state} />
      <button className="button button-ink" type="submit" disabled={pending}>{pending ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
