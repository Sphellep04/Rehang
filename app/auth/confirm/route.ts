import { connection, NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/auth";

const allowedTypes: EmailOtpType[] = ["email", "recovery", "signup", "email_change", "magiclink"];

/** The link in confirmation and password reset emails lands here. */
export async function GET(request: NextRequest) {
  await connection();
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), "/");

  if (!isSupabaseConfigured() || !tokenHash || !type || !allowedTypes.includes(type)) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    return NextResponse.redirect(new URL(type === "recovery" ? "/forgot-password?error=expired" : "/login?error=link", origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
