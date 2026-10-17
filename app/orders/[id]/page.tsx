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
import { ReviewForm } from "./review-form";
import { DisputePanel } from "./dispute-panel";
import { DeliveryActions } from "./delivery-actions";
import { simulatorAvailable } from "@/lib/payments/simulator";
import { Stars } from "../../_components/stars";

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
    .select("id,item_id,bundle_offer_id,buyer_id,seller_id,amount_cents,status,meetup_spot_id,meetup_at,meetup_confirmed_at,confirm_by,completed_at,cancelled_at,cancel_reason,code_attempts,created_at,delivery_method,shipping_cents,buyer_fee_cents,delivery_address,tracking_number,ship_by,shipped_at,delivered_at")
    .eq("id", id)
    .maybeSingle();
  if (!order) notFound();

  const now = currentTime();
  const role = order.buyer_id === viewerId ? "buyer" : order.seller_id === viewerId ? "seller" : null;
  if (!role) notFound();
  const otherId = role === "buyer" ? order.seller_id : order.buyer_id;

  const [{ data: item }, { data: other }, { data: events }] = await Promise.all([
    order.item_id ? supabase.from("items").select("id,title,town_id").eq("id", order.item_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("public_profiles").select("display_name,handle").eq("id", otherId).maybeSingle(),
    supabase.from("order_events").select("event,actor_id,created_at").eq("order_id", id),
  ]);

  const { data: bundleItems } = order.bundle_offer_id ? await supabase.rpc("bundle_order_items", { p_order: id }) : { data: null };
  const bundleList = (bundleItems ?? []) as { item_id: string; title: string; amount_cents: number }[];

  const { data: spotRow } = order.meetup_spot_id
    ? await supabase.from("meetup_spots").select("name,address").eq("id", order.meetup_spot_id).maybeSingle()
    : { data: null };
  let townId = item?.town_id as number | null | undefined;
  if (!townId && bundleList.length) {
    const { data: first } = await supabase.from("items").select("town_id").eq("id", bundleList[0].item_id).maybeSingle();
    townId = first?.town_id as number | null | undefined;
  }
  const { data: spotRows } = townId
    ? await supabase.from("meetup_spots").select("id,name,address").eq("town_id", townId).eq("active", true).order("name")
    : { data: [] };

  const { data: dispute } = await supabase
    .from("disputes")
    .select("opened_by,reason,buyer_statement,seller_statement,decision,decision_note,decided_at")
    .eq("order_id", id)
    .maybeSingle();

  const { data: reviewRows } = order.status === "completed"
    ? await supabase.from("reviews").select("reviewer_id,rating,comment").eq("order_id", id)
    : { data: [] };
  const myReview = (reviewRows ?? []).find((row) => row.reviewer_id === viewerId);
  const theirReview = (reviewRows ?? []).find((row) => row.reviewer_id !== viewerId);

  const open = order.status === "awaiting_meetup";
  const confirmed = Boolean(order.meetup_confirmed_at);
  const stage = confirmed ? "confirmed" : order.meetup_at ? "awaiting_confirmation" : "needs_meetup";

  const eventList = events ?? [];
  const reportedBy = (who: "me" | "other") => eventList.some((e) => e.event === "no_show_reported" && (who === "me" ? e.actor_id === viewerId : e.actor_id !== viewerId));
  const disputed = eventList.some((e) => e.event === "no_show_disputed");
  const agreementByOther = eventList.some((e) => e.event === "cancel_agreement_requested" && e.actor_id !== viewerId && now - new Date(e.created_at).getTime() < 48 * 3600 * 1000);

  const posted = order.delivery_method === "courier" || order.delivery_method === "post";
  const postedLive = posted && ["awaiting_payment", "paid_held", "shipped", "delivered"].includes(order.status);
  const totalCents = Number(order.amount_cents) + Number(order.shipping_cents ?? 0) + Number(order.buyer_fee_cents ?? 0);
  const canReportProblem = !dispute && (
    (posted && (order.status === "shipped" || order.status === "delivered")) ||
    (order.status === "awaiting_meetup" && confirmed && Boolean(order.meetup_at) && now >= new Date(order.meetup_at as string).getTime())
    || (order.status === "completed" && Boolean(order.completed_at) && now - new Date(order.completed_at as string).getTime() < 7 * 24 * 3600 * 1000)
  );
  const myStatement = role === "buyer" ? dispute?.buyer_statement : dispute?.seller_statement;
  const theirStatement = role === "buyer" ? dispute?.seller_statement : dispute?.buyer_statement;
  const canRespond = Boolean(dispute) && !dispute?.decided_at && !myStatement && dispute?.opened_by !== viewerId;

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
        <h1 className="browse-title">{bundleList.length ? `Bundle of ${bundleList.length} items` : (item?.title as string | undefined) ?? "Your order"}</h1>
        <p className="order-summary">
          <b>N${amount.toLocaleString("en-ZA")}</b> · {role === "buyer" ? "from" : "to"} {other?.handle ? <Link href={`/${other.handle}`}>{otherName}</Link> : otherName} · <span className={`status-pill status-${order.status}`}>{orderStatusLabel[order.status] ?? order.status}</span>
        </p>

        {bundleList.length > 0 && (
          <ul className="list-cards">
            {bundleList.map((row) => <li className="list-card" key={row.item_id}><div className="list-card-main"><b>{row.title}</b><small>N${Math.round(Number(row.amount_cents) / 100).toLocaleString("en-ZA")} after the bundle discount</small></div></li>)}
          </ul>
        )}

        {order.status === "completed" && <p className="trade-success" role="status">Sale complete{order.completed_at ? ` on ${formatWindhoek(order.completed_at)}` : ""}. Thank you for choosing secondhand.</p>}
        {order.status === "cancelled" && <p className="trade-hint">This order was cancelled{order.cancelled_at ? ` on ${formatWindhoek(order.cancelled_at)}` : ""}.</p>}
        
        {dispute && (
          <div className="order-form">
            <h3>{dispute.decided_at ? "Our decision" : "Under review"}</h3>
            {dispute.decided_at
              ? <p className="trade-hint">{dispute.decision_note as string}</p>
              : <p className="trade-hint">Our team is reviewing this order. We will message you both.</p>}
            {myStatement && <p className="trade-hint"><b>Your side:</b> {myStatement as string}</p>}
            {theirStatement && <p className="trade-hint"><b>Their side:</b> {theirStatement as string}</p>}
          </div>
        )}
        {canRespond && <DisputePanel orderId={order.id} mode="respond" />}
        {canReportProblem && <DisputePanel orderId={order.id} mode="report" posted={posted} />}
        {disputed && open && <p className="trade-hint">A no-show report is under review.</p>}

        {order.status === "completed" && (
          <div className="order-reviews">
            {myReview
              ? <p className="trade-hint">Your review: <Stars value={myReview.rating as number} count={1} /> {myReview.comment ? `“${myReview.comment}”` : ""}</p>
              : order.completed_at && now <= new Date(order.completed_at as string).getTime() + 7 * 24 * 3600 * 1000
                ? <ReviewForm orderId={order.id} revieweeId={otherId} revieweeName={otherName} />
                : <p className="trade-hint">The 7 day window for reviews has closed.</p>}
            {theirReview && <p className="trade-hint">{otherName} reviewed you: <Stars value={theirReview.rating as number} count={1} /> {theirReview.comment ? `“${theirReview.comment}”` : ""}</p>}
          </div>
        )}

        {postedLive && (
          <>
            <dl className="order-facts">
              <div><dt>Delivery</dt><dd>{order.delivery_method === "courier" ? "Courier" : "Post office"}</dd></div>
              <div><dt>Total to pay</dt><dd>N${(totalCents / 100).toLocaleString("en-ZA")} (item + postage{Number(order.buyer_fee_cents) > 0 ? " + fee" : ""})</dd></div>
              {order.status === "awaiting_payment" && order.confirm_by && <div><dt>Pay before</dt><dd>{formatWindhoek(order.confirm_by)}</dd></div>}
              {order.status === "paid_held" && order.ship_by && <div><dt>{role === "seller" ? "Post it before" : "Seller will post by"}</dt><dd>{formatWindhoek(order.ship_by)}</dd></div>}
              {order.tracking_number && <div><dt>Tracking number</dt><dd>{order.tracking_number}</dd></div>}
              {order.status === "delivered" && order.confirm_by && <div><dt>Confirm or report by</dt><dd>{formatWindhoek(order.confirm_by)}</dd></div>}
              {role === "seller" && order.delivery_address && order.status !== "awaiting_payment" && <div><dt>Deliver to</dt><dd style={{ whiteSpace: "pre-line" }}>{order.delivery_address}</dd></div>}
            </dl>
            <DeliveryActions orderId={order.id} role={role} status={order.status} simulator={simulatorAvailable()} />
          </>
        )}

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
