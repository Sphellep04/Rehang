# Security, privacy and backups

Rehang holds phone numbers, photos, chat and, most sensitive of all, ID documents. This is the security checklist to complete before the pilot (February 2027), and to re-check before public launch.

## Main threats and controls

| Threat | Controls |
|---|---|
| ID images leaked | Private bucket. Signed URLs valid for 5 minutes. Only moderators can view. Images deleted after the retention period. Access logged. Moderator accounts use strong passwords and two-factor login |
| Account takeover | OTP login rate-limited per phone number and per IP. Alert the user by SMS when the login phone number changes. Moderator and admin accounts require two-factor login |
| Users reading each other's data | RLS on every table, tested with pgTAP in CI. Private profile fields only served through views |
| Scammers creating many accounts | One ID number hash per seller. Phone OTP. Rate limits on sign-up. Duplicate-photo detection |
| Spam and harassment in chat | Rate limits. Block. Report. Contact-info detection. Moderator review |
| Payment fraud (Phase 2) | Rehang never touches card data. Gateway webhooks verified by signature. Order state changed only on the server. Amounts come from the database, never from the client |
| Leaked secrets | Service-role key and gateway keys only in server environment variables. `.env*` in `.gitignore`. Secret scanning turned on in GitHub |
| Abuse by insiders (moderators) | Least-privilege roles. Every moderator action logged with who and when. Moderators can't change payouts |

## Rate limits (starting values)

| Action | Limit |
|---|---|
| OTP requests | 3 per phone number per 10 minutes. 10 per IP per hour |
| New conversations | 5 a day at Level 0, 30 a day at Level 1 and above |
| Messages | 60 per hour |
| New listings | 50 a day (clear-out mode friendly) |
| Reports | 20 a day |

## Privacy by design

- Collect only what's needed. Date of birth becomes an "18 or older" flag. The ID number becomes a salted hash.
- Phone numbers are never shown to other users. All contact happens through in-app chat.
- EXIF data, including GPS location, is removed from all uploaded photos.
- Users can download their data and delete their account from settings. Deletion removes the profile and listings. Order records are kept in anonymised form for the retention period set in the [privacy policy](../policies/privacy-policy.md).

## Backups

| What | How | Frequency | Kept for |
|---|---|---|---|
| Postgres database | Supabase automated backups (paid plan, check the retention period included) **plus** our own `pg_dump`, encrypted and stored in a separate cloud account | Daily (Supabase), weekly (own dump) | 30 days |
| Item photos | Stored in Supabase Storage. Could be regenerated from originals if needed. Weekly sync to a second location from Phase 2 | Weekly | 30 days |
| ID documents | **Never backed up.** They're temporary by design | n/a | n/a |

**Test a restore to staging once a quarter.** A backup that has never been restored doesn't count.

## Incident response (short version)

1. **Contain:** rotate keys, disable affected accounts, and turn features off with flags.
2. **Assess:** what data, how many users, and since when.
3. **Notify:** affected users in plain language. Notify authorities as required by Namibian law (confirm the obligations with the lawyer).
4. **Fix and record:** find the root cause, fix it, and write up what happened in `docs/incidents/`.

## Pre-pilot security checklist

- [ ] RLS enabled on every table, with pgTAP tests passing
- [ ] `id-documents` bucket is private. Signed URL expiry confirmed. Deletion job running
- [ ] Moderator accounts have two-factor login
- [ ] Rate limits live on sign-in, sign-up, messages, listings (config written, see the review below; confirm on the hosted project)
- [ ] Secrets only on the server. GitHub secret scanning on
- [ ] Sentry and uptime alerts working
- [ ] Backups confirmed, and one restore tested
- [ ] Privacy policy and terms published, and consent recorded at sign-up

## Security review, 14 October 2026

A review of the database, the app and the dependencies. What was found, what was changed, and what is still open.

### Fixed in code

| Finding | Risk | Fix |
|---|---|---|
| The "return to" check (`safeNext`) let `/<tab>/evil.com` through. Browsers delete tabs and line breaks, so it became `//evil.com` | Open redirect after sign-in and after email links, usable for phishing | Control characters, spaces and over-long values are refused, and the path is parsed to confirm it stays on this site. Unit tests added |
| Confirmation and reset emails built their link from the request `Host` header | A forged `Host` could point a password reset link at an attacker's site | The link now uses `NEXT_PUBLIC_SITE_URL`. In production the app refuses to send if it is not set |
| No browser security headers | Clickjacking, content sniffing, foreign form targets, data leaving to other sites | Content Security Policy, HSTS, `X-Frame-Options`, `nosniff`, referrer and permissions policies in `next.config.ts`. Admin and account pages are never stored by shared caches |
| Every setting was readable by visitors, including message caps and order limits | Helps an abuser stay just under the limits | Visitors read a short public list. Staff read the rest |
| Published item photo files could be overwritten by the seller | Swap a reviewed photo for a different one | Photo files can no longer be updated in place |
| No ceiling on uploads per person | One account could fill storage | Per-person caps: 1,500 item photos, 20 avatars, 12 ID files |
| `heic-to/next` needs `unsafe-eval` | Would have forced a weaker CSP | Switched to `heic-to/csp`. Re-tested a real HEIC file in Chromium under the policy |
| Sign-up and sign-in limits were left at defaults | Password guessing and fake accounts | Explicit limits in `supabase/config.toml`, anonymous sign-in off |

### Checked and found sound

Every public table has row level security. Every security-definer function sets an empty `search_path`. Visitors can run only a short list of functions. `public_profiles` exposes no email or ID data. `/api/cron/*` compares the secret in constant time and refuses weak secrets. Production dependencies have no known vulnerabilities (`npm audit --omit=dev`). Sign-in, sign-up and reset give the same reply whether or not an account exists.

### Known limits and open items

- **The CSP allows inline scripts.** Next.js writes small inline scripts into each page. A per-request nonce would stop pages from being prerendered. The policy still blocks plugins, framing, foreign forms, foreign base tags and connections to other sites. Revisit if the site ever handles payments.
- **Dev-only advisories.** `npm audit` reports problems in the test tools (`vitest`, `tinypool`, `braces`). They are not shipped to visitors, but do not run the tests against untrusted code. Upgrade vitest when convenient.
- **Item photos are public by design.** A photo URL works for anyone who has it, even if the listing is later removed. Do not allow personal documents in listing photos.
- **Waiting list flood guard is site-wide** (300 an hour). A determined bot could fill it and block real sign-ups for that hour. A Turnstile check on `/join` would fix this.
- **Staff two-factor is built but off in the database** until every moderator has enrolled. Switch on `require_moderator_mfa` then.
- **No bot check on sign-up yet.** `supabase/config.toml` has the Turnstile settings ready, commented out. The forms must send the token before enabling it.
- **Add a rate limit at Vercel** for `/api/listings` and the sign-in pages (Firewall, Rate limiting). The app has none of its own.
- **Not tested against real services.** The headers, limits and policies were checked locally and in a scratch database, not on Supabase or Vercel.
