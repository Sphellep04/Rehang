import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { formatWindhoek } from "@/lib/trade";
import { PageLoading } from "../_components/page-loading";
import { SiteHeader } from "../_components/site-header";
import { reportReasons } from "@/lib/moderation";
import { AdminActions } from "./admin-actions";
import { FlagDismiss } from "./flag-dismiss";

export const metadata: Metadata = { title: "Moderation | Rehang", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading the moderation queue…" />}>
      <AdminContent />
    </Suspense>
  );
}

const reasonLabel = new Map(reportReasons.map((item) => [item.value, item.label]));

async function AdminContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login");

  const supabase = await createClient();
  const { data: me } = await supabase.from("users").select("role").eq("id", viewerId).maybeSingle();
  // Members get the same page as a missing one, so the route does not advertise itself.
  if (me?.role !== "moderator" && me?.role !== "admin") notFound();

  const [reportsResult, verificationsResult, disputedResult, logResult, flagsResult] = await Promise.all([
    supabase.from("reports").select("id,reporter_id,target_type,target_id,reason,details,created_at").eq("status", "open").order("created_at").limit(50),
    supabase.from("verifications").select("id,user_id,status,legal_name,document_path,selfie_path,created_at").in("status", ["pending", "escalated"]).order("created_at").limit(50),
    supabase.from("orders").select("id,item_id,buyer_id,seller_id,amount_cents,created_at").eq("status", "disputed").order("created_at").limit(50),
    supabase.from("moderator_actions").select("id,actor_id,action,target_type,target_id,note,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("item_flags").select("id,item_id,detail,created_at").is("resolved_at", null).order("created_at").limit(50),
  ]);

  const reports = reportsResult.data ?? [];
  const verifications = verificationsResult.data ?? [];
  const disputed = disputedResult.data ?? [];
  const log = logResult.data ?? [];
  const flags = flagsResult.data ?? [];

  // Names and titles for everything on the page, fetched in two batches.
  const itemIds = [...new Set([...reports.filter((r) => r.target_type === "item").map((r) => r.target_id as string), ...disputed.map((o) => o.item_id as string).filter(Boolean), ...flags.flatMap((f) => [f.item_id as string, (f.detail as { matches_item?: string }).matches_item ?? ""]).filter(Boolean)])];
  const userIds = [...new Set([
    ...reports.flatMap((r) => [r.reporter_id as string, ...(r.target_type === "user" ? [r.target_id as string] : [])]),
    ...verifications.map((v) => v.user_id as string),
    ...disputed.flatMap((o) => [o.buyer_id as string, o.seller_id as string]),
    ...log.map((entry) => entry.actor_id as string),
  ])];
  const [{ data: items }, { data: people }] = await Promise.all([
    itemIds.length ? supabase.from("items").select("id,title,seller_id").in("id", itemIds) : Promise.resolve({ data: [] }),
    userIds.length ? supabase.from("users").select("id,handle,display_name").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const itemById = new Map((items ?? []).map((item) => [item.id as string, item]));
  const personById = new Map((people ?? []).map((person) => [person.id as string, person]));
  const who = (id: string) => {
    const person = personById.get(id);
    return person ? <Link href={`/${person.handle}`}>@{person.handle as string}</Link> : <span>unknown</span>;
  };

  // Short-lived links to the private ID photos. They expire in 10 minutes.
  const links = await Promise.all(verifications.map(async (v) => {
    const [doc, selfie] = await Promise.all([
      v.document_path ? supabase.storage.from("id-documents").createSignedUrl(v.document_path as string, 600) : Promise.resolve({ data: null }),
      v.selfie_path ? supabase.storage.from("id-documents").createSignedUrl(v.selfie_path as string, 600) : Promise.resolve({ data: null }),
    ]);
    return [v.id as string, { doc: doc.data?.signedUrl, selfie: selfie.data?.signedUrl }] as const;
  }));
  const linkById = new Map(links);

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse">
        <div className="section-heading"><div><p className="eyebrow">STAFF ONLY</p><h1 className="browse-title">Moderation <em>queue.</em></h1></div></div>

        <h2 className="list-heading">Reports ({reports.length})</h2>
        {reports.length === 0 && <p className="trade-hint">Nothing waiting. Nice.</p>}
        <ul className="list-cards">
          {reports.map((report) => {
            const item = report.target_type === "item" ? itemById.get(report.target_id as string) : undefined;
            return (
              <li className="list-card admin-card" key={report.id as string}>
                <div className="list-card-main">
                  <b>{reasonLabel.get(report.reason as string) ?? (report.reason as string)}</b>
                  <p>
                    {report.target_type === "item" && <>Listing: {item ? <Link href={`/item/${item.id as string}`}>{item.title as string}</Link> : "removed"}{item ? <> by {who(item.seller_id as string)}</> : null}</>}
                    {report.target_type === "user" && <>Person: {who(report.target_id as string)}</>}
                    {report.target_type === "message" && <>A chat message (open the conversation from the database to read it)</>}
                    {" "}· reported by {who(report.reporter_id as string)}
                  </p>
                  {report.details && <p className="admin-quote">“{report.details as string}”</p>}
                  <small>{formatWindhoek(report.created_at as string)}</small>
                </div>
                <AdminActions kind="report" id={report.id as string} targetType={report.target_type as "item" | "user" | "message"} />
              </li>
            );
          })}
        </ul>

        <h2 className="list-heading">ID checks ({verifications.length})</h2>
        {verifications.length === 0 && <p className="trade-hint">No IDs waiting.</p>}
        <ul className="list-cards">
          {verifications.map((v) => {
            const files = linkById.get(v.id as string);
            return (
              <li className="list-card admin-card" key={v.id as string}>
                <div className="list-card-main">
                  <b>{who(v.user_id as string)}</b>
                  <p>Name on ID: <b>{(v.legal_name as string | null) ?? "not given"}</b>. Check it matches the photo.</p>
                  <p>{files?.doc ? <a href={files.doc} target="_blank" rel="noreferrer">Open ID</a> : "ID unavailable"} · {files?.selfie ? <a href={files.selfie} target="_blank" rel="noreferrer">Open selfie</a> : "Selfie unavailable"}</p>
                  <small>{v.status === "escalated" ? "Escalated · " : ""}{formatWindhoek(v.created_at as string)}. Links expire in 10 minutes.</small>
                </div>
                <AdminActions kind="verification" id={v.id as string} />
              </li>
            );
          })}
        </ul>

        <h2 className="list-heading">Photo matches ({flags.length})</h2>
        {flags.length === 0 && <p className="trade-hint">No suspicious photos.</p>}
        <ul className="list-cards">
          {flags.map((flag) => {
            const item = itemById.get(flag.item_id as string);
            const detail = flag.detail as { matches_item?: string; distance?: number };
            const other = detail.matches_item ? itemById.get(detail.matches_item) : undefined;
            return (
              <li className="list-card admin-card" key={flag.id as string}>
                <div className="list-card-main">
                  <b>Photo matches another seller</b>
                  <p>{item ? <Link href={`/item/${item.id as string}`}>{item.title as string}</Link> : "A listing"} by {item ? who(item.seller_id as string) : "unknown"} looks like {other ? <Link href={`/item/${other.id as string}`}>{other.title as string}</Link> : "another listing"}{other ? <> by {who(other.seller_id as string)}</> : null}. If it is a copy, report the newer listing from its page.</p>
                  <small>{formatWindhoek(flag.created_at as string)} · difference {detail.distance ?? "?"} of 64</small>
                </div>
                <FlagDismiss id={flag.id as string} />
              </li>
            );
          })}
        </ul>

        <h2 className="list-heading">Orders under review ({disputed.length})</h2>
        {disputed.length === 0 && <p className="trade-hint">No orders under review.</p>}
        <ul className="list-cards">
          {disputed.map((order) => (
            <li className="list-card" key={order.id as string}>
              <div className="list-card-main">
                <b><Link href={`/orders/${order.id as string}`}>{(itemById.get(order.item_id as string)?.title as string | undefined) ?? "Order"}</Link></b>
                <p>Buyer {who(order.buyer_id as string)} · seller {who(order.seller_id as string)} · N${Math.round(Number(order.amount_cents) / 100).toLocaleString("en-ZA")}</p>
                <small>{formatWindhoek(order.created_at as string)}</small>
              </div>
            </li>
          ))}
        </ul>

        <h2 className="list-heading">Recent actions</h2>
        <ul className="list-cards">
          {log.map((entry) => (
            <li className="list-card" key={entry.id as string}>
              <div className="list-card-main">
                <p><b>{(entry.action as string).replaceAll("_", " ")}</b> by {who(entry.actor_id as string)} on {entry.target_type as string}{entry.note ? ` · ${entry.note as string}` : ""}</p>
                <small>{formatWindhoek(entry.created_at as string)}</small>
              </div>
            </li>
          ))}
          {log.length === 0 && <li className="trade-hint">No actions yet.</li>}
        </ul>
      </section>
    </main>
  );
}
