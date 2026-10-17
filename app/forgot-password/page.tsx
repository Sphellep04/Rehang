import type { Metadata } from "next";
import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AuthShell } from "../_components/auth-shell";
import { ForgotPasswordForm } from "../login/auth-forms";

export const metadata: Metadata = { title: "Reset your password | Rehang" };

export default function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  return (
    <Suspense fallback={null}>
      <ForgotContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ForgotContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  return (
    <AuthShell
      title="Forgot your password?"
      lead="Enter your email and we will send you a link to choose a new one."
      intro="The link works once and expires soon."
      notice={query.error === "expired" ? "That reset link has expired or was already used. Ask for a new one." : undefined}
    >
      {isSupabaseConfigured() ? <ForgotPasswordForm /> : <div className="setup-notice" role="status">Password reset is waiting for the Supabase project settings.</div>}
    </AuthShell>
  );
}
