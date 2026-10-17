"use server";

import { renderInviteEmail } from "@/lib/email";
import { sendEmail } from "@/lib/resend";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { tradeError } from "@/lib/trade";

export type InviteResult = { ok: boolean; message: string; code?: string };

/** Makes a single-use code for someone on the waiting list and emails it to them. Only moderators get past the database check. */
export async function inviteFromWaitlist(waitlistId: string): Promise<InviteResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Not set up yet." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("invite_from_waitlist", { p_waitlist: waitlistId });
  if (error) return { ok: false, message: tradeError(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as { email: string; code: string } | null;
  if (!row) return { ok: false, message: "Something went wrong. Please try again." };
  const sent = await sendEmail(row.email, renderInviteEmail(row.code));
  return sent
    ? { ok: true, message: `Invite emailed to ${row.email}.`, code: row.code }
    : { ok: false, message: `The code is ${row.code} but the email could not be sent. Send it to ${row.email} yourself.`, code: row.code };
}

export async function createInviteCode(maxUses: number, days: number, note: string): Promise<InviteResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Not set up yet." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invite", { p_max_uses: maxUses, p_days: days, p_note: note.trim() || null });
  if (error) return { ok: false, message: tradeError(error.message) };
  return { ok: true, message: "Code created.", code: String(data) };
}
