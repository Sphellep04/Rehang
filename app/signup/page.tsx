import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { AuthShell } from "../_components/auth-shell";
import { SignUpForm } from "../login/auth-forms";

export const metadata: Metadata = { title: "Create an account | Rehang" };

export default function SignUpPage() {
  return (
    <AuthShell title="Create your account" lead="It takes a minute. We will email you a link to confirm your address." intro="Your email is private and is never shown to buyers or sellers.">
      {isSupabaseConfigured() ? <SignUpForm /> : <div className="setup-notice" role="status">Sign-up is waiting for the Supabase project settings.</div>}
    </AuthShell>
  );
}
