import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { formatWindhoek } from "@/lib/trade";
import { PageLoading } from "../../_components/page-loading";
import { SiteHeader } from "../../_components/site-header";
import { GiftDecision, PartnerForm } from "./gift-tools";

export const metadata: Metadata = { title: "Gifts | Rehang", robots: { index: false, follow: false } };

export default function AdminDonationsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading gifts…" />}>
      <AdminDonationsContent />
    </Suspense>
  );
}

async function AdminDonationsContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login?next=/admin/donations");
  const supabase = await createClient();
  const { data: me } = await supabase.from("users").select("role").eq("id", viewerId).maybeSingle();
  if (me?.role !== "moderator" && me?.role !== "admin") notFound();

  const { data: contacts, error } = await supabase.rpc("donation_partner_contacts");
  if (error?.message === "mfa_required") redirect("/admin/security");
  const [{ data: gifts }, { data: partnerRows }, { data: towns }] = await Promise.all([
    supabase.from("donations").select("id,item_id,status,note,created_at,donation_partners(name)").in("status", ["offered", "accepted"]).order("created_at"),
    supabase.from("donation_partners").select("id,name,town_id,description,accepts,active").order("name"),
    supabase.from("towns").select("id,name").order("name"),
  ]);
  const itemIds = (gifts ?? []).map((g) => g.item_id as string);
  const items = new Map<string, string>();
  if (itemIds.length) {
    const { data } = await supabase.from("items").select("id,title").in("id", itemIds);
    for (const row of data ?? []) items.set(row.id as string, row.title as string);
  }
  const contactById = new Map(((contacts ?? []) as { id: string; contact: string | null }[]).map((c) => [c.id, c.contact]));
  const isAdmin = me?.role === "admin";

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <p className="eyebrow">STAFF ONLY</p>
        <h1 className="browse-title">Gifts to <em>children&apos;s homes.</em></h1>
        <p className="trade-hint">Accept a gift once the home confirms it can use it, then mark it collected after the handover. Never share a donor&apos;s address or phone number with a home, and never pass on a home&apos;s details to a donor. Arrange handovers through the team.</p>

        <h2 className="list-heading">Waiting</h2>
        {(gifts ?? []).length === 0 ? <p className="trade-hint">No gifts waiting.</p> : (
          <ul className="list-cards">
            {(gifts ?? []).map((gift) => {
              const partner = gift.donation_partners as unknown as { name: string } | { name: string }[] | null;
              const name = Array.isArray(partner) ? partner[0]?.name : partner?.name;
              return (
                <li className="list-card" key={gift.id as string}>
                  <div className="list-card-main">
                    <b>{items.get(gift.item_id as string) ?? "Item"}</b>
                    <p>For {name} · {gift.status === "offered" ? "new" : "accepted"} · {formatWindhoek(gift.created_at as string)}</p>
                    {gift.note && <p>Donor note: {gift.note as string}</p>}
                    <GiftDecision id={gift.id as string} status={gift.status as string} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <h2 className="list-heading">Homes</h2>
        <ul className="list-cards">
          {(partnerRows ?? []).map((p) => (
            <li className="list-card" key={p.id as string}>
              <div className="list-card-main">
                <b>{p.name as string}{p.active ? "" : " (not shown)"}</b>
                {p.description && <p>{p.description as string}</p>}
                <small>Contact (staff only): {contactById.get(p.id as string) ?? "none saved"}</small>
              </div>
            </li>
          ))}
        </ul>
        {isAdmin ? <PartnerForm towns={(towns ?? []) as { id: number; name: string }[]} /> : <p className="trade-hint">Only admins can add or change homes.</p>}
      </section>
    </main>
  );
}
