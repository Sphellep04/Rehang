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
- [ ] Rate limits live on OTP, messages, listings
- [ ] Secrets only on the server. GitHub secret scanning on
- [ ] Sentry and uptime alerts working
- [ ] Backups confirmed, and one restore tested
- [ ] Privacy policy and terms published, and consent recorded at sign-up
