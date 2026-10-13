import Link from "next/link";
import { loadPolicy, policyRoutes, type PolicySlug } from "@/lib/policy";

const labels: Record<PolicySlug, string> = {
  "terms-of-use": "Terms of use",
  "privacy-policy": "Privacy policy",
  "seller-rules": "Seller rules",
  "buyer-protection": "Buyer protection",
  "prohibited-items": "Prohibited items",
};

export function PolicyPage({ slug }: { slug: PolicySlug }) {
  const { title, html } = loadPolicy(slug);
  return (
    <main className="auth-page">
      <header className="auth-topbar"><Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link><Link href="/browse">Browse</Link></header>
      <article className="policy-document">
        <p className="policy-draft">DRAFT FOR NAMIBIAN LAWYER REVIEW · NOT FINAL</p>
        <h1>{title}</h1>
        {/* The HTML comes from our own policy files in the repository, not from visitors. */}
        <div className="policy-body" dangerouslySetInnerHTML={{ __html: html }} />
        <nav className="policy-links" aria-label="Other policies">
          {(Object.keys(labels) as PolicySlug[]).filter((other) => other !== slug).map((other) => <Link key={other} href={policyRoutes[other]}>{labels[other]}</Link>)}
          <Link href="/safe-spots">Safe meet-up spots</Link>
        </nav>
      </article>
      <footer className="site-footer auth-footer"><span>Clear your closet. Earn from it.</span><span>Made for Namibia <b>✳</b></span></footer>
    </main>
  );
}
