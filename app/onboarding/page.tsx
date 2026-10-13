import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { ProfileForm } from "./profile-form";

export default function OnboardingPage() {
  if (!isSupabaseConfigured()) redirect("/login");

  return (
    <main className="auth-page">
      <header className="auth-topbar"><Link className="wordmark" href="/">Rehang<span className="coral">.</span></Link></header>
      <Suspense fallback={<p className="auth-loading">Loading your profile…</p>}>
        <OnboardingContent />
      </Suspense>
      <footer className="site-footer auth-footer"><span>Clear your closet. Earn from it.</span><span>Made for Namibia <b>✳</b></span></footer>
    </main>
  );
}

async function OnboardingContent() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims.sub) redirect("/login");

  const [{ data: profile }, { data: towns }] = await Promise.all([
    supabase.from("users").select("handle, display_name, bio, town_id, terms_accepted_at").eq("id", claimsData.claims.sub).maybeSingle(),
    supabase.from("towns").select("id, name").eq("is_live", true).order("name"),
  ]);

  if (profile?.terms_accepted_at) redirect("/");
  if (!profile) {
    return <p className="auth-loading">Your account profile is still being prepared. Try again in a moment.</p>;
  }

  return (
    <div className="auth-layout onboarding-layout">
      <section className="auth-intro">
        <p className="eyebrow">FIRST, THE BASICS</p>
        <h1>Make your shop <em>yours.</em></h1>
        <p>Choose a handle buyers can remember. Your mobile number stays private.</p>
      </section>
      <section className="auth-card" aria-labelledby="profile-title">
        <h2 id="profile-title">Set up your profile</h2>
        <p>You can change these details later.</p>
        <ProfileForm handle={profile.handle} displayName={profile.display_name} bio={profile.bio ?? ""} townId={profile.town_id} towns={towns ?? []} />
      </section>
    </div>
  );
}