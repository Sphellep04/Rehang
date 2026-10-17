import { connection, NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

/** Gives or removes the Trusted seller badge. Safe to run more than once a day. */
export async function GET(request: NextRequest) {
  await connection();
  if (!cronAuthorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const { data, error } = await admin.rpc("refresh_trusted_sellers");
  if (error) return NextResponse.json({ error: "job_failed" }, { status: 502 });
  return NextResponse.json(data);
}
