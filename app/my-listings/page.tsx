import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { formatPrice, myListings } from "@/lib/listings";
import { PageLoading } from "../_components/page-loading";
import { SiteHeader } from "../_components/site-header";
import { ListingActions } from "./listing-actions";

export const metadata: Metadata = { title: "My listings | Rehang" };

export default function MyListingsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading your listings…" />}>
      <MyListingsContent />
    </Suspense>
  );
}

const statusLabel: Record<string, string> = {
  draft: "Draft, not published",
  awaiting_verification: "Waiting for ID verification",
  active: "Live",
  reserved: "Reserved for a buyer",
  sold: "Sold",
  removed: "Removed",
};

async function MyListingsContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login?next=/my-listings");

  const supabase = await createClient();
  const listings = await myListings(supabase, viewerId);
  const soldIds = listings.filter((listing) => listing.status === "sold").map((listing) => listing.id);
  const { data: completed } = soldIds.length
    ? await supabase.from("orders").select("item_id").eq("status", "completed").in("item_id", soldIds)
    : { data: [] };
  const completedIds = new Set((completed ?? []).map((row) => row.item_id as string));

  const order = ["draft", "awaiting_verification", "active", "reserved", "sold", "removed"];
  const groups = order.map((status) => ({ status, items: listings.filter((listing) => listing.status === status) })).filter((group) => group.items.length > 0);

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse">
        <div className="section-heading"><div><p className="eyebrow">YOUR CLOSET</p><h1 className="browse-title">My <em>listings.</em></h1></div><Link className="button button-coral" href="/sell">Add an item +</Link></div>
        {listings.length === 0 && <div className="empty-state"><span>♡</span><h3>Your closet is empty.</h3><p>Add your first item and it will show here.</p><Link className="plain-button" href="/sell">Add an item</Link></div>}
        {groups.map((group) => (
          <div key={group.status}>
            <h2 className="list-heading">{statusLabel[group.status]} ({group.items.length})</h2>
            <ul className="list-cards">
              {group.items.map((listing) => {
                const canRelist = (listing.status === "removed" && listing.removedReason === "seller") || (listing.status === "sold" && !completedIds.has(listing.id));
                return (
                  <li className="list-card" key={listing.id}>
                    <span className="mini-thumb">{listing.image ? <Image src={listing.image} alt="" width={64} height={78} unoptimized /> : <span>♡</span>}</span>
                    <div className="list-card-main">
                      <Link href={`/item/${listing.id}`}><b>{listing.title}</b></Link>
                      <p>{formatPrice(listing.price)} · Size {listing.size} · {listing.category}</p>
                      <small>{statusLabel[listing.status]}{listing.status === "removed" && listing.removedReason !== "seller" ? " by our team" : ""}</small>
                    </div>
                    <ListingActions itemId={listing.id} status={listing.status} canRelist={canRelist} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
