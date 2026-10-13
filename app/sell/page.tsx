import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ListingForm } from "./listing-form";

type CategoryRow = { id: number; name: string; parent_id: number | null };
type SizeRow = { id: number; system: string; value: string };
type TownRow = { id: number; name: string };

export default function SellPage() {
  if (!isSupabaseConfigured()) {
    return (
      <main className="auth-page">
        <header className="auth-topbar"><Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link></header>
        <section className="auth-card sell-setup">
          <p className="eyebrow">SELL IN WINDHOEK</p>
          <h1>Set up Rehang first</h1>
          <p>Email sign-in and the Supabase project must be configured before you can save a listing.</p>
          <Link className="button button-ink" href="/login">Go to sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <Suspense fallback={<main className="auth-page"><p className="auth-loading">Loading your shop…</p></main>}>
      <SellContent />
    </Suspense>
  );
}

async function SellContent() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims.sub) redirect("/login");

  const [{ data: categoryRows }, { data: sizes }, { data: towns }, { data: profile }] = await Promise.all([
    supabase.from("categories").select("id,name,parent_id").eq("allowed", true).order("position"),
    supabase.from("sizes").select("id,system,value").order("system").order("value"),
    supabase.from("towns").select("id,name").eq("is_live", true).order("name"),
    supabase.from("users").select("terms_accepted_at,verification_level,town_id").eq("id", claimsData.claims.sub).maybeSingle(),
  ]);

  if (!profile?.terms_accepted_at) redirect("/onboarding");

  const parentIds = new Set((categoryRows ?? []).map((category) => category.parent_id).filter((id): id is number => id !== null));
  const categories = ((categoryRows ?? []) as CategoryRow[])
    .filter((category) => !parentIds.has(category.id))
    .map(({ id, name }) => ({ id, name }));

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link>
        <Link href="/">Back to the marketplace</Link>
      </header>
      <div className="sell-layout">
        <div className="sell-heading">
          <p className="eyebrow">YOUR WINDHOEK SHOP</p>
          <h1>List an item.</h1>
          <p>Start with clear photos and honest details. New listings save as drafts until the publishing flow is ready.</p>
        </div>
        <ListingForm
          categories={categories}
          sizes={(sizes ?? []) as SizeRow[]}
          towns={(towns ?? []) as TownRow[]}
          defaultTownId={profile.town_id}
          verificationLevel={profile.verification_level}
        />
      </div>
    </main>
  );
}
