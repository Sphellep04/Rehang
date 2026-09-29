# Analytics events

These events measure the funnels and north-star metric in README section 16. Use one product analytics tool (for example PostHog, which has a free tier) and keep event names in `snake_case`, in the form object then action.

Don't send personal data (names, phone numbers, message text) as event properties. Use the user's `id` only.

## Seller funnel

| Event | When | Key properties |
|---|---|---|
| `user_signed_up` | OTP verified for the first time | town, source (utm or referral) |
| `profile_completed` | Level 1 reached | |
| `verification_submitted` | ID and selfie sent | |
| `verification_decided` | Moderator decides | outcome, hours_to_decision |
| `listing_started` | Sell flow opened | mode (single or clear_out) |
| `listing_photo_rejected` | An automatic check failed | reason (blur, duplicate, contact_info, small) |
| `listing_created` | Saved (draft or waiting for verification) | category, condition, price_cents, photo_count, seconds_to_create |
| `listing_published` | Goes live | hours_waiting_for_verification |
| `first_sale_completed` | The seller's first completed order | days_since_signup |

## Buyer funnel

| Event | When | Key properties |
|---|---|---|
| `feed_viewed` | Feed opened | filters_applied |
| `search_performed` | Search or filter applied | query_length, filters, result_count |
| `item_viewed` | Item page opened | item_id, category, price_cents, source (feed, search, shop, share_link) |
| `item_favourited` | | item_id |
| `seller_followed` | | seller_id |
| `conversation_started` | First message about an item | item_id |
| `offer_made` | | item_id, offer_pct_of_price |
| `offer_responded` | | outcome (accepted, countered, declined) |
| `order_created` | | order_id, delivery_method, amount_cents |
| `meetup_confirmed` | Seller confirms | hours_to_confirm |
| `order_completed` | Code entered or auto-complete | order_id, hours_from_order |
| `order_cancelled` | | reason, by (buyer, seller, system) |
| `review_submitted` | | rating, role |

## Trust and safety

| Event | When |
|---|---|
| `contact_info_flagged` | A phone number or handle is detected in a message or photo |
| `report_submitted` | target_type, reason |
| `no_show_reported` | |
| `strike_issued` | reason |
| `dispute_opened` / `dispute_decided` | Phase 2 |

## Growth

| Event | When |
|---|---|
| `share_clicked` | channel (whatsapp, copy_link, other), object (item or shop) |
| `referral_signup` | A new user arrives from a referral link |
| `waitlist_joined` | Landing page |
| `pwa_installed` | App installed to the home screen |

## Core dashboards

1. **North star:** completed orders per week with no dispute and no problem report.
2. **Seller funnel:** signed up → verified → first listing → first sale.
3. **Buyer funnel:** item viewed → conversation or offer → order → completed.
4. **Supply health:** active listings, new listings per active seller, sell-through within 30 days.
5. **Trust:** verification time (median), reports per 100 orders, no-show rate, dispute rate.
6. **Retention:** buyers who buy again within 60 days. Sellers who list again within 30 days.
