-- Email notifications sent through Resend, plus a daily digest of new listings from followed sellers.
-- The database only decides WHO should get WHAT. A server job (app/api/cron/emails) sends the mail.

alter table public.users
  add column if not exists email_alerts boolean not null default true,
  add column if not exists email_digest boolean not null default true,
  add column if not exists last_digest_at timestamptz;
alter table public.notifications add column if not exists emailed_at timestamptz;

create index if not exists notifications_unemailed_idx on public.notifications (created_at) where emailed_at is null;

create or replace function public.set_email_preferences(p_alerts boolean, p_digest boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  update public.users set email_alerts = coalesce(p_alerts, email_alerts), email_digest = coalesce(p_digest, email_digest) where id = (select auth.uid());
end;
$$;
revoke all on function public.set_email_preferences(boolean, boolean) from public, anon;
grant execute on function public.set_email_preferences(boolean, boolean) to authenticated;

-- Reminders go out 2 to 3 hours before a confirmed meet-up, once per order.
create or replace function public.queue_meetup_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  made integer := 0;
begin
  for o in
    select id, buyer_id, seller_id, meetup_at from public.orders
    where status = 'awaiting_meetup' and meetup_confirmed_at is not null
      and meetup_at between now() + interval '1 hour' and now() + interval '3 hours'
      and not exists (select 1 from public.order_events e where e.order_id = orders.id and e.event = 'reminder_queued')
  loop
    perform public.notify_user(o.buyer_id, 'meetup_reminder', jsonb_build_object('order_id', o.id, 'meetup_at', o.meetup_at, 'role', 'buyer'));
    perform public.notify_user(o.seller_id, 'meetup_reminder', jsonb_build_object('order_id', o.id, 'meetup_at', o.meetup_at, 'role', 'seller'));
    perform public.log_order_event(o.id, null, 'reminder_queued');
    made := made + 1;
  end loop;
  return made;
end;
$$;

-- Notifications that should become an email, newest first. Opted-out people are skipped and marked done.
create or replace function public.emails_due(p_limit integer default 100)
returns table (notification_id uuid, email text, display_name text, kind text, payload jsonb)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Quietly close out anything the person has opted out of, or that has no address, or is stale.
  update public.notifications n set emailed_at = now()
  where n.emailed_at is null
    and (n.created_at < now() - interval '2 days'
         or not exists (select 1 from public.users u where u.id = n.user_id and u.email is not null and u.email_alerts and u.status = 'active'));

  return query
  select n.id, u.email, u.display_name, n.kind, n.payload
  from public.notifications n
  join public.users u on u.id = n.user_id
  where n.emailed_at is null
  order by n.created_at
  limit greatest(1, least(p_limit, 500));
end;
$$;

create or replace function public.mark_emailed(p_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (update public.notifications set emailed_at = now() where id = any (p_ids) and emailed_at is null returning 1)
  select count(*)::integer from done
$$;

-- One digest per person per day: new listings from sellers they follow, newest first, at most 8 shown.
create or replace function public.digest_candidates()
returns table (user_id uuid, email text, display_name text, items jsonb, item_count integer)
language sql
security definer
set search_path = ''
as $$
  select u.id, u.email, u.display_name,
         jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'price_cents', x.price_cents, 'seller', x.seller_name, 'handle', x.handle) order by x.published_at desc) filter (where x.rn <= 8),
         count(*)::integer
  from public.users u
  join lateral (
    select i.id, i.title, i.price_cents, i.published_at, s.display_name as seller_name, s.handle,
           row_number() over (order by i.published_at desc) as rn
    from public.follows f
    join public.items i on i.seller_id = f.seller_id and i.status = 'active'
    join public.users s on s.id = f.seller_id and s.status = 'active'
    where f.follower_id = u.id and i.published_at > coalesce(u.last_digest_at, now() - interval '1 day')
  ) x on true
  where u.status = 'active' and u.email is not null and u.email_digest
    and (u.last_digest_at is null or u.last_digest_at < now() - interval '20 hours')
  group by u.id, u.email, u.display_name
$$;

create or replace function public.mark_digest_sent(p_users uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (update public.users set last_digest_at = now() where id = any (p_users) returning 1)
  select count(*)::integer from done
$$;

revoke all on function public.queue_meetup_reminders(), public.emails_due(integer), public.mark_emailed(uuid[]), public.digest_candidates(), public.mark_digest_sent(uuid[]) from public, anon, authenticated;
grant execute on function public.queue_meetup_reminders(), public.emails_due(integer), public.mark_emailed(uuid[]), public.digest_candidates(), public.mark_digest_sent(uuid[]) to service_role;
