import Link from "next/link";

export const metadata = { title: "Terms of Use draft | Rehang" };

export default function TermsPage() {
  return (
    <main className="auth-page">
      <header className="auth-topbar"><Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link><Link href="/onboarding">Back to profile setup</Link></header>
      <article className="policy-document">
        <p className="policy-draft">DRAFT FOR NAMIBIAN LAWYER REVIEW · NOT FINAL TERMS</p>
        <h1>Terms of Use</h1>
        <p className="policy-lede">This page summarizes the current Rehang policy draft. The full draft contains legal placeholders and must be reviewed before the pilot or any public transactions.</p>
        <h2>Using Rehang</h2>
        <p>Rehang connects people in Namibia who buy and sell pre-loved clothing, shoes and accessories. Users must be 18 or older, provide accurate information, and use one account. Sellers must own the items they list and describe them honestly.</p>
        <h2>Messages and conduct</h2>
        <p>Keep buyer–seller conversations in Rehang so order details and reports stay connected. Harassment, fake listings, prohibited items, attempts to evade safety measures, and requests for deposits are not allowed. You can block or report an account, listing or message.</p>
        <h2>Meet-ups and payments</h2>
        <p>During the Windhoek pilot, buyers inspect items at approved meet-up spots and pay the seller directly. Rehang does not hold that payment. In-app payments and delivery will only be offered after the relevant partner, legal and safety checks are complete.</p>
        <h2>Fees and buyer protection</h2>
        <p>Listing is free. Any transaction fees must be shown before an order is placed. Buyer protection applies only to orders completed through Rehang’s protected payment flow when that feature is enabled.</p>
        <h2>Reports and account action</h2>
        <p>Rehang may remove content or restrict accounts that break its rules. Users should use the in-app reporting flow for problems. The full policy describes the review and appeal process.</p>
        <p className="policy-note">This development preview is not a substitute for the complete, lawyer-reviewed Terms of Use. Do not use it for public transactions until legal review is complete.</p>
        <p><Link href="/privacy">Read the draft Privacy Policy</Link></p>
      </article>
      <footer className="site-footer auth-footer"><span>Clear your closet. Earn from it.</span><span>Made for Namibia <b>✳</b></span></footer>
    </main>
  );
}