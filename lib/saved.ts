import type { SupabaseClient } from "@supabase/supabase-js";

/** Which of these items has the signed-in user saved? RLS limits the result to their own rows. */
export async function savedIdsFor(supabase: SupabaseClient, itemIds: string[]): Promise<Set<string>> {
  if (itemIds.length === 0) return new Set();
  const { data } = await supabase.from("favourites").select("item_id").in("item_id", itemIds);
  return new Set((data ?? []).map((row) => row.item_id as string));
}
