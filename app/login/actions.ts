"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { emailSchema, passwordSchema, safeNext } from "@/lib/auth";

export type AuthState = { status: "idle" | "error" | "done"; message?: string };

const notConfigured: AuthState = { status: "error", message: "Sign-in is not set up yet. Add the Supabase settings first." };

async function siteOrigin() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function signIn(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password.").max(72) }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  if (!isSupabaseConfigured()) return notConfigured;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    // The same message for a wrong password and an unknown email, so nobody can probe for accounts.
    const unconfirmed = error?.code === "email_not_confirmed";
    return { status: "error", message: unconfirmed ? "Please confirm your email first. We sent you a link when you signed up." : "That email and password don't match." };
  }

  const { data: profile } = await supabase.from("users").select("terms_accepted_at,status").eq("id", data.user.id).maybeSingle();
  if (profile?.status === "deleted") {
    await supabase.auth.signOut();
    return { status: "error", message: "That email and password don't match." };
  }
  if (!profile?.terms_accepted_at) redirect("/onboarding");
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email: emailSchema, password: passwordSchema }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  if (formData.get("confirm") !== formData.get("password")) return { status: "error", message: "The two passwords don't match." };
  if (!isSupabaseConfigured()) return notConfigured;

  const supabase = await createClient();
  // In invite-only mode the database refuses sign-ups without a valid code. Checking first gives a clear message.
  const { data: inviteOnly } = await supabase.rpc("signup_requires_invite");
  const invite = String(formData.get("invite") ?? "").trim().toUpperCase();
  if (inviteOnly === true) {
    const { data: valid } = await supabase.rpc("check_invite", { p_code: invite });
    if (valid !== true) return { status: "error", message: "That invite code isn't valid or has been used. Join the waiting list to get one." };
  }
  const { error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/onboarding`,
      ...(inviteOnly === true ? { data: { invite_code: invite } } : {}),
    },
  });
  if (error) {
    if (error.code === "weak_password") return { status: "error", message: "That password is too easy to guess. Try a longer one." };
    return { status: "error", message: "We couldn't create your account right now. Please try again shortly." };
  }
  // The same answer whether or not the email was already registered.
  return { status: "done", message: "Check your inbox. We sent a link to confirm your email." };
}

export async function requestPasswordReset(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  if (!isSupabaseConfigured()) return notConfigured;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${await siteOrigin()}/auth/confirm?next=/reset-password` });
  // Always the same reply, so this form cannot be used to find out who has an account.
  return { status: "done", message: "If that email has an account, a reset link is on its way." };
}

export async function updatePassword(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message };
  if (formData.get("confirm") !== formData.get("password")) return { status: "error", message: "The two passwords don't match." };
  if (!isSupabaseConfigured()) return notConfigured;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return { status: "error", message: "This reset link has expired. Ask for a new one." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (error.code === "same_password") return { status: "error", message: "Choose a password you haven't used before." };
    return { status: "error", message: "We couldn't change your password. Ask for a new link and try again." };
  }
  redirect("/");
}

export async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
