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
  title: "Give to a children's home | Rehang",
  description: "Pass on clothes you no longer wear to children's homes in Namibia, through Rehang.",
};

export default function DonatePage() {
  return (
    <Suspense fallback={<PageLoading label="Loading…" />}>
      <DonateContent />
    </Suspense>
  );
}

type Partner = { id: string; name: string; town_id: number | null; description: string | null; accepts: string | null };

const steps = [
  ["Pick an item", "Choose one of your own listings that is clean and in good condition."],
  ["Choose a home", "Each home on this page has been checked by the Rehang team."],
  ["We check and arrange it", "The team accepts the gift and arranges the handover with you. The home never sees your address or phone number."],
  ["It reaches the children", "We mark the gift as handed over and tell you."],
];

async function DonateContent() {
  await connection();
  const configured = isSupabaseConfigured();
  const supabase = configured ? await createClient() : null;
  const signedIn = (await getViewerId()) !== null;
  let enabled = false;
  let partners: Partner[] = [];
  let townName = new Map<number, string>();
  let totals = { items_given: 0, homes_helped: 0 };
  if (supabase) {
    const [{ data: flag }, { data: partnerRows }, { data: townRows }, { data: totalRows }] = await Promise.all([
      supabase.from("app_config").select("value").eq("key", "donations_enabled").maybeSingle(),
      supabase.from("donation_partners").select("id,name,town_id,description,accepts").eq("active", true).order("name"),
      supabase.from("towns").select("id,name"),
      supabase.rpc("donation_totals"),
    ]);
    enabled = flag?.value === true;
    partners = (partnerRows ?? []) as Partner[];
    townName = new Map((townRows ?? []).map((t) => [t.id as number, t.name as string]));
    const row = (Array.isArray(totalRows) ? totalRows[0] : totalRows) as { items_given: number; homes_helped: number } | null;
    if (row) totals = { items_given: Number(row.items_given), homes_helped: Number(row.homes_helped) };
  }

  return (
    <main>
      <SiteHeader signedIn={signedIn} />
      <section className="browse order-page">
        <p className="eyebrow">GIVE</p>
        <h1 className="browse-title">Pass it on to a <em>children&apos;s home.</em></h1>
        <p className="trade-hint">Clothes you have outgrown or no longer wear can keep a child warm. Give an item straight from your Rehang listings. It is free, and nobody has to meet anyone.</p>

        {totals.items_given > 0 && <p className="item-price">{totals.items_given} {totals.items_given === 1 ? "item" : "items"} given to {totals.homes_helped} {totals.homes_helped === 1 ? "home" : "homes"} so far</p>}

        {!enabled ? (
          <div className="empty-state"><span>♡</span><h3>Giving opens soon.</h3><p>We are choosing and visiting the first homes before we switch this on. Every home is checked by the Rehang team.</p></div>
        ) : (
          <>
            <Link className="button button-coral" href={signedIn ? "/donate/give" : "/login?next=/donate/give"}>Give an item</Link>
            <h2 className="list-heading">How it works</h2>
            <ol className="list-cards">
              {steps.map(([title, text], index) => (
                <li className="list-card" key={title}><div className="list-card-main"><b>{index + 1}. {title}</b><p>{text}</p></div></li>
              ))}
            </ol>
            <h2 className="list-heading">Homes you can give to</h2>
            {partners.length === 0 ? <p className="trade-hint">No homes are listed yet.</p> : (
              <ul className="list-cards">
                {partners.map((partner) => (
                  <li className="list-card" key={partner.id}>
                    <div className="list-card-main">
                      <b>{partner.name}</b>
                      {partner.town_id && <small>{townName.get(partner.town_id)}</small>}
                      {partner.description && <p>{partner.description}</p>}
                      {partner.accepts && <p><b>Needs:</b> {partner.accepts}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <h2 className="list-heading">Good to know</h2>
            <ul className="policy-list">
              <li>Only clean clothes in good condition. Nothing worn out, stained or damaged.</li>
              <li>We never share your address or phone number with a home, and you never contact the children.</li>
              <li>The team can decline a gift if the home cannot use it. The item then goes back to your listings.</li>
              <li>Rehang does not pass on any money. This page is for items only.</li>
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
