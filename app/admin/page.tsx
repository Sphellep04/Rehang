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
import { FlagActions } from "./flag-actions";
import { ChatContext } from "./chat-context";
import { DisputeDecision } from "./dispute-decision";
import { InviteButton, MakeCode } from "./invite-tools";

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
  // Staff must have passed two-factor in this session (Supabase marks that as aal2).
  const { data: claimsData } = await supabase.auth.getClaims();
  if (claimsData?.claims?.aal !== "aal2") redirect("/admin/security");

  const [reportsResult, verificationsResult, disputesResult, logResult, flagsResult, accountFlagsResult, waitlistResult, inviteOnlyResult] = await Promise.all([
    supabase.from("reports").select("id,reporter_id,target_type,target_id,reason,details,created_at").eq("status", "open").order("created_at").limit(50),
    supabase.from("verifications").select("id,user_id,status,legal_name,document_path,selfie_path,created_at").in("status", ["pending", "escalated"]).order("created_at").limit(50),
    supabase.from("disputes").select("order_id,opened_by,reason,buyer_statement,seller_statement,created_at").is("decided_at", null).order("created_at").limit(50),
    supabase.from("moderator_actions").select("id,actor_id,action,target_type,target_id,note,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("item_flags").select("id,item_id,reason,detail,created_at").is("resolved_at", null).order("created_at").limit(50),
    supabase.from("account_flags").select("id,user_id,reason,detail,created_at").is("resolved_at", null).order("created_at").limit(50),
    supabase.from("waitlist").select("id,contact,role,town,source,created_at").is("invited_at", null).order("created_at").limit(50),
    supabase.rpc("signup_requires_invite"),
  ]);

  const reports = reportsResult.data ?? [];
  const verifications = verificationsResult.data ?? [];
  const disputeRows = disputesResult.data ?? [];
  const { data: disputeOrders } = disputeRows.length
    ? await supabase.from("orders").select("id,item_id,buyer_id,seller_id,amount_cents,status").in("id", disputeRows.map((d) => d.order_id as string))
    : { data: [] };
  const disputed = (disputeOrders ?? []) as { id: string; item_id: string; buyer_id: string; seller_id: string; amount_cents: number; status: string }[];
  const orderById = new Map(disputed.map((order) => [order.id, order]));
  const log = logResult.data ?? [];
  const flags = flagsResult.data ?? [];
  const accountFlags = accountFlagsResult.data ?? [];
  const waitlist = waitlistResult.data ?? [];

  // Names and titles for everything on the page, fetched in two batches.
  const itemIds = [...new Set([...reports.filter((r) => r.target_type === "item").map((r) => r.target_id as string), ...disputed.map((o) => o.item_id as string).filter(Boolean), ...flags.flatMap((f) => [f.item_id as string, (f.detail as { matches_item?: string }).matches_item ?? ""]).filter(Boolean)])];
  const userIds = [...new Set([
    ...reports.flatMap((r) => [r.reporter_id as string, ...(r.target_type === "user" ? [r.target_id as string] : [])]),
    ...verifications.map((v) => v.user_id as string),
    ...accountFlags.map((f) => f.user_id as string),
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
                    {report.target_type === "message" && <>A chat message<br /><ChatContext reportId={report.id as string} /></>}
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

        <h2 className="list-heading">Listing flags ({flags.length})</h2>
        {flags.length === 0 && <p className="trade-hint">No flagged listings.</p>}
        <ul className="list-cards">
          {flags.map((flag) => {
            const item = itemById.get(flag.item_id as string);
            const detail = flag.detail as { matches_item?: string; distance?: number };
            const other = detail.matches_item ? itemById.get(detail.matches_item) : undefined;
            const brand = flag.reason === "brand_check";
            return (
              <li className="list-card admin-card" key={flag.id as string}>
                <div className="list-card-main">
                  <b>{brand ? "Brand check (over N$1,500)" : "Photo matches another seller"}</b>
                  <p>{item ? <Link href={`/item/${item.id as string}`}>{item.title as string}</Link> : "A listing"} by {item ? who(item.seller_id as string) : "unknown"}.
                    {brand ? " Compare the label, stitching and any serial photos with the brand's genuine items. Approving adds a Photos reviewed label, not a guarantee."
                      : <> It looks like {other ? <Link href={`/item/${other.id as string}`}>{other.title as string}</Link> : "another listing"}{other ? <> by {who(other.seller_id as string)}</> : null}. If it is a copy, report the newer listing from its page.</>}</p>
                  <small>{formatWindhoek(flag.created_at as string)}{brand ? "" : ` · difference ${detail.distance ?? "?"} of 64`}</small>
                </div>
                <FlagActions kind="item" id={flag.id as string} reason={flag.reason as "duplicate_photo" | "brand_check"} />
              </li>
            );
          })}
        </ul>

        <h2 className="list-heading">Account flags ({accountFlags.length})</h2>
        {accountFlags.length === 0 && <p className="trade-hint">No flagged accounts.</p>}
        <ul className="list-cards">
          {accountFlags.map((flag) => {
            const detail = flag.detail as Record<string, number>;
            const text: Record<string, string> = {
              new_account_high_value: `New account with ${detail.expensive_items ?? "several"} listings over N$1,000.`,
              repeat_strikes: `${detail.strikes_in_90_days ?? "Several"} strikes in 90 days.`,
              contact_sharing: `${detail.messages ?? "Several"} messages with contact details in ${detail.conversations ?? "several"} chats this week.`,
            };
            return (
              <li className="list-card admin-card" key={flag.id as string}>
                <div className="list-card-main">
                  <b>{who(flag.user_id as string)}</b>
                  <p>{text[flag.reason as string] ?? (flag.reason as string)} The guide says to review when two signals appear. Hold, ask for extra photos, re-verify, then suspend if unsatisfied.</p>
                  <small>{formatWindhoek(flag.created_at as string)}</small>
                </div>
                <FlagActions kind="account" id={flag.id as string} />
              </li>
            );
          })}
        </ul>

        <h2 className="list-heading">Order problems ({disputeRows.length})</h2>
        {disputeRows.length === 0 && <p className="trade-hint">No orders under review.</p>}
        <ul className="list-cards">
          {disputeRows.map((row) => {
            const order = orderById.get(row.order_id as string);
            if (!order) return null;
            return (
              <li className="list-card admin-card" key={row.order_id as string}>
                <div className="list-card-main">
                  <b><Link href={`/orders/${order.id}`}>{(itemById.get(order.item_id)?.title as string | undefined) ?? "Order"}</Link> · {(row.reason as string).replaceAll("_", " ")}</b>
                  <p>Buyer {who(order.buyer_id)} · seller {who(order.seller_id)} · N${Math.round(Number(order.amount_cents) / 100).toLocaleString("en-ZA")} · opened by {who(row.opened_by as string)}</p>
                  <p className="admin-quote">Buyer: {(row.buyer_statement as string | null) ?? "no statement yet"}</p>
                  <p className="admin-quote">Seller: {(row.seller_statement as string | null) ?? "no statement yet"}</p>
                  <small>{formatWindhoek(row.created_at as string)}. Read the chat and the listing photos before deciding.</small>
                </div>
                <DisputeDecision orderId={order.id} completed={order.status === "completed"} />
              </li>
            );
          })}
        </ul>

        <h2 className="list-heading">Waiting list ({waitlist.length} waiting)</h2>
        <p className="trade-hint">Sign-up is {inviteOnlyResult.data === true ? "invite-only" : "open to everyone"}. To change it: <code>update public.app_config set value = &apos;{inviteOnlyResult.data === true ? "false" : "true"}&apos;::jsonb where key = &apos;signup_requires_invite&apos;;</code></p>
        <MakeCode />
        <ul className="list-cards">
          {waitlist.map((entry) => (
            <li className="list-card admin-card" key={entry.id as string}>
              <div className="list-card-main">
                <b>{entry.contact as string}</b>
                <p>{entry.role as string}{entry.town ? ` · ${entry.town as string}` : ""}{entry.source ? ` · via ${entry.source as string}` : ""}</p>
                <small>{formatWindhoek(entry.created_at as string)}</small>
              </div>
              <InviteButton id={entry.id as string} />
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
