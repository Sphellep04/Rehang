import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { AuthShell } from "../_components/auth-shell";
import { ResetPasswordForm } from "../login/auth-forms";

export const metadata: Metadata = { title: "Choose a new password | Rehang" };

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetContent />
    </Suspense>
  );
}

async function ResetContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/login");
  // The emailed link signs the person in briefly. Without that, there is nothing to reset.
  if (!(await getViewerId())) redirect("/forgot-password?error=expired");
  return (
    <AuthShell title="Choose a new password" lead="Pick something you have not used on other sites." intro="You will stay signed in on this device.">
      <ResetPasswordForm />
    </AuthShell>
  );
}
