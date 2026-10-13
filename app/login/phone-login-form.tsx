"use client";

import { useActionState, useState } from "react";
import { requestPhoneOtp, verifyPhoneOtp, type PhoneActionState } from "./actions";

const initialState: PhoneActionState = { status: "idle" };

export function PhoneLoginForm() {
  const [sendState, sendAction, isSending] = useActionState(requestPhoneOtp, initialState);
  const [verifyState, verifyAction, isVerifying] = useActionState(verifyPhoneOtp, initialState);
  const [useDifferentNumber, setUseDifferentNumber] = useState(false);
  const codeStep = sendState.status === "sent" && !useDifferentNumber;

  if (codeStep) {
    return (
      <>
        <p className="auth-message" role="status">{sendState.message}</p>
        <form className="auth-form" action={verifyAction}>
          <input type="hidden" name="phone" value={sendState.phone} />
          <label htmlFor="otp-code">6-digit code</label>
          <input id="otp-code" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
          <p className="auth-message" aria-live="polite">{verifyState.message}</p>
          <button className="button button-ink" type="submit" disabled={isVerifying}>
            {isVerifying ? "Checking code…" : "Verify and continue"}
          </button>
        </form>
        <button className="auth-switch" type="button" onClick={() => setUseDifferentNumber(true)}>Use a different number</button>
      </>
    );
  }

  return (
    <form className="auth-form" action={sendAction}>
      <label htmlFor="phone-number">Namibian mobile number</label>
      <input id="phone-number" name="phone" type="tel" autoComplete="tel" placeholder="+264 81 123 4567" defaultValue={sendState.phone} required />
      <p className="auth-message" role="status" aria-live="polite">{sendState.message}</p>
      <button className="button button-ink" type="submit" disabled={isSending}>
        {isSending ? "Sending code…" : "Send sign-in code"}
      </button>
      {sendState.status === "sent" && <button className="auth-switch" type="button" onClick={() => setUseDifferentNumber(false)}>Back to code entry</button>}
    </form>
  );
}