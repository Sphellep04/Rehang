import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "../_components/page-loading";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { hydrateListings, ITEM_COLUMNS } from "@/lib/listings";
import { ListingCard } from "../_components/listing-card";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Saved | Rehang" };

export default function SavedPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading your saved pieces…" />}>
      <SavedContent />
    </Suspense>
  );
}

async function SavedContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login");

  const supabase = await createClient();
  const { data: favourites } = await supabase
    .from("favourites")
    .select("item_id,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const order = (favourites ?? []).map((row) => row.item_id as string);
  const { data: rows } = order.length
    ? await supabase.from("items").select(ITEM_COLUMNS).in("id", order)
    : { data: [] };

  const hydrated = await hydrateListings(supabase, (rows ?? []) as never);
  const position = new Map(order.map((id, index) => [id, index]));
  const listings = hydrated.sort((first, second) => (position.get(first.id) ?? 0) - (position.get(second.id) ?? 0));

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse">
        <div className="section-heading"><div><p className="eyebrow">YOUR LIST</p><h1 className="browse-title">Saved <em>pieces.</em></h1></div><p>{listings.length} {listings.length === 1 ? "piece" : "pieces"}</p></div>
        {listings.length ? (
          <div className="listing-grid">
            {listings.map((listing) => <ListingCard key={listing.id} listing={listing} saved signedIn />)}
          </div>
        ) : (
          <div className="empty-state"><span>♡</span><h3>Your saved pieces will live here.</h3><p>Tap the heart on a listing to keep it close.</p><Link className="plain-button" href="/browse">Browse listings</Link></div>
        )}
      </section>
    </main>
  );
}
