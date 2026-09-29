# Launch checklists

## A. Private pilot, target February 2027

Opens the app to founding sellers, then invited buyers, in Windhoek.

**Product**
- [ ] Milestones M0–M6 complete (see README section 9)
- [ ] Meet-up spots in Windhoek visited and confirmed (at least 4)
- [ ] Categories, sizes and brands seeded
- [ ] Limits and timers set in `app_config`
- [ ] Data saver mode and low-data targets met

**Trust and safety**
- [ ] [Security checklist](../engineering/security-and-backups.md#pre-pilot-security-checklist) complete
- [ ] Moderator dashboard tested end to end
- [ ] Moderator trained on the [moderator guide](moderator-guide.md)

**Legal**
- [ ] Company registered with BIPA, or registration in progress with a name reserved
- [ ] Terms of use, privacy policy, seller rules, buyer protection and prohibited items reviewed by a lawyer and published
- [ ] Consent recorded at sign-up (terms version and timestamp)
- [ ] ID image retention period confirmed

**Operations**
- [ ] WhatsApp Business number and support email live, with saved replies loaded
- [ ] Closet party kit: phone tripod, plain backdrop, clothes rail, hangers, printed QR code for sign-up
- [ ] Analytics dashboards built (see [analytics events](../engineering/analytics-events.md))

**Supply**
- [ ] 30 founding sellers confirmed before the pilot opens
- [ ] Closet parties scheduled to reach **100 sellers and 500 listings** by the end of March

## B. Invite buyers, target March 2027

- [ ] At least 300 listings live before the first buyer invites
- [ ] Waiting list invited in waves of 50, watching messages, orders and support load between waves
- [ ] Share links for shops and items tested on WhatsApp (preview image and title show correctly)
- [ ] Campus partnerships (NUST, UNAM) briefed

## C. Gate 2 review, end of March 2027

| Check | Target | Result |
|---|---|---|
| Active listings | 500 | |
| Verified sellers | 100 | |
| Completed pilot sales | 30+ | |
| Orders with a problem or dispute | Under 5% | |
| Median verification time | Under 24 hours | |
| Payment partner signed, or a clear date for it | Yes | |

Go → public launch. Miss → extend the pilot 4–6 weeks and fix the weakest number.

## D. Public launch, target April 2027

- [ ] Gate 2 passed
- [ ] Held payments tested with real small transactions, with `payments_enabled` on. If the partner isn't ready, launch with meet-ups only and turn payments on when ready
- [ ] Buyer protection fee and commission set in `app_config`. Founding-seller free period dates set
- [ ] Courier partner (at least 1) agreed for town-to-town orders, if held payments are live
- [ ] Hosting on paid plans (Vercel, Supabase)
- [ ] Launch content ready: 4 weeks of Instagram and TikTok posts, 3 creators booked
- [ ] Launch event (pop-up swap and sell day) booked
- [ ] Referral credit live
- [ ] Support hours extended for launch week
