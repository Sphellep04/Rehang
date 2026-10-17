import type { Metadata } from "next";
import { Suspense } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/auth";
import { AuthShell } from "../_components/auth-shell";
import { SignInForm } from "./auth-forms";

export const metadata: Metadata = { title: "Sign in | Rehang" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <Suspense fallback={null}>
      <LoginContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function LoginContent({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const next = safeNext(Array.isArray(query.next) ? query.next[0] : query.next);
  const linkProblem = query.error === "link";

  return (
    <AuthShell
      title="Welcome back"
      lead="Sign in with your email and password."
      intro="Your email is private and is never shown to buyers or sellers."
      notice={linkProblem ? "That link has expired or was already used. Sign in, or ask for a new one." : undefined}
    >
      {isSupabaseConfigured() ? <SignInForm next={next} /> : <div className="setup-notice" role="status">Sign-in is waiting for the Supabase project settings. The marketplace preview is still available.</div>}
    </AuthShell>
  );
}
