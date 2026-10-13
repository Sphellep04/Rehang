import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { currentTime, formatWindhoek, offerStatusLabel } from "@/lib/trade";
import { PageLoading } from "../_components/page-loading";
import { SiteHeader } from "../_components/site-header";
import { OfferActions } from "./offer-actions";

export const metadata: Metadata = { title: "Offers | Rehang" };

export default function OffersPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading your offers…" />}>
      <OffersContent />
    </Suspense>
  );
}

type OfferRow = {
  id: string; item_id: string; buyer_id: string; amount_cents: number; status: string;
  made_by_seller: boolean; expires_at: string; created_at: string;
};

async function OffersContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("offers")
    .select("id,item_id,buyer_id,amount_cents,status,made_by_seller,expires_at,created_at")
    .order("created_at", { ascending: false })
    .limit(60);

  const offers = (rows ?? []) as OfferRow[];
  const itemIds = [...new Set(offers.map((offer) => offer.item_id))];
  const { data: items } = itemIds.length
    ? await supabase.from("items").select("id,title,price_cents,seller_id,status").in("id", itemIds)
    : { data: [] };
  const itemById = new Map((items ?? []).map((item) => [item.id as string, item]));

  const partyIds = [...new Set(offers.flatMap((offer) => [offer.buyer_id, itemById.get(offer.item_id)?.seller_id as string | undefined]).filter((id): id is string => Boolean(id)))];
  const { data: profiles } = partyIds.length
    ? await supabase.from("public_profiles").select("id,display_name,handle").in("id", partyIds)
    : { data: [] };
  const nameById = new Map((profiles ?? []).map((profile) => [profile.id as string, profile.display_name as string]));

  const now = currentTime();
  const cards = offers.map((offer) => {
    const item = itemById.get(offer.item_id);
    const sellerId = item?.seller_id as string | undefined;
    const iAmSeller = sellerId === viewerId;
    const live = offer.status === "open" && new Date(offer.expires_at).getTime() > now;
    const needsMyAnswer = live && (iAmSeller ? !offer.made_by_seller : offer.made_by_seller);
    const canWithdraw = live && !iAmSeller && !offer.made_by_seller;
    const other = iAmSeller ? nameById.get(offer.buyer_id) : sellerId ? nameById.get(sellerId) : undefined;
    return { offer, item, iAmSeller, live, needsMyAnswer, canWithdraw, other };
  });

  const waiting = cards.filter((card) => card.needsMyAnswer);
  const rest = cards.filter((card) => !card.needsMyAnswer);

  function OfferCard({ card }: { card: (typeof cards)[number] }) {
    const { offer, item, iAmSeller, live, needsMyAnswer, canWithdraw, other } = card;
    const price = Math.round(Number(item?.price_cents ?? 0) / 100);
    const amount = Math.round(offer.amount_cents / 100);
    const status = offer.status === "open" && !live ? "Expired" : offerStatusLabel[offer.status] ?? offer.status;
    return (
      <li className="list-card" key={offer.id}>
        <div className="list-card-main">
          <Link href={`/item/${offer.item_id}`}><b>{(item?.title as string | undefined) ?? "Item"}</b></Link>
          <p>
            {offer.made_by_seller ? `${iAmSeller ? "You countered" : `${other ?? "Seller"} countered`} with` : `${iAmSeller ? `${other ?? "A buyer"} offered` : "You offered"}`} <b>N${amount.toLocaleString("en-ZA")}</b> (listed N${price.toLocaleString("en-ZA")})
          </p>
          <small>{status}{live ? ` · replies by ${formatWindhoek(offer.expires_at)}` : ""}</small>
        </div>
        {needsMyAnswer && <OfferActions offerId={offer.id} mode={iAmSeller ? "seller_answer" : "buyer_answer"} priceDollars={price} offerDollars={amount} />}
        {canWithdraw && <OfferActions offerId={offer.id} mode="buyer_withdraw" priceDollars={price} offerDollars={amount} />}
      </li>
    );
  }

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse">
        <div className="section-heading"><div><p className="eyebrow">NEGOTIATING</p><h1 className="browse-title">Your <em>offers.</em></h1></div><Link className="plain-button" href="/orders">View orders →</Link></div>
        {cards.length === 0 && <div className="empty-state"><span>♡</span><h3>No offers yet.</h3><p>Make an offer on an item you like, or wait for offers on yours.</p><Link className="plain-button" href="/browse">Browse listings</Link></div>}
        {waiting.length > 0 && <><h2 className="list-heading">Needs your answer</h2><ul className="list-cards">{waiting.map((card) => <OfferCard key={card.offer.id} card={card} />)}</ul></>}
        {rest.length > 0 && <><h2 className="list-heading">{waiting.length > 0 ? "Everything else" : "Recent"}</h2><ul className="list-cards">{rest.map((card) => <OfferCard key={card.offer.id} card={card} />)}</ul></>}
      </section>
    </main>
  );
}
