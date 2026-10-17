import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { PageLoading } from "../../_components/page-loading";
import { SiteHeader } from "../../_components/site-header";

export const metadata: Metadata = { title: "Weekly numbers | Rehang", robots: { index: false, follow: false } };

type Row = {
  week_start: string; sign_ups: number; waitlist_joined: number; listings_published: number; orders_created: number;
  orders_completed: number; clean_orders_completed: number; disputes_opened: number; reports_filed: number; shares: number; app_installs: number;
};

const columns: { key: keyof Row; label: string }[] = [
  { key: "sign_ups", label: "Sign-ups" },
  { key: "waitlist_joined", label: "Waiting list" },
  { key: "listings_published", label: "Listings live" },
  { key: "orders_created", label: "Orders" },
  { key: "orders_completed", label: "Completed" },
  { key: "clean_orders_completed", label: "Completed, no dispute" },
  { key: "disputes_opened", label: "Disputes" },
  { key: "reports_filed", label: "Reports" },
  { key: "shares", label: "Shares" },
  { key: "app_installs", label: "App installs" },
];

export default function MetricsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading numbers…" />}>
      <MetricsContent />
    </Suspense>
  );
}

async function MetricsContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login?next=/admin/metrics");
  const supabase = await createClient();
  const { data: me } = await supabase.from("users").select("role").eq("id", viewerId).maybeSingle();
  if (me?.role !== "moderator" && me?.role !== "admin") notFound();

  const { data, error } = await supabase.rpc("weekly_metrics", { p_weeks: 8 });
  if (error?.message === "mfa_required") redirect("/admin/security");
  const rows = (data ?? []) as Row[];
  const thisWeek = rows[0];

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <p className="eyebrow">STAFF ONLY</p>
        <h1 className="browse-title">Weekly <em>numbers.</em></h1>
        <p className="trade-hint">The number that matters most is <b>Completed, no dispute</b>: orders where the item changed hands and nobody had to complain. Weeks start on Monday, Windhoek time. Shares and installs only count people who tapped a share button or installed the app.</p>
        {thisWeek && <p className="item-price">{thisWeek.clean_orders_completed} clean orders this week</p>}
        {rows.length === 0 ? <p className="trade-hint">No numbers yet.</p> : (
          <div className="table-scroll">
            <table className="metrics-table">
              <thead><tr><th scope="col">Week from</th>{columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.week_start}><th scope="row">{row.week_start}</th>{columns.map((column) => <td key={column.key}>{row[column.key]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
