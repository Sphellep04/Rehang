import { connection, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { parseFilters, searchListings } from "@/lib/listings";

export async function GET(request: Request) {
  // Always answer at request time, never from a build-time snapshot.
  await connection();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ source: "examples" as const, listings: null });
  }

  const filters = parseFilters(new URL(request.url).searchParams);
  const supabase = await createClient();
  const result = await searchListings(supabase, filters);

  if (!result) {
    return NextResponse.json({ error: "listings_unavailable" }, { status: 503 });
  }

  return NextResponse.json({ source: "live" as const, ...result });
}
