import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { PageLoading } from "../_components/page-loading";
import { SiteHeader } from "../_components/site-header";
import { DeleteForm } from "./delete-form";
import { EmailForm } from "./email-form";
import { PhotoForm } from "./photo-form";

export const metadata: Metadata = { title: "Your account | Rehang" };

export default function AccountPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading your account…" />}>
      <AccountContent />
    </Suspense>
  );
}

async function AccountContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login");

  const supabase = await createClient();
  const { data: me } = await supabase.from("users").select("handle,display_name,photo_url,verification_level,email,email_alerts,email_digest").eq("id", viewerId).maybeSingle();
  if (!me) redirect("/onboarding");

  const levelText = me.verification_level === "level2" ? "ID verified" : me.verification_level === "level1" ? "Email confirmed" : "Email not confirmed yet";

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <p className="eyebrow">YOUR ACCOUNT</p>
        <h1 className="browse-title">Hello, <em>{me.display_name as string}.</em></h1>
        <dl className="order-facts">
          <div><dt>Email</dt><dd>{(me.email as string | null) ?? "Not set"}</dd></div>
          <div><dt>Status</dt><dd>{levelText}{me.verification_level !== "level2" && <> · <Link href="/verify">Verify my ID</Link></>}</dd></div>
          <div><dt>Your shop</dt><dd><Link href={`/${me.handle as string}`}>rehang.na/{me.handle as string}</Link></dd></div>
        </dl>
        <PhotoForm userId={viewerId} currentUrl={me.photo_url as string | null} name={me.display_name as string} />
        <EmailForm alerts={me.email_alerts !== false} digest={me.email_digest === true} />
        <div className="order-form">
          <h3>Your data</h3>
          <p className="trade-hint">Download a copy of everything we hold about you: your profile, listings, offers, orders, reviews and messages you sent.</p>
          <a className="button button-outline" href="/account/export" download>Download my data</a>
        </div>
        <DeleteForm />
      </section>
    </main>
  );
}
