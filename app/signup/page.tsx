import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AuthShell } from "../_components/auth-shell";
import { SignUpForm } from "../login/auth-forms";

export const metadata: Metadata = { title: "Create an account | Rehang" };

export default function SignUpPage({ searchParams }: PageProps<"/signup">) {
  return (
    <AuthShell title="Create your account" lead="It takes a minute. We will email you a link to confirm your address." intro="Your email is private and is never shown to buyers or sellers.">
      <Suspense fallback={<p className="trade-hint">Loading…</p>}>
        <SignUpContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function SignUpContent({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  await connection();
  if (!isSupabaseConfigured()) return <div className="setup-notice" role="status">Sign-up is waiting for the Supabase project settings.</div>;
  const params = await searchParams;
  const invite = typeof params.invite === "string" ? params.invite.slice(0, 12).toUpperCase() : "";
  const supabase = await createClient();
  const { data: requiresInvite } = await supabase.rpc("signup_requires_invite");
  return <SignUpForm requiresInvite={requiresInvite === true} defaultInvite={invite} />;
}
