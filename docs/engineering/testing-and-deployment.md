# Testing and deployment

A setup small enough for one part-time developer, with the checks that matter most for a marketplace that handles trust and money.

## Environments

| Environment | Front end | Database | Used for |
|---|---|---|---|
| Local | `next dev` | Supabase CLI local stack (Docker) | Day-to-day development |
| Preview | Vercel preview deploy for each pull request | Shared **staging** Supabase project | Reviewing changes on a real phone |
| Production | Vercel production (`main` branch) | **Production** Supabase project | Real users |

Never point local or preview at the production database. Seed staging with fake users and items (`supabase/seed.sql`).

> Check the hosting plan before taking payments or running ads. Vercel's free Hobby plan is for non-commercial use, so budget for a paid plan by public launch. Supabase's free plan has project limits and pauses when inactive, so move production to a paid plan before the pilot.

## Branching and releases

- `main` is always deployable and deploys to production automatically.
- Work in short-lived branches (`feat/…`, `fix/…`) and merge through pull requests, even when working solo, so every change gets a preview link and CI run.
- Database changes are only made through migration files in `supabase/migrations/`, applied with `supabase db push`. Never edit the production schema by hand.
- **Feature flags** live in `app_config` (for example `payments_enabled`, `courier_enabled`), so held payments can be merged early and switched on when the partner is ready.

## Tests: what to cover

| Level | Tool | What |
|---|---|---|
| Type checks and lint | TypeScript, ESLint | Everything |
| Unit | Vitest | Fee maths (cents), size mapping, validation schemas, timer calculations, strike ladder |
| Database / RLS | pgTAP (through `supabase test db`) | **Every RLS policy:** a buyer can't read someone else's orders, only moderators can read ID documents, a Level 1 user can't create items, blocked users can't message |
| End-to-end | Playwright (mobile viewport) | The critical paths below |
| Performance | Lighthouse CI | [Low-data targets](performance-and-low-data.md) on the feed and item pages |

### Critical paths (Playwright)

1. Sign up with an OTP (a test phone number or mocked SMS) → complete the profile.
2. Seller: submit ID → list 3 items in clear-out mode → moderator approves → items go live.
3. Buyer: search with filters → favourite → message → make an offer → seller accepts.
4. Meet-up order: seller confirms → buyer sees the code → seller enters the code → both rate.
5. Cancellation and no-show paths issue the right strikes.
6. Report a listing → moderator removes it.

## CI (GitHub Actions)

On every pull request:
1. Install → typecheck → lint → unit tests.
2. Start the Supabase local stack → apply migrations → run pgTAP RLS tests.
3. Build → Playwright against the build.
4. Lighthouse CI on the Vercel preview URL.

The pull request can't merge unless all steps pass.

## Monitoring

- **Errors:** Sentry (free tier) on both client and server, with alerts sent to email.
- **Uptime:** a free uptime checker on the home page and a `/api/health` route that queries the database.
- **Scheduled jobs:** timers and ID-image deletion log each run to `order_events` or a `job_runs` table. Alert if a job hasn't run for 2 hours.

## Release checklist (before each production deploy that touches orders, verification or RLS)

- [ ] Migrations tested on staging
- [ ] RLS tests pass
- [ ] Critical-path E2E tests pass
- [ ] Feature flags set correctly in production `app_config`
- [ ] Rollback plan noted (revert the commit, plus a reverse migration if needed)
