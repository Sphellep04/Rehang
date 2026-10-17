import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { PageLoading } from "../../_components/page-loading";
import { SiteHeader } from "../../_components/site-header";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = { title: "Staff sign-in security | Rehang", robots: { index: false, follow: false } };

export default function SecurityPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <SecurityContent />
    </Suspense>
  );
}

async function SecurityContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login?next=/admin/security");
  const supabase = await createClient();
  const { data: me } = await supabase.from("users").select("role").eq("id", viewerId).maybeSingle();
  if (me?.role !== "moderator" && me?.role !== "admin") notFound();

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <p className="eyebrow">STAFF ONLY</p>
        <h1 className="browse-title">Two-factor <em>sign-in.</em></h1>
        <p className="trade-hint">Staff can read reports and ID photos, so they need a second step. Use an authenticator app such as Google Authenticator, Microsoft Authenticator or 1Password.</p>
        <MfaForm />
      </section>
    </main>
  );
}
