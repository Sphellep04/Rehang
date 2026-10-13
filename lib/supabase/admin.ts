import "server-only";

import { createClient } from "@supabase/supabase-js";

/** Full-access client for trusted server code only. Returns null when the service key is not set. */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
