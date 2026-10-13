import Link from "next/link";
import { PhoneLoginForm } from "./phone-login-form";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  const configured = isSupabaseConfigured();

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link>
        <Link href="/">Back to the marketplace</Link>
      </header>
      <div className="auth-layout">
        <section className="auth-intro">
          <p className="eyebrow">REHANG · WINDHOEK</p>
          <h1>Second-hand clothes, <em>close to home.</em></h1>
          <p>Sign in with your Namibian mobile number. No password to remember.</p>
        </section>
        <section className="auth-card" aria-labelledby="login-title">
          <h2 id="login-title">Welcome to Rehang</h2>
          <p>We’ll text you a one-time code to verify your number.</p>
          {configured ? (
            <PhoneLoginForm />
          ) : (
            <div className="setup-notice" role="status">Phone sign-in is waiting for the local Supabase project and an SMS provider. The marketplace preview is still available.</div>
          )}
          <p className="auth-footnote"><span>✓</span> Your number is private and is never shown to buyers or sellers.</p>
        </section>
      </div>
      <footer className="site-footer auth-footer"><span>Clear your closet. Earn from it.</span><span>Made for Namibia <b>✳</b></span></footer>
    </main>
  );
}