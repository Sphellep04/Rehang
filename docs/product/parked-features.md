# Parked features

Features we agreed to come back to. Each one is waiting on something outside the code.

| Feature | Waiting on | What exists already |
|---|---|---|
| Real payments (checkout, refunds and payouts) | Choosing a licensed payment partner (PayToday, FNB eWallet or MTC AwehPay) | Provider-neutral held-payment layer, signed webhook, queued refunds and payouts, staging simulator |
| Boosts (paid promotion of a listing) | Payments working, and more than 2,000 active listings | `boosts_enabled` flag and `item_promotions` table |
| Drop-off points and Closet Pickup | Partner shops or lockers, and an agreed fee | `dropoff_points_enabled` flag, `fulfilment_points` table, `dropoff` delivery method |
| Split payouts | Payments working, and the partner supporting marketplace payouts | `payouts` table and queued payout rows |
| WhatsApp order updates | A WhatsApp Business provider account and approved message templates | Email and in-app notifications for every order event |
| Push notifications | A decision on VAPID keys and a way to test on real phones | In-app and email notifications |
| Evidence photos for disputes on posted orders | Not started | Evidence storage exists for meet-up disputes |
| Founding-seller commission exemption dates | Decision on the exact dates | `commission_bps` and the founding-seller flag |
| Payout reconciliation report | Payments working | `payment_transactions` and `payouts` tables |

Built but switched off, waiting for real-world setup: delivery orders, bundles, and giving to children's homes.
