import { connection, NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron";
import { renderNotificationEmail } from "@/lib/email";
import { sendEmail } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";

type Due = { notification_id: string; email: string; display_name: string | null; kind: string; payload: Record<string, unknown> };

/** Queues meet-up reminders, then emails any notifications that are waiting. Only marks a row done once Resend accepted it. */
export async function GET(request: NextRequest) {
  await connection();
  if (!cronAuthorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data: reminders } = await admin.rpc("queue_meetup_reminders");
  const { data: due, error } = await admin.rpc("emails_due", { p_limit: 100 });
  if (error) return NextResponse.json({ error: "queue_unavailable" }, { status: 502 });

  const sentIds: string[] = [];
  const skippedIds: string[] = [];
  let failed = 0;
  for (const row of (due ?? []) as Due[]) {
    const rendered = renderNotificationEmail(row.kind, row.payload ?? {}, row.display_name);
    if (!rendered) { skippedIds.push(row.notification_id); continue; }
    if (await sendEmail(row.email, rendered)) sentIds.push(row.notification_id);
    else failed += 1;
  }
  // In-app only kinds are closed out so they are not reconsidered every run.
  const done = [...sentIds, ...skippedIds];
  if (done.length) await admin.rpc("mark_emailed", { p_ids: done });
  return NextResponse.json({ reminders_queued: reminders ?? 0, sent: sentIds.length, skipped: skippedIds.length, failed });
}
