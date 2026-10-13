"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Stage = "loading" | "enrol" | "scan" | "challenge" | "done";

export function MfaForm() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [factorId, setFactorId] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      const supabase = createClient();
      const [{ data: factors }, { data: level }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.mfa.getAuthenticatorAssuranceLevel()]);
      if (!active) return;
      if (level?.currentLevel === "aal2") return setStage("done");
      const verified = factors?.totp?.find((factor) => factor.status === "verified");
      if (verified) { setFactorId(verified.id); setStage("challenge"); } else setStage("enrol");
    })();
    return () => { active = false; };
  }, []);

  async function startEnrol() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    // Half-finished set-ups from an earlier try would block a new one.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    const { data, error: enrolError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Rehang staff" });
    setBusy(false);
    if (enrolError || !data) return setError("Could not start set-up. Try again.");
    setFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setStage("scan");
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("The code is 6 digits.");
    setBusy(true);
    setError("");
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code });
    setBusy(false);
    if (verifyError) { setCode(""); return setError("That code didn't work. Check the time on your phone and try the next code."); }
    setStage("done");
    router.refresh();
  }

  if (stage === "loading") return <p className="trade-hint">Loading…</p>;
  if (stage === "done") return <p className="trade-success" role="status">Two-factor is on for this session. <Link href="/admin">Go to the moderation queue</Link>.</p>;
  if (stage === "enrol") {
    return (
      <div className="order-form">
        <h3>Set up two-factor</h3>
        <p className="trade-hint">You will scan a code with your authenticator app, then type the 6 digit code it shows.</p>
        <button className="button button-coral" type="button" disabled={busy} onClick={() => void startEnrol()}>{busy ? "Starting…" : "Start set-up"}</button>
        {error && <p className="inline-error" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <form className="order-form" onSubmit={(event) => void verify(event)}>
      <h3>{stage === "scan" ? "Scan, then confirm" : "Enter your code"}</h3>
      {stage === "scan" && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for your authenticator app" width={180} height={180} />
          <p className="trade-hint">Can&apos;t scan? Type this key into the app: <code>{secret}</code></p>
        </>
      )}
      <label htmlFor="mfa-code">6 digit code</label>
      <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} required />
      <button className="button button-coral" type="submit" disabled={busy}>{busy ? "Checking…" : "Confirm"}</button>
      {error && <p className="inline-error" role="alert">{error}</p>}
    </form>
  );
}
