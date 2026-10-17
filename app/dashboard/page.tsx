import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { PageLoading } from "../_components/page-loading";
import { SiteHeader } from "../_components/site-header";

export const metadata: Metadata = { title: "Seller dashboard | Rehang", robots: { index: false, follow: false } };

type Dashboard = {
  todo: { confirm_meetup: number; to_post: number; offers_to_answer: number; disputes_to_answer: number; meetups_today: number };
  money: { sold_30d_cents: number; commission_30d_cents: number; sold_total_cents: number; payout_pending_cents: number; paid_out_cents: number; refunded_30d_cents: number };
  weeks: { week_start: string; sales: number; sold_cents: number }[];
  listings: { active: number; reserved: number; drafts: number; sold: number; given: number };
  top_items: { id: string; title: string; price_cents: number; views_7d: number; saves: number }[];
  rating: { average: number | null; count: number } | null;
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading your dashboard…" />}>
      <DashboardContent />
    </Suspense>
  );
}

const nad = (cents: number) => `N$${Math.round(cents / 100).toLocaleString("en-ZA")}`;

async function DashboardContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login?next=/dashboard");
  const supabase = await createClient();
  const [{ data }, { data: flags }] = await Promise.all([
    supabase.rpc("seller_dashboard"),
    supabase.from("app_config").select("key,value").in("key", ["payments_enabled", "commission_bps"]),
  ]);
  const d = data as Dashboard | null;
  const paymentsOn = (flags ?? []).find((row) => row.key === "payments_enabled")?.value === true;
  const commissionBps = Number((flags ?? []).find((row) => row.key === "commission_bps")?.value ?? 0) || 0;

  const todo: { count: number; label: string; href: string }[] = d ? [
    { count: d.todo.meetups_today, label: "meet-ups today", href: "/orders" },
    { count: d.todo.confirm_meetup, label: "meet-ups to confirm", href: "/orders" },
    { count: d.todo.to_post, label: "paid orders to post", href: "/orders" },
    { count: d.todo.offers_to_answer, label: "offers to answer", href: "/offers" },
    { count: d.todo.disputes_to_answer, label: "reported problems to answer", href: "/orders" },
  ].filter((row) => row.count > 0) : [];
  const maxWeek = Math.max(1, ...(d?.weeks ?? []).map((week) => Number(week.sold_cents)));

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <p className="eyebrow">YOUR SHOP</p>
        <h1 className="browse-title">Seller <em>dashboard.</em></h1>
        {!d ? <p className="trade-hint">We couldn&apos;t load your numbers. Please try again.</p> : (
          <>
            <h2 className="list-heading">Needs your attention</h2>
            {todo.length === 0
              ? <p className="trade-hint">Nothing waiting. Nice work.</p>
              : <ul className="list-cards">{todo.map((row) => <li className="list-card" key={row.label}><div className="list-card-main"><b>{row.count} {row.label}</b></div><Link className="button button-outline" href={row.href}>Open</Link></li>)}</ul>}

            <h2 className="list-heading">Sales</h2>
            <dl className="order-facts seller-stats" aria-label="Sales">
              <div><dt>Sold, last 30 days</dt><dd>{nad(d.money.sold_30d_cents)}</dd></div>
              <div><dt>Sold in total</dt><dd>{nad(d.money.sold_total_cents)}</dd></div>
              <div><dt>Commission, last 30 days</dt><dd>{nad(d.money.commission_30d_cents)}</dd></div>
              {d.money.refunded_30d_cents > 0 && <div><dt>Refunded to buyers, 30 days</dt><dd>{nad(d.money.refunded_30d_cents)}</dd></div>}
              {paymentsOn && <div><dt>Payout on its way</dt><dd>{nad(d.money.payout_pending_cents)}</dd></div>}
              {paymentsOn && <div><dt>Paid out so far</dt><dd>{nad(d.money.paid_out_cents)}</dd></div>}
            </dl>
            <p className="trade-hint">Meet-up sales are paid to you in cash at the handover, so they appear here as sold but never as a payout.{commissionBps === 0 ? " There is no commission at the moment." : ""}</p>

            <h2 className="list-heading">Last 8 weeks</h2>
            <table className="metrics-table" aria-label="Sales by week">
              <thead><tr><th scope="col">Week from</th><th scope="col">Sales</th><th scope="col">Sold</th><th scope="col"><span className="sr-only">Chart</span></th></tr></thead>
              <tbody>
                {d.weeks.map((week) => (
                  <tr key={week.week_start}>
                    <th scope="row">{week.week_start}</th>
                    <td>{week.sales}</td>
                    <td>{nad(Number(week.sold_cents))}</td>
                    <td aria-hidden="true"><div style={{ background: "var(--coral, #e8604c)", height: 10, borderRadius: 5, width: `${Math.max(2, Math.round((Number(week.sold_cents) / maxWeek) * 100))}%`, opacity: Number(week.sold_cents) ? 1 : 0.25 }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="list-heading">Your listings</h2>
            <dl className="order-facts seller-stats" aria-label="Listings">
              <div><dt>Live</dt><dd>{d.listings.active}</dd></div>
              <div><dt>Held for a buyer</dt><dd>{d.listings.reserved}</dd></div>
              <div><dt>Drafts</dt><dd>{d.listings.drafts}</dd></div>
              <div><dt>Sold</dt><dd>{d.listings.sold}</dd></div>
              {d.listings.given > 0 && <div><dt>Given to children&apos;s homes</dt><dd>{d.listings.given}</dd></div>}
              {d.rating && Number(d.rating.count) > 0 && <div><dt>Rating</dt><dd>{d.rating.average} from {d.rating.count} {Number(d.rating.count) === 1 ? "review" : "reviews"}</dd></div>}
            </dl>

            <h2 className="list-heading">Most viewed this week</h2>
            {d.top_items.length === 0 ? <p className="trade-hint">No live items yet.</p> : (
              <ul className="list-cards">
                {d.top_items.map((item) => (
                  <li className="list-card" key={item.id}>
                    <div className="list-card-main"><Link href={`/my-listings/${item.id}`}><b>{item.title}</b></Link><small>{Number(item.views_7d)} views · {Number(item.saves)} saves · {nad(Number(item.price_cents))}</small></div>
                    {Number(item.views_7d) >= 10 && Number(item.saves) === 0 && <small>Seen a lot but not saved. A lower price or better photos could help.</small>}
                  </li>
                ))}
              </ul>
            )}
            <p className="trade-hint"><Link href="/my-listings">All your listings</Link> · <Link href="/sell">List another item</Link></p>
          </>
        )}
      </section>
    </main>
  );
}
