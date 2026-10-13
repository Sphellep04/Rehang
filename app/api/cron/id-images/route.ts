import { connection, NextResponse, type NextRequest } from "next/server";
import { cronAuthorised } from "@/lib/cron";
import { createClient } from "@supabase/supabase-js";

/**
 * Deletes ID photos 7 days after a decision. Runs daily (see vercel.json). Vercel sends
 * "Authorization: Bearer $CRON_SECRET". The service role key stays on the server.
 */
export async function GET(request: NextRequest) {
  await connection();
  if (!cronAuthorised(request)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: due, error } = await admin.rpc("id_images_due_for_deletion");
  if (error) return NextResponse.json({ error: "queue_unavailable" }, { status: 502 });

  const rows = (due ?? []) as { verification_id: string; document_path: string | null; selfie_path: string | null }[];
  const deletedIds: string[] = [];
  let failed = 0;

  for (const row of rows) {
    const paths = [row.document_path, row.selfie_path].filter((path): path is string => Boolean(path));
    const { error: removeError } = await admin.storage.from("id-documents").remove(paths);
    // Only forget the paths once the files are really gone, so a failed delete is retried tomorrow.
    if (removeError) failed += 1;
    else deletedIds.push(row.verification_id);
  }

  if (deletedIds.length) await admin.rpc("mark_id_images_deleted", { p_ids: deletedIds });
  return NextResponse.json({ checked: rows.length, deleted: deletedIds.length, failed });
}
