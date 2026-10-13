import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { formatWindhoek, orderStatusLabel } from "@/lib/trade";
import { PageLoading } from "../_components/page-loading";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Orders | Rehang" };

export default function OrdersPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading your orders…" />}>
      <OrdersContent />
    </Suspense>
  );
}

async function OrdersContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login");

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("orders")
    .select("id,item_id,buyer_id,seller_id,amount_cents,status,meetup_at,meetup_confirmed_at,created_at")
    .or(`buyer_id.eq.${viewerId},seller_id.eq.${viewerId}`)
    .order("created_at", { ascending: false })
    .limit(60);
  const orders = rows ?? [];

  const itemIds = [...new Set(orders.map((order) => order.item_id).filter((value): value is string => Boolean(value)))];
  const { data: items } = itemIds.length ? await supabase.from("items").select("id,title").in("id", itemIds) : { data: [] };
  const titleById = new Map((items ?? []).map((item) => [item.id as string, item.title as string]));

  const open = orders.filter((order) => order.status === "awaiting_meetup");
  const past = orders.filter((order) => order.status !== "awaiting_meetup");

  function Row({ order }: { order: (typeof orders)[number] }) {
    const buying = order.buyer_id === viewerId;
    const next = order.status !== "awaiting_meetup" ? "" : order.meetup_confirmed_at ? `Meet ${formatWindhoek(order.meetup_at)}` : order.meetup_at ? (buying ? "Waiting for the seller to confirm" : "Confirm the meet-up") : (buying ? "Choose a spot and time" : "Waiting for the buyer to pick a time");
    return (
      <li className="list-card">
        <div className="list-card-main">
          <Link href={`/orders/${order.id}`}><b>{titleById.get(order.item_id as string) ?? "Order"}</b></Link>
          <p>{buying ? "Buying" : "Selling"} · N${Math.round(Number(order.amount_cents) / 100).toLocaleString("en-ZA")}</p>
          <small>{orderStatusLabel[order.status] ?? order.status}{next ? ` · ${next}` : ""}</small>
        </div>
        <Link className="button button-outline" href={`/orders/${order.id}`}>Open</Link>
      </li>
    );
  }

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse">
        <div className="section-heading"><div><p className="eyebrow">MEET AND PAY IN PERSON</p><h1 className="browse-title">Your <em>orders.</em></h1></div><Link className="plain-button" href="/offers">View offers →</Link></div>
        {orders.length === 0 && <div className="empty-state"><span>♡</span><h3>No orders yet.</h3><p>When you buy or sell an item, it shows up here.</p><Link className="plain-button" href="/browse">Browse listings</Link></div>}
        {open.length > 0 && <><h2 className="list-heading">In progress</h2><ul className="list-cards">{open.map((order) => <Row key={order.id} order={order} />)}</ul></>}
        {past.length > 0 && <><h2 className="list-heading">History</h2><ul className="list-cards">{past.map((order) => <Row key={order.id} order={order} />)}</ul></>}
      </section>
    </main>
  );
}
