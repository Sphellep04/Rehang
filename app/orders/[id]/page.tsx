import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { currentTime, formatWindhoek, orderStatusLabel } from "@/lib/trade";
import { PageLoading } from "../../_components/page-loading";
import { SiteHeader } from "../../_components/site-header";
import { OrderActions, type Spot } from "./order-actions";

export const metadata: Metadata = { title: "Order | Rehang" };

export default function OrderPage(props: PageProps<"/orders/[id]">) {
  return (
    <Suspense fallback={<PageLoading label="Loading your order…" />}>
      <OrderContent params={props.params} />
    </Suspense>
  );
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function OrderContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!isSupabaseConfigured()) redirect("/");
  if (!uuid.test(id)) notFound();
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/login");

  const supabase = await createClient();
  // Columns are listed on purpose: select * on orders is refused for signed-in clients.
  const { data: order } = await supabase
    .from("orders")
    .select("id,item_id,buyer_id,seller_id,amount_cents,status,meetup_spot_id,meetup_at,meetup_confirmed_at,confirm_by,completed_at,cancelled_at,cancel_reason,code_attempts,created_at")
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const role = order.buyer_id === viewerId ? "buyer" : order.seller_id === viewerId ? "seller" : null;
  if (!role) notFound();
  const otherId = role === "buyer" ? order.seller_id : order.buyer_id;

  const [{ data: item }, { data: other }, { data: events }] = await Promise.all([
    supabase.from("items").select("id,title,town_id").eq("id", order.item_id).maybeSingle(),
    supabase.from("public_profiles").select("display_name,handle").eq("id", otherId).maybeSingle(),
    supabase.from("order_events").select("event,actor_id,created_at").eq("order_id", id),
  ]);

  const { data: spotRow } = order.meetup_spot_id
    ? await supabase.from("meetup_spots").select("name,address").eq("id", order.meetup_spot_id).maybeSingle()
    : { data: null };
  const { data: spotRows } = item?.town_id
    ? await supabase.from("meetup_spots").select("id,name,address").eq("town_id", item.town_id).eq("active", true).order("name")
    : { data: [] };

  const open = order.status === "awaiting_meetup";
  const confirmed = Boolean(order.meetup_confirmed_at);
  const stage = confirmed ? "confirmed" : order.meetup_at ? "awaiting_confirmation" : "needs_meetup";

  const now = currentTime();
  const eventList = events ?? [];
  const reportedBy = (who: "me" | "other") => eventList.some((e) => e.event === "no_show_reported" && (who === "me" ? e.actor_id === viewerId : e.actor_id !== viewerId));
  const disputed = eventList.some((e) => e.event === "no_show_disputed");
  const agreementByOther = eventList.some((e) => e.event === "cancel_agreement_requested" && e.actor_id !== viewerId && now - new Date(e.created_at).getTime() < 48 * 3600 * 1000);

  const canReportNoShow = open && confirmed && Boolean(order.meetup_at) && now >= new Date(order.meetup_at as string).getTime() + 30 * 60 * 1000;

  // Only the buyer can read the code, and only once the seller has confirmed the meet-up.
  let code: { code: string; valid_from: string; valid_until: string } | null = null;
  if (role === "buyer" && open && confirmed) {
    const { data } = await supabase.rpc("get_meetup_code", { p_order: id });
    code = (Array.isArray(data) ? data[0] : data) ?? null;
  }

  const amount = Math.round(Number(order.amount_cents) / 100);
  const otherName = (other?.display_name as string | undefined) ?? "the other person";

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse order-page">
        <Link className="plain-button" href="/orders">← All orders</Link>
        <p className="eyebrow order-eyebrow">{role === "buyer" ? "YOU ARE BUYING" : "YOU ARE SELLING"}</p>
        <h1 className="browse-title">{(item?.title as string | undefined) ?? "Your order"}</h1>
        <p className="order-summary">
          <b>N${amount.toLocaleString("en-ZA")}</b> · {role === "buyer" ? "from" : "to"} {other?.handle ? <Link href={`/${other.handle}`}>{otherName}</Link> : otherName} · <span className={`status-pill status-${order.status}`}>{orderStatusLabel[order.status] ?? order.status}</span>
        </p>

        {order.status === "completed" && <p className="trade-success" role="status">Sale complete{order.completed_at ? ` on ${formatWindhoek(order.completed_at)}` : ""}. Thank you for choosing secondhand.</p>}
        {order.status === "cancelled" && <p className="trade-hint">This order was cancelled{order.cancelled_at ? ` on ${formatWindhoek(order.cancelled_at)}` : ""}.</p>}
        {order.status === "disputed" && <p className="trade-hint">This order is locked while our team reviews it. We will message you both.</p>}
        {disputed && open && <p className="trade-hint">A no-show report is under review.</p>}

        {open && (
          <dl className="order-facts">
            <div><dt>Meet-up</dt><dd>{order.meetup_at ? `${formatWindhoek(order.meetup_at)} at ${spotRow?.name ?? "the agreed spot"}` : "Not arranged yet"}</dd></div>
            {spotRow?.address && <div><dt>Address</dt><dd>{spotRow.address}</dd></div>}
            <div><dt>Payment</dt><dd>You pay the seller in person. Nothing is charged online.</dd></div>
          </dl>
        )}

        {code && (
          <div className="meetup-code" aria-live="polite">
            <p>Your meet-up code</p>
            <strong>{code.code}</strong>
            <small>Only share it once you are holding the item. It works from {formatWindhoek(code.valid_from)} until {formatWindhoek(code.valid_until)}.</small>
          </div>
        )}

        {open && (
          <OrderActions
            orderId={order.id}
            role={role}
            stage={stage}
            spots={(spotRows ?? []) as Spot[]}
            canReportNoShow={canReportNoShow}
            noShowReportedByMe={reportedBy("me")}
            noShowReportedByOther={reportedBy("other") && !disputed}
            cancelAgreementRequestedByOther={agreementByOther}
          />
        )}

        <p className="trade-hint"><Link href="/inbox">Message {otherName}</Link> if you need to change plans.</p>
      </section>
    </main>
  );
}
