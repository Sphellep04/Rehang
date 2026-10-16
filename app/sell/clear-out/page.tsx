import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ClearOut } from "./clear-out";

export const metadata: Metadata = { title: "List many items | Rehang", robots: { index: false, follow: false } };

export default function ClearOutPage() {
  return (
    <Suspense fallback={<main className="auth-page"><p className="auth-loading">Loading…</p></main>}>
      <ClearOutContent />
    </Suspense>
  );
}

async function ClearOutContent() {
  if (!isSupabaseConfigured()) redirect("/sell");
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims.sub) redirect("/login?next=/sell/clear-out");

  const [{ data: categoryRows }, { data: sizes }, { data: towns }, { data: profile }, { data: brandRows }] = await Promise.all([
    supabase.from("categories").select("id,name,parent_id").eq("allowed", true).order("position"),
    supabase.from("sizes").select("id,system,value").order("system").order("value"),
    supabase.from("towns").select("id,name").eq("is_live", true).order("name"),
    supabase.from("users").select("terms_accepted_at,town_id").eq("id", claimsData.claims.sub).maybeSingle(),
    supabase.from("brands").select("name").order("name"),
  ]);
  if (!profile?.terms_accepted_at) redirect("/onboarding");

  const parentIds = new Set((categoryRows ?? []).map((category) => category.parent_id).filter((id): id is number => id !== null));
  const categories = (categoryRows ?? []).filter((category) => !parentIds.has(category.id as number)).map((category) => ({ id: category.id as number, name: category.name as string }));

  return (
    <main className="auth-page">
      <header className="auth-topbar">
        <Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link>
        <Link href="/sell">List one item instead</Link>
      </header>
      <ClearOut
        categories={categories}
        sizes={(sizes ?? []) as { id: number; system: string; value: string }[]}
        towns={(towns ?? []) as { id: number; name: string }[]}
        defaultTownId={profile.town_id as number | null}
        brands={(brandRows ?? []).map((row) => row.name as string)}
      />
    </main>
  );
}
