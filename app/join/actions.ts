"use server";

import { z } from "zod";
import { emailSchema } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export type JoinState = { status: "idle" | "done" | "error"; message?: string };

export async function joinWaitlist(_previous: JoinState, formData: FormData): Promise<JoinState> {
  // A hidden field real people never fill in. Bots usually do, and get the same friendly answer.
  if (String(formData.get("website") ?? "") !== "") return { status: "done", message: "You're on the list." };
  const parsed = z.object({
    email: emailSchema,
    role: z.enum(["buyer", "seller", "both"]),
    town: z.string().trim().max(40).optional(),
  }).safeParse({ email: formData.get("email"), role: formData.get("role") ?? "both", town: formData.get("town") || undefined });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  if (!isSupabaseConfigured()) return { status: "error", message: "The waiting list isn't open yet. Please check back soon." };

  const supabase = await createClient();
  const source = String(formData.get("source") ?? "").slice(0, 40);
  const { error } = await supabase.rpc("join_waitlist", { p_email: parsed.data.email, p_role: parsed.data.role, p_town: parsed.data.town ?? null, p_source: source || null });
  if (error) {
    if (error.message === "too_many_requests") return { status: "error", message: "A lot of people are joining right now. Please try again in a little while." };
    return { status: "error", message: "We couldn't add you right now. Please try again shortly." };
  }
  // The same answer whether or not the address was already on the list.
  return { status: "done", message: "You're on the list. We'll email you when a spot opens." };
}
