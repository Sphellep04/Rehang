create type public.verification_level as enum ('level0', 'level1', 'level2');
create type public.verification_status as enum ('pending', 'approved', 'rejected', 'escalated');
create type public.item_condition as enum ('new_with_tags', 'new_without_tags', 'very_good', 'good', 'fair');
create type public.item_status as enum ('draft', 'awaiting_verification', 'active', 'reserved', 'sold', 'removed');
create type public.offer_status as enum ('open', 'accepted', 'countered', 'declined', 'expired', 'withdrawn');
create type public.order_status as enum ('awaiting_payment', 'paid_held', 'awaiting_meetup', 'shipped', 'delivered', 'completed', 'disputed', 'refunded', 'cancelled');
create type public.delivery_method as enum ('meetup', 'courier', 'post', 'dropoff');
create type public.report_target as enum ('item', 'user', 'message');
create type public.moderation_status as enum ('open', 'actioned', 'dismissed');
create type public.user_role as enum ('member', 'moderator', 'admin');

create table public.towns (
  id integer generated always as identity primary key,
  name text not null unique,
  region text not null,
  is_live boolean not null default false
);

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text unique check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null,
  legal_name text,
  email text,
  photo_url text,
  bio text check (bio is null or char_length(bio) <= 160),
  town_id integer references public.towns (id),
  verification_level public.verification_level not null default 'level0',
  is_trusted_seller boolean not null default false,
  is_founding_seller boolean not null default false,
  role public.user_role not null default 'member',
  status text not null default 'active' check (status in ('active', 'restricted', 'suspended', 'banned')),
  restricted_until timestamptz,
  over_18 boolean not null default false,
  id_number_hash text unique check (id_number_hash is null or id_number_hash ~ '^[0-9a-f]{64}$'),
  terms_accepted_at timestamptz,
  terms_version text,
  created_at timestamptz not null default now()
);

create table public.app_config (
  key text primary key check (key ~ '^[a-z][a-z0-9_]*$'),
  value jsonb not null
);

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select u.role
  from public.users as u
  where u.id = (select auth.uid())
    and u.status = 'active'
$$;

revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

create view public.public_profiles
with (security_barrier = true)
as
  select
    u.id,
    u.handle,
    u.display_name,
    u.photo_url,
    u.bio,
    t.name as town,
    u.verification_level,
    u.is_trusted_seller,
    u.is_founding_seller,
    u.created_at
  from public.users as u
  left join public.towns as t on t.id = u.town_id
  where u.status = 'active';

alter table public.towns enable row level security;
alter table public.users enable row level security;
alter table public.app_config enable row level security;

create policy towns_read_live
on public.towns for select
to anon, authenticated
using (is_live);

create policy users_read_self_or_moderator
on public.users for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role)
);

create policy app_config_read
on public.app_config for select
to anon, authenticated
using (true);

create policy app_config_admin_manage
on public.app_config for all
to authenticated
using ((select public.current_user_role()) = 'admin'::public.user_role)
with check ((select public.current_user_role()) = 'admin'::public.user_role);

revoke all on public.users, public.towns, public.app_config, public.public_profiles from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant usage on type public.verification_level to anon, authenticated;
grant usage on type public.user_role to authenticated;
grant select on public.public_profiles, public.towns, public.app_config to anon, authenticated;
grant select on public.users to authenticated;
grant insert, update, delete on public.app_config to authenticated;

insert into public.towns (name, region, is_live) values
  ('Windhoek', 'Khomas', true),
  ('Swakopmund', 'Erongo', false),
  ('Walvis Bay', 'Erongo', false),
  ('Oshakati', 'Oshana', false),
  ('Ongwediva', 'Oshana', false)
on conflict (name) do nothing;

insert into public.app_config (key, value) values
  ('payments_enabled', 'false'::jsonb),
  ('commission_bps', '0'::jsonb),
  ('buyer_fee_cents', '0'::jsonb),
  ('level1_order_limit_cents', '100000'::jsonb),
  ('level1_30d_limit_cents', '200000'::jsonb),
  ('level0_conversations_per_day', '5'::jsonb),
  ('level1_conversations_per_day', '30'::jsonb),
  ('level2_conversations_per_day', '30'::jsonb),
  ('minimum_offer_percent', '60'::jsonb),
  ('max_open_offers_per_item', '3'::jsonb),
  ('max_open_offers_total', '10'::jsonb),
  ('offer_expiry_hours', '24'::jsonb),
  ('meetup_code_attempt_limit', '5'::jsonb),
  ('meetup_code_valid_from_minutes_before', '60'::jsonb),
  ('meetup_code_valid_until_hours_after', '24'::jsonb)
on conflict (key) do nothing;