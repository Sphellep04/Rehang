/** Friendly text for the error codes raised by the offer and order functions in Supabase. */
const messages: Record<string, string> = {
  not_signed_in: "Please sign in first.",
  account_not_active: "Your account is not active right now.",
  terms_not_accepted: "Please finish setting up your profile and accept the terms first.",
  account_restricted: "Your account is paused for now because of earlier cancellations or no-shows.",
  own_item: "This is your own listing.",
  seller_unavailable: "This seller can't take new orders right now.",
  user_blocked: "You can't trade with this person.",
  verification_required: "Add your email and a profile photo to start buying.",
  order_limit_exceeded: "This is above your buying limit per order. Verify your ID to remove the limit.",
  monthly_limit_exceeded: "This would go over your 30 day buying limit. Verify your ID to remove the limit.",
  item_unavailable: "Sorry, this item is no longer available.",
  offer_not_whole_amount: "Offers must be whole dollars.",
  offer_too_low: "That offer is too low. Offers must be at least 60% of the price.",
  offer_not_below_price: "That is the full price. Use Buy now instead.",
  too_many_offers_on_item: "You already have 3 open offers on this item.",
  too_many_open_offers: "You have too many open offers. Wait for replies or withdraw some.",
  offer_not_open: "This offer is no longer open.",
  offer_not_found: "We couldn't find that offer.",
  not_your_offer_to_answer: "That offer isn't yours to answer.",
  invalid_action: "That action isn't available.",
  cannot_counter_a_counter: "A counter offer can only be accepted or declined.",
  invalid_counter_amount: "A counter must be higher than the offer, no more than the price, and at least 60% of the price.",
  order_not_found: "We couldn't find that order.",
  meetup_already_confirmed: "The meet-up is already confirmed.",
  order_not_open: "This order is no longer open.",
  order_not_ready: "This order isn't ready for the code yet.",
  no_meetup_proposed: "No meet-up has been proposed yet.",
  meetup_time_passed: "That meet-up time has already passed. Ask the buyer to pick a new one.",
  invalid_reason: "That cancellation isn't allowed.",
  too_late_to_cancel: "It's too late to cancel. The meet-up is less than 2 hours away.",
  too_late_to_report_damage: "Damage must be reported before the meet-up time.",
  too_early_to_report: "You can report a no-show 30 minutes after the meet-up time.",
  already_reported: "You've already reported this.",
  no_report_to_dispute: "There's nothing to respond to.",
  meetup_spot_unavailable: "That meet-up spot isn't available.",
  meetup_spot_wrong_town: "Pick a spot in the same town as the item.",
  meetup_too_soon: "Pick a time at least 3 hours from now.",
  meetup_too_late: "The meet-up must be within 3 days of the order.",
  meetup_outside_hours: "That time is outside the spot's opening hours.",
  not_allowed: "You don't have permission to do that.",
  report_target_not_found: "We couldn't find what you're trying to report.",
  cannot_report_yourself: "You can't report yourself.",
  too_many_reports: "You've sent a lot of reports today. Please try again tomorrow.",
  report_not_found: "We couldn't find that report.",
  report_already_handled: "Someone has already handled this report.",
  cannot_act_on_staff: "You can't take action against staff accounts.",
  invalid_upload: "Those files didn't upload properly. Please try again.",
  verification_already_pending: "Your documents are already being reviewed.",
  already_verified: "You're already verified.",
  verification_not_found: "We couldn't find that verification.",
  already_reviewed: "This verification has already been reviewed.",
  cannot_review_own: "You can't review your own verification.",
  reason_required: "Please give a reason so the person knows what to fix.",
};

export function tradeError(message: string | undefined | null): string {
  return (message && messages[message]) || "Something went wrong. Please try again.";
}

/** Namibia has no daylight saving: Windhoek is UTC+2 all year. */
export const WINDHOEK_OFFSET = "+02:00";

export function toWindhoekIso(date: string, time: string): string {
  return `${date}T${time}:00${WINDHOEK_OFFSET}`;
}

export function formatWindhoek(iso: string | null | undefined, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Windhoek", ...options });
}

export function dollarsToCents(value: string): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) return null;
  return amount * 100;
}

export const orderStatusLabel: Record<string, string> = {
  awaiting_meetup: "Awaiting meet-up",
  completed: "Completed",
  cancelled: "Cancelled",
  disputed: "Under review",
};

export const offerStatusLabel: Record<string, string> = {
  open: "Open",
  accepted: "Accepted",
  countered: "Countered",
  declined: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

/** Server pages read the clock through this helper because they render per request, not per build. */
export function currentTime(): number {
  return Date.now();
}
