import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { PageLoading } from "../../_components/page-loading";
import { SiteHeader } from "../../_components/site-header";
import { GiveForm, CancelGift } from "./give-form";

export const metadata: Metadata = { title: "Give an item | Rehang", robots: { index: false, follow: false } };

export default function GivePage() {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <GiveContent />
    </Suspense>
  );
}

const statusText: Record<string, string> = {
  offered: "Waiting for the team",
  accepted: "Accepted, handover being arranged",
  collected: "Handed over. Thank you!",
  declined: "Could not be placed",
  cancelled: "Cancelled",
};

async function GiveContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/donate");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login?next=/donate/give");
  const supabase = await createClient();
  const [{ data: flag }, { data: items }, { data: partners }, { data: gifts }] = await Promise.all([
    supabase.from("app_config").select("value").eq("key", "donations_enabled").maybeSingle(),
    supabase.from("items").select("id,title").eq("seller_id", viewerId).in("status", ["draft", "active"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("donation_partners").select("id,name").eq("active", true).order("name"),
    supabase.from("donations").select("id,item_id,status,decision_note,created_at,donation_partners(name)").eq("donor_id", viewerId).order("created_at", { ascending: false }).limit(30),
  ]);
  if (flag?.value !== true) redirect("/donate");
  const titles = new Map<string, string>();
  const giftItemIds = (gifts ?? []).map((g) => g.item_id as string);
  if (giftItemIds.length) {
    const { data: giftItems } = await supabase.from("items").select("id,title").in("id", giftItemIds);
    for (const row of giftItems ?? []) titles.set(row.id as string, row.title as string);
  }

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <p className="eyebrow">GIVE</p>
        <h1 className="browse-title">Give an <em>item.</em></h1>
        <p className="trade-hint">Choose one of your listings and a home. The item comes off sale while the team arranges the handover. You can cancel until it has been handed over.</p>
        <GiveForm items={(items ?? []) as { id: string; title: string }[]} partners={(partners ?? []) as { id: string; name: string }[]} />

        <h2 className="list-heading">Your gifts</h2>
        {(gifts ?? []).length === 0 ? <p className="trade-hint">Nothing yet.</p> : (
          <ul className="list-cards">
            {(gifts ?? []).map((gift) => {
              const partner = gift.donation_partners as unknown as { name: string } | { name: string }[] | null;
              const partnerName = Array.isArray(partner) ? partner[0]?.name : partner?.name;
              return (
                <li className="list-card" key={gift.id as string}>
                  <div className="list-card-main">
                    <b>{titles.get(gift.item_id as string) ?? "Item"}</b>
                    <p>To {partnerName ?? "a children's home"}</p>
                    <small>{statusText[gift.status as string] ?? gift.status}</small>
                    {gift.status === "declined" && gift.decision_note && <p>Reason: {gift.decision_note as string}</p>}
                  </div>
                  {(gift.status === "offered" || gift.status === "accepted") && <CancelGift id={gift.id as string} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
