import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "../_components/page-loading";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { listingsForSeller } from "@/lib/listings";
import { savedIdsFor } from "@/lib/saved";
import { FollowButton } from "../_components/follow-button";
import { ListingCard } from "../_components/listing-card";
import { SiteHeader } from "../_components/site-header";

const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

async function loadShop(handle: string) {
  if (!isSupabaseConfigured() || !HANDLE_PATTERN.test(handle)) return null;
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("public_profiles")
    .select("id,handle,display_name,photo_url,bio,town,verification_level,is_trusted_seller,is_founding_seller,created_at")
    .eq("handle", handle)
    .maybeSingle();
  return profile ? { supabase, profile } : null;
}

export async function generateMetadata({ params }: PageProps<"/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const shop = await loadShop(handle);
  if (!shop) return { title: "Shop not found | Rehang" };
  const name = shop.profile.display_name as string;
  return {
    title: `${name} (@${handle}) | Rehang`,
    description: (shop.profile.bio as string | null) || `Second-hand clothes from ${name} on Rehang.`,
  };
}

export default function ShopPage({ params }: PageProps<"/[handle]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading shop…" />}>
      <ShopContent params={params} />
    </Suspense>
  );
}

async function ShopContent({ params }: { params: PageProps<"/[handle]">["params"] }) {
  const { handle } = await params;
  const shop = await loadShop(handle);
  if (!shop) notFound();

  const { supabase, profile } = shop;
  const sellerId = profile.id as string;
  const viewerId = await getViewerId();
  const signedIn = viewerId !== null;
  const isOwner = viewerId === sellerId;

  const [statsResult, active, sold, followResult] = await Promise.all([
    supabase.rpc("shop_stats", { p_seller: sellerId }).maybeSingle(),
    listingsForSeller(supabase, sellerId, "active"),
    listingsForSeller(supabase, sellerId, "sold"),
    viewerId && !isOwner
      ? supabase.from("follows").select("seller_id").eq("seller_id", sellerId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const stats = (statsResult.data ?? { follower_count: 0, active_count: 0, sold_count: 0 }) as {
    follower_count: number; active_count: number; sold_count: number;
  };
  const saved = signedIn ? await savedIdsFor(supabase, active.map((listing) => listing.id)) : new Set<string>();
  const name = profile.display_name as string;
  const joined = new Date(profile.created_at as string).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <main>
      <SiteHeader signedIn={signedIn} />
      <section className="shop-hero">
        <div className="shop-avatar" aria-hidden={profile.photo_url ? undefined : true}>
          {profile.photo_url
            ? <Image src={profile.photo_url as string} alt={`${name}'s profile photo`} width={96} height={96} unoptimized />
            : <span>{name.charAt(0).toUpperCase()}</span>}
        </div>
        <div className="shop-hero-body">
          <p className="eyebrow">@{handle}{profile.town ? ` · ${profile.town}` : ""}</p>
          <h1>{name}</h1>
          <p className="shop-badges">
            {profile.verification_level === "level2" && <span className="badge badge-green">Verified seller</span>}
            {profile.is_trusted_seller && <span className="badge badge-green">Trusted seller</span>}
            {profile.is_founding_seller && <span className="badge">Founding seller</span>}
          </p>
          {profile.bio && <p className="shop-bio">{profile.bio as string}</p>}
          <dl className="shop-stats">
            <div><dt>For sale</dt><dd>{stats.active_count}</dd></div>
            <div><dt>Sold</dt><dd>{stats.sold_count}</dd></div>
            <div><dt>Followers</dt><dd>{stats.follower_count}</dd></div>
            <div><dt>Joined</dt><dd>{joined}</dd></div>
          </dl>
        </div>
        <div className="shop-actions">
          {isOwner
            ? <Link className="button button-outline" href="/sell">Add a listing</Link>
            : <FollowButton sellerId={sellerId} sellerName={name} initialFollowing={Boolean(followResult.data)} signedIn={signedIn} />}
        </div>
      </section>

      <section className="shop-section">
        <div className="section-heading"><div><p className="eyebrow">AVAILABLE NOW</p><h2>In the <em>closet.</em></h2></div></div>
        {active.length ? (
          <div className="listing-grid">
            {active.map((listing) => <ListingCard key={listing.id} listing={listing} saved={saved.has(listing.id)} signedIn={signedIn} showSeller={false} />)}
          </div>
        ) : (
          <div className="empty-state"><span>♡</span><h3>Nothing listed right now.</h3><p>{isOwner ? "Add your first item to open your shop." : "Follow this shop to see new pieces first."}</p></div>
        )}
      </section>

      {sold.length > 0 && (
        <section className="shop-section shop-sold">
          <div className="section-heading"><div><p className="eyebrow">ALREADY HUNG AGAIN</p><h2>Sold <em>pieces.</em></h2></div></div>
          <div className="listing-grid">
            {sold.map((listing) => <ListingCard key={listing.id} listing={listing} saved={false} signedIn={signedIn} showSeller={false} />)}
          </div>
        </section>
      )}
    </main>
  );
}
