-- First-party analytics. Only events that the database cannot work out for itself are stored here (shares, app installs,
-- visits from a shared link). Orders, listings, disputes and sign-ups are counted straight from their own tables.
-- No personal data: the name must be on a short allowlist, only three property keys are kept, and values are cut to 40 characters.

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  name text not null,
  props jsonb not null default '{}'::jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_name_time_idx on public.analytics_events (name, created_at desc);
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated;

-- Recording is best effort and never raises: it returns false when the event is not accepted, so a page never breaks over analytics.
create or replace function public.track_event(p_name text, p_props jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  clean jsonb := '{}'::jsonb;
  k text;
  v text;
begin
  if p_name is null or p_name not in ('share_clicked', 'pwa_installed', 'install_prompt_shown', 'shared_link_opened') then
    return false;
  end if;
  -- Whole-site ceiling of 5,000 events an hour, and 60 an hour for one signed-in person.
  if (select count(*) from public.analytics_events where created_at > now() - interval '1 hour') >= 5000 then
    return false;
  end if;
  if me is not null and (select count(*) from public.analytics_events where user_id = me and created_at > now() - interval '1 hour') >= 60 then
    return false;
  end if;
  if jsonb_typeof(coalesce(p_props, '{}'::jsonb)) = 'object' then
    for k in select * from unnest(array['channel', 'object', 'surface']) loop
      v := p_props ->> k;
      if v is not null then
        clean := clean || jsonb_build_object(k, left(regexp_replace(v, '[^a-zA-Z0-9_ -]', '', 'g'), 40));
      end if;
    end loop;
  end if;
  insert into public.analytics_events (name, props, user_id) values (p_name, clean, me);
  return true;
end;
$$;
revoke all on function public.track_event(text, jsonb) from public;
grant execute on function public.track_event(text, jsonb) to anon, authenticated;

-- Weekly report for moderators. Weeks start on Monday, Windhoek time. The north star is a completed order with no dispute.
create or replace function public.weekly_metrics(p_weeks integer default 8)
returns table (
  week_start date,
  sign_ups integer,
  waitlist_joined integer,
  listings_published integer,
  orders_created integer,
  orders_completed integer,
  clean_orders_completed integer,
  disputes_opened integer,
  reports_filed integer,
  shares integer,
  app_installs integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  first_week date;
begin
  perform public.assert_moderator();
  if p_weeks not between 1 and 52 then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  first_week := date_trunc('week', (now() at time zone 'Africa/Windhoek'))::date - (p_weeks - 1) * 7;
  return query
  with weeks as (
    select generate_series(first_week::timestamp, (first_week + (p_weeks - 1) * 7)::timestamp, interval '7 days')::date as w
  )
  select
    weeks.w::date,
    (select count(*) from public.users x where date_trunc('week', x.created_at at time zone 'Africa/Windhoek')::date = weeks.w)::integer,
    (select count(*) from public.waitlist x where date_trunc('week', x.created_at at time zone 'Africa/Windhoek')::date = weeks.w)::integer,
    (select count(*) from public.items x where x.published_at is not null and date_trunc('week', x.published_at at time zone 'Africa/Windhoek')::date = weeks.w)::integer,
    (select count(*) from public.orders x where date_trunc('week', x.created_at at time zone 'Africa/Windhoek')::date = weeks.w)::integer,
    (select count(*) from public.orders x where x.status = 'completed' and date_trunc('week', x.completed_at at time zone 'Africa/Windhoek')::date = weeks.w)::integer,
    (select count(*) from public.orders x where x.status = 'completed' and date_trunc('week', x.completed_at at time zone 'Africa/Windhoek')::date = weeks.w
       and not exists (select 1 from public.disputes d where d.order_id = x.id))::integer,
    (select count(*) from public.disputes x where date_trunc('week', x.created_at at time zone 'Africa/Windhoek')::date = weeks.w)::integer,
    (select count(*) from public.reports x where date_trunc('week', x.created_at at time zone 'Africa/Windhoek')::date = weeks.w)::integer,
    (select count(*) from public.analytics_events x where x.name = 'share_clicked' and date_trunc('week', x.created_at at time zone 'Africa/Windhoek')::date = weeks.w)::integer,
    (select count(*) from public.analytics_events x where x.name = 'pwa_installed' and date_trunc('week', x.created_at at time zone 'Africa/Windhoek')::date = weeks.w)::integer
  from weeks
  order by weeks.w desc;
end;
$$;
revoke all on function public.weekly_metrics(integer) from public, anon;
grant execute on function public.weekly_metrics(integer) to authenticated;
