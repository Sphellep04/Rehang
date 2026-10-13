import Link from "next/link";

export const metadata = { title: "Privacy Policy draft | Rehang" };

export default function PrivacyPage() {
  return (
    <main className="auth-page">
      <header className="auth-topbar"><Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link><Link href="/onboarding">Back to profile setup</Link></header>
      <article className="policy-document">
        <p className="policy-draft">DRAFT FOR NAMIBIAN LAWYER REVIEW · NOT FINAL POLICY</p>
        <h1>Privacy Policy</h1>
        <p className="policy-lede">This page summarizes the current Rehang privacy draft. It needs legal review, including confirmation of Namibian data-protection requirements, before the pilot.</p>
        <h2>Information we use</h2>
        <p>Rehang uses your email address for sign-in, account security and password resets. Your public profile can show your handle, display name, photo, town and bio. Listings, messages, offers, orders and reviews are used to operate the marketplace and resolve reports.</p>
        <h2>Private information</h2>
        <p>Your email, legal name and identity documents are not shown to other users. ID images are intended to be stored privately, accessible only to moderators for verification, and deleted within 30 days of a decision, subject to legal review.</p>
        <h2>Service providers</h2>
        <p>Rehang uses providers for hosting, database, SMS, error monitoring and analytics. If protected payments are introduced, a licensed payment partner will process them. Rehang does not store card numbers.</p>
        <h2>Your choices</h2>
        <p>The full policy describes how to request access, correction, download or deletion of your data, and how long different records are kept. Retention periods and contact details still require review and confirmation.</p>
        <p className="policy-note">This development preview is not the complete, lawyer-reviewed Privacy Policy. Do not use it as a public legal notice until review is complete.</p>
        <p><Link href="/terms">Read the draft Terms of Use</Link></p>
      </article>
      <footer className="site-footer auth-footer"><span>Clear your closet. Earn from it.</span><span>Made for Namibia <b>✳</b></span></footer>
    </main>
  );
}