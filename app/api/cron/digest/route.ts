import { connection, NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron";
import { renderDigestEmail, type DigestItem } from "@/lib/email";
import { sendEmail } from "@/lib/resend";
import { createAdminClient } from "@/lib/supabase/admin";

type Candidate = { user_id: string; email: string; display_name: string | null; items: DigestItem[]; item_count: number };

/** Daily summary of new listings from sellers a person follows. */
export async function GET(request: NextRequest) {
  await connection();
  if (!cronAuthorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const { data, error } = await admin.rpc("digest_candidates");
  if (error) return NextResponse.json({ error: "queue_unavailable" }, { status: 502 });

  const sent: string[] = [];
  let failed = 0;
  for (const row of (data ?? []) as Candidate[]) {
    if (await sendEmail(row.email, renderDigestEmail(row.items ?? [], row.item_count, row.display_name))) sent.push(row.user_id);
    else failed += 1;
  }
  if (sent.length) await admin.rpc("mark_digest_sent", { p_users: sent });
  return NextResponse.json({ sent: sent.length, failed });
}
