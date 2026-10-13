# Staging and launch runbook

Everything in this file is something only the project owner can do, because it needs accounts and secrets. None of it has been exercised yet.

## 1. Supabase (one project for staging, one for production)
1. Create the project. Region closest to Namibia (Europe or South Africa if offered).
2. Link and push: `supabase link --project-ref <ref>` then `supabase db push`.
3. Enable the `pg_cron` extension (Database, Extensions). The order timers are scheduled by the migration only if it exists.
4. Auth settings: email confirmation on, minimum password length 10, SMS off. Set the site URL and add `<site>/auth/confirm` to redirect URLs.
5. Auth, SMTP: use Resend (host `smtp.resend.com`, port 465, user `resend`, password = your Resend API key).
6. Check the storage buckets exist: `id-documents` (private), `avatars`, `item-photos`, `dispute-evidence`.
7. Make yourself a moderator: set `role` on your row in `public.users` using the SQL editor.
8. Staff two-factor: sign in, open `/admin/security` and add the authenticator app. Then switch on database enforcement: `update public.app_config set value = 'true'::jsonb where key = 'require_moderator_mfa';`. Do it only after every moderator has enrolled, or they are locked out of actions.
9. Invite-only sign-up (optional): `update public.app_config set value = 'true'::jsonb where key = 'signup_requires_invite';`. Then create codes or email people from the waiting list in `/admin`. Switch back to `'false'` to open sign-up to everyone. The check is a trigger on `auth.users`, so it holds even if someone calls the Supabase sign-up API directly.

## 2. Resend
1. Add your domain and publish the DNS records it shows.
2. Create an API key. Set `EMAIL_FROM` to an address on that domain.

## 3. Vercel environment variables
| Name | Notes |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | From Supabase API settings |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never prefix with `NEXT_PUBLIC_` |
| `ID_HASH_PEPPER` | `openssl rand -hex 32`. Changing it later breaks duplicate-ID detection |
| `CRON_SECRET` | 24+ random characters. Vercel sends it to the cron routes |
| `RESEND_API_KEY`, `EMAIL_FROM` | Email alerts and digest |
| `NEXT_PUBLIC_SITE_URL` | Used in email links |

## 4. Check after the first deploy
- Sign up, receive the confirmation email, sign in.
- Publish a listing with three photos; confirm the card image loads.
- Run every cron route by hand (`emails`, `digest`, `id-images`, `trust`): `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/cron/emails` (expect `{"sent":...}` not 401 or 503).
- Submit ID verification as a test user, approve it as a moderator, wait for or trigger `/api/cron/id-images`, and confirm the files are removed from the `id-documents` bucket.
- Delete a test account and confirm the export download works first.
- On a phone, open the site and use Add to Home Screen. Turn on airplane mode and confirm the offline page shows.

## 5. Email timing
Vercel Hobby cron runs once a day. For alerts within minutes, schedule a call to `/api/cron/emails` every 5 minutes from Supabase `pg_cron` with `pg_net`, or from any external pinger, with the same Bearer header.
