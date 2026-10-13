import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getViewerId } from "@/lib/supabase/viewer";
import { formatWindhoek } from "@/lib/trade";
import { PageLoading } from "../_components/page-loading";
import { SiteHeader } from "../_components/site-header";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "Notifications | Rehang" };

export default function NotificationsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading notifications…" />}>
      <NotificationsContent />
    </Suspense>
  );
}

type Note = { text: string; href: string };

function describe(kind: string, payload: Record<string, unknown>): Note {
  const order = typeof payload.order_id === "string" ? `/orders/${payload.order_id}` : "/orders";
  switch (kind) {
    case "offer_received": return { text: "You have a new offer on one of your items.", href: "/offers" };
    case "offer_countered": return { text: "A seller replied to your offer with a counter offer.", href: "/offers" };
    case "order_created": return { text: "A new order is waiting. Arrange where and when to meet.", href: order };
    case "meetup_requested": return { text: "A buyer suggested a meet-up. Please confirm or message them.", href: order };
    case "meetup_confirmed": return { text: "Your meet-up is confirmed. Your code is ready on the order page.", href: order };
    case "order_completed": return { text: "An order was completed.", href: order };
    case "order_cancelled": return { text: "An order was cancelled.", href: order };
    case "cancel_agreement_requested": return { text: "The other person asked to cancel an order together.", href: order };
    case "no_show_reported": return { text: "Someone reported that you did not turn up to a meet-up.", href: order };
    case "no_show_disputed": return { text: "A no-show report was disputed and needs review.", href: order };
    case "code_locked": return { text: "An order was locked after too many wrong codes.", href: order };
    case "strike_issued": return { text: "A strike was added to your account. Too many strikes pause trading.", href: "/orders" };
    case "price_drop": return { text: `Price drop on ${typeof payload.title === "string" ? payload.title : "an item you saved"}.`, href: typeof payload.item_id === "string" ? `/item/${payload.item_id}` : "/saved" };
    case "item_removed": return { text: "One of your listings was removed by our team after a report.", href: "/terms" };
    case "account_action": return { text: "Our team has limited your account after a report. Check the terms for how to appeal.", href: "/terms" };
    case "verification_approved": return { text: "Your ID is verified. Your buying limits are lifted.", href: "/verify" };
    case "verification_rejected": return { text: "We could not verify your ID. Open this to see why and try again.", href: "/verify" };
    default: return { text: "You have an update.", href: "/orders" };
  }
}

async function NotificationsContent() {
  await connection();
  if (!isSupabaseConfigured()) redirect("/");
  if (!(await getViewerId())) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id,kind,payload,read_at,created_at").order("created_at", { ascending: false }).limit(50);
  const notes = data ?? [];

  return (
    <main>
      <SiteHeader signedIn />
      <section className="browse">
        <div className="section-heading"><div><p className="eyebrow">UPDATES</p><h1 className="browse-title">Your <em>notifications.</em></h1></div></div>
        <MarkRead hasUnread={notes.some((note) => !note.read_at)} />
        {notes.length === 0 && <div className="empty-state"><span>♡</span><h3>Nothing new.</h3><p>Offers, orders and meet-up updates will appear here.</p></div>}
        <ul className="list-cards">
          {notes.map((note) => {
            const { text, href } = describe(note.kind as string, (note.payload ?? {}) as Record<string, unknown>);
            return (
              <li className={`list-card${note.read_at ? "" : " list-card-unread"}`} key={note.id}>
                <div className="list-card-main"><Link href={href}><b>{text}</b></Link><small>{formatWindhoek(note.created_at as string)}</small></div>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
