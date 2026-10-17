import { formatWindhoek } from "./trade";

export type RenderedEmail = { subject: string; text: string; html: string };

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

const money = (cents: unknown) => `N$${Math.round(Number(cents ?? 0) / 100).toLocaleString("en-ZA")}`;

type Copy = { subject: string; line: string; path: string; cta: string };

function copyFor(kind: string, payload: Record<string, unknown>): Copy | null {
  const order = typeof payload.order_id === "string" ? `/orders/${payload.order_id}` : "/orders";
  switch (kind) {
    case "offer_received": return { subject: "You have a new offer on Rehang", line: "Someone made an offer on one of your items. Offers expire, so reply soon.", path: "/offers", cta: "View offer" };
    case "offer_countered": return { subject: "A seller countered your offer", line: "The seller replied with a counter offer. You can accept or decline it.", path: "/offers", cta: "View counter offer" };
    case "order_created": return { subject: "A new order is waiting", line: "Arrange where and when to meet. Pick a safe meet-up spot from our list.", path: order, cta: "Open order" };
    case "meetup_requested": return { subject: "A buyer suggested a meet-up", line: "Please confirm the time and place, or message the buyer.", path: order, cta: "Open order" };
    case "meetup_confirmed": return { subject: "Your meet-up is confirmed", line: "Your handover code is ready on the order page. Only share it once you have the item in your hands.", path: order, cta: "See code and details" };
    case "meetup_reminder": {
      const when = typeof payload.meetup_at === "string" ? formatWindhoek(payload.meetup_at, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "soon";
      return { subject: "Reminder: your meet-up is coming up", line: `Your meet-up is at ${when} (Windhoek time). Cancelling less than 2 hours before is no longer possible, so message the other person if plans change.`, path: order, cta: "Open order" };
    }
    case "dispute_opened": return { subject: "A problem was reported on an order", line: "Open the order to read what was reported and give your side.", path: order, cta: "Open order" };
    case "dispute_decided": return { subject: "A decision on your reported order", line: "Our team has decided. Open the order to read the reasons.", path: order, cta: "Read the decision" };
    case "order_completed": return { subject: "Your order is complete", line: "Thank you for trading on Rehang. Leave a short review to help others.", path: order, cta: "Leave a review" };
    case "order_paid": return { subject: "An order has been paid", line: "The payment is held safely. Sellers: post the item and add the tracking number within 3 days.", path: order, cta: "Open order" };
    case "order_shipped": return { subject: "Your order is on its way", line: "The seller has posted your item. Open the order for the tracking number, then confirm when it arrives.", path: order, cta: "Track order" };
    case "order_delivered": return { subject: "Your parcel was marked as received", line: "The buyer has 48 hours to confirm or report a problem, then your payout is released.", path: order, cta: "Open order" };
    case "payment_failed": return { subject: "Your payment did not go through", line: "Nothing was taken. Open the order to try again before it times out.", path: order, cta: "Open order" };
    case "refund_pending": return { subject: "Your refund is on its way", line: "Your payment is being returned. It can take a few days to show in your account.", path: order, cta: "Open order" };
    case "payout_pending": return { subject: "Your payout is being sent", line: "The buyer is happy, so your money is on its way to you.", path: order, cta: "Open order" };
    case "donation_accepted": return { subject: "Your gift was accepted", line: "A children's home would love your item. The Rehang team will be in touch about the handover.", path: "/donate/give", cta: "See your gifts" };
    case "donation_declined": return { subject: "Your gift could not be placed", line: "The home could not take this item. It is back on your listings. Open the page to read why.", path: "/donate/give", cta: "See your gifts" };
    case "donation_collected": return { subject: "Your gift reached the home", line: "Thank you. Your item has been handed over to a children's home.", path: "/donate/give", cta: "See your gifts" };
    case "order_cancelled": return { subject: "An order was cancelled", line: "One of your orders was cancelled. Open it to see the reason.", path: order, cta: "Open order" };
    case "cancel_agreement_requested": return { subject: "A request to cancel an order", line: "The other person asked to cancel together. Please accept or decline.", path: order, cta: "Open order" };
    case "no_show_reported": return { subject: "A no-show was reported on your order", line: "If this is wrong, you can dispute it from the order page.", path: order, cta: "Respond" };
    case "price_drop": {
      const title = typeof payload.title === "string" ? payload.title : "an item you saved";
      const id = typeof payload.item_id === "string" ? `/item/${payload.item_id}` : "/saved";
      return { subject: `Price drop on ${title}`, line: `${title} just got cheaper.`, path: id, cta: "View item" };
    }
    case "item_removed": return { subject: "A listing of yours was removed", line: "Our team removed one of your listings after a report. The terms explain how to appeal.", path: "/terms", cta: "Read the terms" };
    case "account_action": return { subject: "Action taken on your account", line: "Our team limited your account after a report. The terms explain how to appeal.", path: "/terms", cta: "Read the terms" };
    case "verification_approved": return { subject: "Your ID is verified", line: "Your buying limits are lifted. Happy trading.", path: "/verify", cta: "Open Rehang" };
    case "verification_rejected": return { subject: "We could not verify your ID", line: "Open the page to see why, then upload clearer photos.", path: "/verify", cta: "See what to fix" };
    default: return null;
  }
}

function wrap(heading: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f1ea;font-family:Arial,Helvetica,sans-serif;color:#2a2420"><div style="max-width:520px;margin:0 auto;padding:24px"><p style="font-size:20px;font-weight:bold;margin:0 0 16px">Rehang</p><div style="background:#ffffff;border-radius:12px;padding:24px"><h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(heading)}</h1>${bodyHtml}</div><p style="font-size:12px;color:#7a6f66;margin:16px 0 0">${footerHtml}</p></div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:20px 0 0"><a href="${escapeHtml(href)}" style="background:#2a2420;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:999px;display:inline-block">${escapeHtml(label)}</a></p>`;
}

const settingsLine = () => `Choose which emails you get in your <a href="${escapeHtml(siteUrl())}/account">account settings</a>.`;

/** Returns null for kinds that are in-app only. */
export function renderNotificationEmail(kind: string, payload: Record<string, unknown>, name: string | null): RenderedEmail | null {
  const copy = copyFor(kind, payload);
  if (!copy) return null;
  const link = `${siteUrl()}${copy.path}`;
  const hello = name ? `Hi ${name},` : "Hi,";
  return {
    subject: copy.subject,
    text: `${hello}\n\n${copy.line}\n\n${copy.cta}: ${link}\n\nChoose which emails you get: ${siteUrl()}/account`,
    html: wrap(copy.subject, `<p style="margin:0 0 8px">${escapeHtml(hello)}</p><p style="margin:0">${escapeHtml(copy.line)}</p>${button(link, copy.cta)}`, settingsLine()),
  };
}

export type DigestItem = { id: string; title: string; price_cents: number; seller: string; handle: string | null };

export function renderDigestEmail(items: DigestItem[], total: number, name: string | null): RenderedEmail {
  const subject = total === 1 ? "1 new listing from people you follow" : `${total} new listings from people you follow`;
  const hello = name ? `Hi ${name},` : "Hi,";
  const lines = items.map((item) => `${item.title} (${money(item.price_cents)}) from ${item.seller}: ${siteUrl()}/item/${item.id}`);
  const more = total > items.length ? `\n\nand ${total - items.length} more on Rehang: ${siteUrl()}/browse` : "";
  const rows = items.map((item) => `<li style="margin:0 0 10px"><a href="${escapeHtml(`${siteUrl()}/item/${item.id}`)}" style="color:#2a2420;font-weight:bold">${escapeHtml(item.title)}</a><br><span style="color:#7a6f66">${escapeHtml(money(item.price_cents))} from ${escapeHtml(item.seller)}</span></li>`).join("");
  const moreHtml = total > items.length ? `<p style="margin:12px 0 0">and ${total - items.length} more.</p>` : "";
  return {
    subject,
    text: `${hello}\n\n${subject}:\n\n${lines.join("\n")}${more}\n\nChoose which emails you get: ${siteUrl()}/account`,
    html: wrap(subject, `<p style="margin:0 0 12px">${escapeHtml(hello)}</p><ul style="padding-left:18px;margin:0">${rows}</ul>${moreHtml}${button(`${siteUrl()}/browse`, "Browse Rehang")}`, settingsLine()),
  };
}

export function renderInviteEmail(code: string): RenderedEmail {
  const link = `${siteUrl()}/signup?invite=${encodeURIComponent(code)}`;
  const subject = "Your Rehang invite";
  const line = "A spot has opened for you on Rehang, the marketplace for second-hand clothes in Namibia. Your invite works for 14 days and can be used once.";
  return {
    subject,
    text: `Hi,\n\n${line}\n\nInvite code: ${code}\nCreate your account: ${link}\n\nIf you did not ask to join the waiting list, you can ignore this email.`,
    html: wrap(subject, `<p style="margin:0 0 8px">Hi,</p><p style="margin:0">${escapeHtml(line)}</p><p style="margin:16px 0 0;font-size:22px;letter-spacing:3px;font-weight:bold">${escapeHtml(code)}</p>${button(link, "Create your account")}`, "If you did not ask to join the waiting list, you can ignore this email."),
  };
}
