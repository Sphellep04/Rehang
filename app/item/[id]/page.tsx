import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageLoading } from "../../_components/page-loading";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { formatPrice, getListing, listingsForSeller } from "@/lib/listings";
import { savedIdsFor } from "@/lib/saved";
import { FollowButton } from "../../_components/follow-button";
import { ListingCard } from "../../_components/listing-card";
import { MessageSellerButton } from "../../_components/message-seller-button";
import { ReportButton } from "../../_components/report-button";
import { SaveButton } from "../../_components/save-button";
import { Stars } from "../../_components/stars";
import { TradePanel } from "../../_components/trade-panel";
import { SiteHeader } from "../../_components/site-header";

export async function generateMetadata({ params }: PageProps<"/item/[id]">): Promise<Metadata> {
  const { id } = await params;
  if (!isSupabaseConfigured()) return { title: "Item | Rehang" };
  const listing = await getListing(await createClient(), id);
  if (!listing) return { title: "Item not found | Rehang" };
  return {
    title: `${listing.title} · ${formatPrice(listing.price)} | Rehang`,
    description: `${listing.condition}, size ${listing.size}. Sold by ${listing.seller} in ${listing.town}.`,
    openGraph: listing.image ? { images: [listing.image] } : undefined,
  };
}

export default function ItemPage({ params }: PageProps<"/item/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading item…" />}>
      <ItemContent params={params} />
    </Suspense>
  );
}

async function ItemContent({ params }: { params: PageProps<"/item/[id]">["params"] }) {
  const { id } = await params;
  if (!isSupabaseConfigured()) notFound();

  const supabase = await createClient();
  const listing = await getListing(supabase, id);
  if (!listing) notFound();

  const viewerId = await getViewerId();
  const signedIn = viewerId !== null;
  const isOwner = viewerId === listing.sellerId;

  const [favouriteCount, saved, followResult, more, offerConfig, ratingResult] = await Promise.all([
    supabase.rpc("item_favourite_count", { p_item: listing.id }),
    signedIn ? savedIdsFor(supabase, [listing.id]) : Promise.resolve(new Set<string>()),
    signedIn && !isOwner
      ? supabase.from("follows").select("seller_id").eq("seller_id", listing.sellerId).maybeSingle()
      : Promise.resolve({ data: null }),
    listingsForSeller(supabase, listing.sellerId, "active"),
    supabase.from("app_config").select("value").eq("key", "minimum_offer_percent").maybeSingle(),
    supabase.rpc("rating_summary", { p_user: listing.sellerId }).maybeSingle(),
  ]);
  const rating = (ratingResult.data ?? { average: null, review_count: 0 }) as { average: number | null; review_count: number };
  const minimumPercent = Number(offerConfig.data?.value ?? 60) || 60;

  const others = more.filter((candidate) => candidate.id !== listing.id).slice(0, 3);
  const otherSaved = signedIn ? await savedIdsFor(supabase, others.map((candidate) => candidate.id)) : new Set<string>();
  const available = listing.status === "active";
  const savedCount = typeof favouriteCount.data === "number" ? favouriteCount.data : Number(favouriteCount.data ?? 0);

  return (
    <main>
      <SiteHeader signedIn={signedIn} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/browse">Browse</Link><span>/</span><span>{listing.category}</span>
      </nav>

      <section className="item-layout">
        <div className="item-photo">
          {listing.image
            ? <Image src={listing.image} alt={listing.title} width={900} height={1080} sizes="(max-width: 760px) 100vw, 50vw" priority unoptimized />
            : <div className="item-photo-empty">No photo</div>}
          {!available && <span className="item-status">{listing.status === "sold" ? "Sold" : "Reserved"}</span>}
        </div>

        <div className="item-details">
          <p className="eyebrow">{listing.category} · SIZE {listing.size}</p>
          <h1>{listing.title}</h1>
          <p className="item-price">{formatPrice(listing.price)}</p>
          <p className="item-meta">{listing.condition} condition · {listing.town}</p>
          {listing.description && <p className="item-description">{listing.description}</p>}

          {available && !isOwner && <TradePanel itemId={listing.id} price={listing.price} signedIn={signedIn} minimumPercent={minimumPercent} />}

          <div className="item-actions">
            {available && !isOwner && <MessageSellerButton itemId={listing.id} sellerId={listing.sellerId} />}
            {isOwner && <p className="item-note">This is your listing.</p>}
            {!available && !isOwner && <p className="item-note">This piece is no longer available. Browse similar items or follow the seller.</p>}
            {listing.status !== "sold" && (
              <span className="item-save">
                <SaveButton itemId={listing.id} title={listing.title} initialSaved={saved.has(listing.id)} signedIn={signedIn} className="save-button save-button-inline" />
                <small>{savedCount > 0 ? `${savedCount} saved` : "Save for later"}</small>
              </span>
            )}
          </div>

          <div className="item-seller">
            <Link className="item-seller-link" href={`/${listing.sellerHandle}`}>
              <span className="item-seller-avatar">{listing.seller.charAt(0).toUpperCase()}</span>
              <span>
                <b>{listing.seller}</b>
                <small>{listing.verified ? "Verified seller" : "Seller"}{listing.trusted ? " · Trusted" : ""}</small>
                <Stars value={rating.average === null ? null : Number(rating.average)} count={Number(rating.review_count)} label="New seller" />
              </span>
            </Link>
            {!isOwner && <FollowButton sellerId={listing.sellerId} sellerName={listing.seller} initialFollowing={Boolean(followResult.data)} signedIn={signedIn} />}
          </div>

          {!isOwner && <ReportButton targetType="item" targetId={listing.id} signedIn={signedIn} label="Report this listing" />}

          <p className="item-safety">Keep your conversation in Rehang and meet in a public place. Never send money before you have seen the item. Personal phone numbers stay private.</p>
        </div>
      </section>

      {others.length > 0 && (
        <section className="shop-section">
          <div className="section-heading"><div><p className="eyebrow">MORE FROM {listing.seller.toUpperCase()}</p><h2>Same <em>closet.</em></h2></div><Link href={`/${listing.sellerHandle}`}>View shop</Link></div>
          <div className="listing-grid">
            {others.map((candidate) => <ListingCard key={candidate.id} listing={candidate} saved={otherSaved.has(candidate.id)} signedIn={signedIn} showSeller={false} />)}
          </div>
        </section>
      )}
    </main>
  );
}
