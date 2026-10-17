import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, lead, intro, notice, children }: { title: string; lead: string; intro: string; notice?: string; children: ReactNode }) {
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
          <p>Browse freely. Sign in with your email when you are ready to buy or sell.</p>
        </section>
        <section className="auth-card" aria-labelledby="auth-title">
          <h2 id="auth-title">{title}</h2>
          <p>{lead}</p>
          {notice && <p className="inline-error" role="alert">{notice}</p>}
          {children}
          <p className="auth-footnote"><span>✓</span> {intro}</p>
        </section>
      </div>
      <footer className="site-footer auth-footer"><span>Clear your closet. Earn from it.</span><span>Made for Namibia <b>✳</b></span></footer>
    </main>
  );
}
