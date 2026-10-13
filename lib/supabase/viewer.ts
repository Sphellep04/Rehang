import "server-only";

import { createClient } from "./server";
import { isSupabaseConfigured } from "./env";

/** The signed-in user's id, or null for visitors and when Supabase is not configured. */
export async function getViewerId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}
