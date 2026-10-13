import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { PageLoading } from "../_components/page-loading";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = {
  title: "Safe meet-up spots | Rehang",
  description: "Public places in Namibia where Rehang buyers and sellers meet, plus simple tips for a safe handover.",
};

export default function SafeSpotsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading meet-up spots…" />}>
      <SafeSpotsContent />
    </Suspense>
  );
}

type Spot = { id: number; name: string; address: string; opens: string; closes: string; town_id: number };

const tips = [
  ["Meet in daylight", "Pick a time inside the spot's opening hours, and arrive a few minutes early."],
  ["Stay in public", "Stay where there are other people, such as a mall entrance or a busy walkway. Don't move to a car park or a private place."],
  ["Bring a friend if you can", "Tell someone where you are going and when you expect to be back."],
  ["Check the item first", "Look at the item properly before you pay. Compare it with the listing photos."],
  ["Pay on handover, then share the code", "The buyer pays the seller in cash, holding the item. Only then does the buyer read out the meet-up code for the seller to enter."],
  ["Never pay in advance", "No deposits, no delivery fees, no bank transfers before meeting. Report anyone who asks."],
  ["Something feels wrong? Leave", "You can cancel from the order page, and report a problem afterwards."],
];

function mapLink(address: string, town: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address}, ${town}, Namibia`)}`;
}

async function SafeSpotsContent() {
  await connection();
  const configured = isSupabaseConfigured();
  const supabase = configured ? await createClient() : null;
  const signedIn = (await getViewerId()) !== null;
  const [{ data: spotRows }, { data: townRows }] = supabase
    ? await Promise.all([
        supabase.from("meetup_spots").select("id,name,address,opens,closes,town_id").eq("active", true).order("name"),
        supabase.from("towns").select("id,name"),
      ])
    : [{ data: [] }, { data: [] }];
  const spots = (spotRows ?? []) as Spot[];
  const townName = new Map((townRows ?? []).map((town) => [town.id as number, town.name as string]));
  const byTown = new Map<string, Spot[]>();
  for (const spot of spots) {
    const name = townName.get(spot.town_id) ?? "Namibia";
    byTown.set(name, [...(byTown.get(name) ?? []), spot]);
  }
  const hhmm = (time: string) => time.slice(0, 5);

  return (
    <main>
      <SiteHeader signedIn={signedIn} />
      <section className="browse order-page">
        <p className="eyebrow">MEET SAFELY</p>
        <h1 className="browse-title">Safe meet-up <em>spots.</em></h1>
        <p className="trade-hint">Rehang meet-ups happen in busy public places. When you place an order, the buyer picks one of these and a time, and the seller confirms.</p>

        {byTown.size === 0 ? (
          <div className="empty-state"><span>⌖</span><h3>Spots are being confirmed.</h3><p>We are visiting each location to check the opening hours, lighting and security before we list it. Check back soon.</p></div>
        ) : (
          [...byTown.entries()].map(([town, list]) => (
            <div key={town}>
              <h2 className="list-heading">{town}</h2>
              <ul className="list-cards">
                {list.map((spot) => (
                  <li className="list-card" key={spot.id}>
                    <div className="list-card-main">
                      <b>{spot.name}</b>
                      <p>{spot.address}</p>
                      <small>Open {hhmm(spot.opens)} to {hhmm(spot.closes)}</small>
                    </div>
                    <a className="plain-button" href={mapLink(spot.address, town)} target="_blank" rel="noopener noreferrer">Open in Maps</a>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        <h2 className="list-heading">Seven habits for a safe handover</h2>
        <ol className="safety-tips">
          {tips.map(([title, text]) => <li key={title}><b>{title}.</b> {text}</li>)}
        </ol>
        <p className="trade-hint">Rehang never shows your home address or live location to other members. <Link href="/buyer-protection">How buyer protection works</Link> · <Link href="/seller-rules">Seller rules</Link></p>
      </section>
    </main>
  );
}
