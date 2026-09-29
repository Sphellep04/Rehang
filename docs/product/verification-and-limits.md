# Verification levels and limits

This fills in the numbers the original plan left open and fixes the conflict between "every seller is verified" and "list in under two minutes".

## The fix: list now, go live on approval

A new seller can create listings straight away, including in closet clear-out mode. Until their ID check is approved, the listings are saved as **"Waiting for verification"** and aren't visible to buyers. When a moderator approves the ID, every waiting listing publishes automatically and the seller gets an SMS.

- The seller still lists in under two minutes.
- Buyers still only see verified sellers.
- Target approval time is **under 24 hours** (same day during the pilot).
- At closet parties and pop-up events, verify on the spot so items go live right away.

## Levels

| Level | How to reach it | Can do | Limits (starting values) |
|---|---|---|---|
| **Level 0** | Phone number and one-time code | Browse, favourite, follow sellers, message | Up to 5 new conversations a day |
| **Level 1** | Add email and a profile photo | Buy | Up to **N$1,000 per order** and **N$2,000 per 30 days** |
| **Level 2** | Namibian ID or passport photo plus a live selfie, approved by a moderator | Sell. Buy with no limit | New-seller limits for the first 30 days after approval: at most 30 active listings, and items over N$1,500 need a brand check |
| **Trusted seller** | Automatic: 10 completed sales, rating 4.5 or higher, no upheld disputes, account at least 60 days old | Badge, higher placement in search, higher payout limits (Phase 2) | Lost automatically if the rating drops below 4.3 or a dispute is upheld |

Limits are stored in a config table, not hard-coded, so they can change without a release.

## What the seller submits for Level 2

1. Photo of the front of a Namibian ID card or the passport photo page.
2. A live selfie taken in the app. Gallery uploads aren't allowed for the selfie.
3. Full name as it appears on the ID. It must match the profile name. A shop name or nickname can be used as the public display name.
4. Confirmation of being 18 or older.

## Moderator review checklist (about 2 minutes)

- [ ] The document is a Namibian ID or a passport, and it isn't expired
- [ ] The photo is clear, and the whole document is visible
- [ ] Name on the document matches the name entered
- [ ] Date of birth shows the person is 18 or older
- [ ] Selfie face matches the ID photo
- [ ] Selfie is live (taken in the app, not a photo of a photo)
- [ ] ID number hash not already used by another account (checked automatically)

**Outcomes:** Approve / Reject with a reason (blurry, name mismatch, face mismatch, expired, under 18, document not accepted) / Escalate to the founder.

A rejected user can resubmit up to 3 times. After that, support handles it.

## Storing ID data

| Data | Stored? | Where | How long |
|---|---|---|---|
| ID image and selfie | Yes, temporarily | Private, encrypted storage bucket. Only moderators can view it, through signed links that expire after 5 minutes | **Proposed: deleted 30 days after the decision.** Final period to be confirmed with a lawyer |
| ID number | No, only a one-way hash | Database | While the account exists. Stops one person opening several seller accounts |
| Verification result, date, reviewer | Yes | Database | While the account exists |
| Date of birth | No, only an "18 or older" flag | Database | While the account exists |

## When to re-verify

- Seller changes their legal name or phone number.
- Account shows scam signals (see the [moderator guide](../operations/moderator-guide.md#scam-signals)).
- Dispute upheld for fraud.

## Later: automated checks

Once there are more than about 30 ID checks a day, look at identity-verification providers. The provider must:
- Support Namibian ID cards (confirm first).
- Offer liveness detection.
- Process data in a way that meets Namibian data protection requirements.
- Have per-check pricing that works at Rehang's volumes.

Keep manual review as the fallback.
