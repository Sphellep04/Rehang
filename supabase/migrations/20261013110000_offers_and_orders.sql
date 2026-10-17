-- Offers, meet-up orders, codes, cancellations, no-shows, strikes and timers (M3 and M4).
-- Everything that changes an offer or an order goes through the functions below. Clients never
-- write to offers, orders, order_events, strikes or notifications directly.

-- ---------------------------------------------------------------------------------------------
-- Schema additions
-- ---------------------------------------------------------------------------------------------

alter table public.offers
  add column if not exists made_by_seller boolean not null default false,
  add column if not exists responded_at timestamptz;

alter table public.orders
  add column if not exists meetup_confirmed_at timestamptz;

create index if not exists offers_item_status_idx on public.offers (item_id, status);
create index if not exists offers_buyer_status_idx on public.offers (buyer_id, status);
create index if not exists orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index if not exists orders_seller_idx on public.orders (seller_id, created_at desc);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

-- The meet-up code is a secret shared with the buyer only. orders.code_hash would be readable by
-- the seller, and a hash of a six digit number can be brute forced instantly, so the code lives in
-- a private table that no client role can read. Only the functions below touch it.
create table if not exists public.order_meetup_codes (
  order_id uuid primary key references public.orders (id) on delete cascade,
  code text not null check (code ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now()
);
alter table public.order_meetup_codes enable row level security;
revoke all on public.order_meetup_codes from anon, authenticated;

-- Hide code_hash (unused) and expose every other order column to participants. Clients must list
-- columns explicitly; select * on orders is refused for them.
revoke select on public.orders from authenticated;
grant select (
  id, item_id, bundle_offer_id, buyer_id, seller_id, offer_id, amount_cents, commission_cents,
  buyer_fee_cents, status, delivery_method, meetup_spot_id, meetup_at, fulfilment_point_id,
  code_attempts, tracking_number, payment_ref, confirm_by, completed_at, cancelled_at,
  cancel_reason, created_at, meetup_confirmed_at
) on public.orders to authenticated;

-- Reviews close 7 days after an order completes.
drop policy reviews_create_completed_participant on public.reviews;
create policy reviews_create_completed_participant on public.reviews for insert to authenticated
with check (
  reviewer_id = (select auth.uid())
  and exists (
    select 1 from public.orders o
    where o.id = order_id
      and o.status = 'completed'
      and o.completed_at > now() - interval '7 days'
      and ((o.buyer_id = (select auth.uid()) and o.seller_id = reviewee_id)
        or (o.seller_id = (select auth.uid()) and o.buyer_id = reviewee_id))
  )
);

-- Candidate safe meet-up spots from docs/product/orders-meetups-and-delivery.md. They are
-- inactive until someone visits, confirms the details and sets the real address, so nothing is
-- bookable by accident. Activate with: update public.meetup_spots set address = '...', active = true where name = '...';
insert into public.meetup_spots (town_id, name, address, active)
select t.id, v.name, 'Address to be confirmed on a site visit', false
from public.towns t
cross join (values ('Maerua Mall'), ('Grove Mall of Namibia'), ('Wernhil Park'), ('Town Square')) as v(name)
where t.name = 'Windhoek'
  and not exists (select 1 from public.meetup_spots s where s.name = v.name and s.town_id = t.id);

-- ---------------------------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------------------------

create or replace function public.config_bigint(p_key text, p_default bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::bigint from public.app_config where key = p_key), p_default)
$$;

create or replace function public.notify_user(p_user uuid, p_kind text, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, payload) values (p_user, p_kind, coalesce(p_payload, '{}'::jsonb))
$$;

create or replace function public.log_order_event(p_order uuid, p_actor uuid, p_event text, p_data jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.order_events (order_id, actor_id, event, data) values (p_order, p_actor, p_event, coalesce(p_data, '{}'::jsonb))
$$;

-- Raises unless the user may take part in trades right now.
create or replace function public.assert_active_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member public.users%rowtype;
begin
  select * into member from public.users where id = p_user;
  if not found or member.status <> 'active' then
    raise exception 'account_not_active' using errcode = 'P0001';
  end if;
  if member.terms_accepted_at is null then
    raise exception 'terms_not_accepted' using errcode = 'P0001';
  end if;
  if member.restricted_until is not null and member.restricted_until > now() then
    raise exception 'account_restricted' using errcode = 'P0001';
  end if;
end;
$$;

-- Buying needs Level 1 or higher. Level 1 has per order and 30 day spending limits.
create or replace function public.assert_can_buy(p_buyer uuid, p_seller uuid, p_amount_cents bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  buyer_level public.verification_level;
  spent bigint;
begin
  perform public.assert_active_member(p_buyer);

  if p_buyer = p_seller then
    raise exception 'own_item' using errcode = 'P0001';
  end if;

  -- A seller on a strike pause, or a suspended one, cannot receive new trades.
  if exists (
    select 1 from public.users s
    where s.id = p_seller and (s.status <> 'active' or (s.restricted_until is not null and s.restricted_until > now()))
  ) then
    raise exception 'seller_unavailable' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_buyer and b.blocked_id = p_seller) or (b.blocker_id = p_seller and b.blocked_id = p_buyer)
  ) then
    raise exception 'user_blocked' using errcode = 'P0001';
  end if;

  select verification_level into buyer_level from public.users where id = p_buyer;
  if buyer_level = 'level0' then
    raise exception 'verification_required' using errcode = 'P0001';
  end if;

  if buyer_level = 'level1' then
    if p_amount_cents > public.config_bigint('level1_order_limit_cents', 100000) then
      raise exception 'order_limit_exceeded' using errcode = 'P0001';
    end if;
    select coalesce(sum(o.amount_cents), 0) into spent
    from public.orders o
    where o.buyer_id = p_buyer
      and o.status in ('awaiting_meetup', 'paid_held', 'shipped', 'delivered', 'completed')
      and o.created_at > now() - interval '30 days';
    if spent + p_amount_cents > public.config_bigint('level1_30d_limit_cents', 200000) then
      raise exception 'monthly_limit_exceeded' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

-- Records a strike and applies the ladder: 2 strikes pauses trading for 72 hours, 3 for 14 days,
-- 4 or more flags the account for moderator review.
create or replace function public.issue_strike(p_user uuid, p_reason public.strike_reason, p_order uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  insert into public.strikes (user_id, reason, order_id) values (p_user, p_reason, p_order);
  select count(*) into recent from public.strikes where user_id = p_user and created_at > now() - interval '90 days';

  if recent = 2 then
    update public.users set restricted_until = greatest(coalesce(restricted_until, now()), now() + interval '72 hours') where id = p_user;
  elsif recent = 3 then
    update public.users set restricted_until = greatest(coalesce(restricted_until, now()), now() + interval '14 days') where id = p_user;
  elsif recent >= 4 then
    update public.users set restricted_until = greatest(coalesce(restricted_until, now()), now() + interval '14 days') where id = p_user;
    insert into public.notifications (user_id, kind, payload)
    select u.id, 'account_review_needed', jsonb_build_object('user_id', p_user, 'strikes', recent)
    from public.users u where u.role in ('moderator', 'admin') and u.status = 'active';
  end if;

  perform public.notify_user(p_user, 'strike_issued', jsonb_build_object('reason', p_reason, 'strikes_in_90_days', recent, 'order_id', p_order));
  return recent;
end;
$$;

-- Cancels an order and puts the item back on sale (or removes it when it was damaged or lost).
create or replace function public.finish_cancel(p_order uuid, p_actor uuid, p_reason text, p_by text, p_remove_item boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.orders%rowtype;
begin
  select * into ord from public.orders where id = p_order for update;
  update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = p_reason where id = p_order;
  if ord.item_id is not null then
    update public.items
      set status = case when p_remove_item then 'removed'::public.item_status else 'active'::public.item_status end
      where id = ord.item_id and status = 'reserved'::public.item_status;
  end if;
  perform public.log_order_event(p_order, p_actor, 'cancelled', jsonb_build_object('reason', p_reason, 'by', p_by));
  perform public.notify_user(ord.buyer_id, 'order_cancelled', jsonb_build_object('order_id', p_order, 'reason', p_reason, 'by', p_by));
  perform public.notify_user(ord.seller_id, 'order_cancelled', jsonb_build_object('order_id', p_order, 'reason', p_reason, 'by', p_by));
end;
$$;

-- Creates the order and reserves the item. Caller has already validated who may do this.
create or replace function public.create_order(p_item uuid, p_buyer uuid, p_offer uuid, p_amount_cents bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  it public.items%rowtype;
  new_order uuid;
  commission bigint;
begin
  select * into it from public.items where id = p_item for update;
  if not found or it.status <> 'active' then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;

  commission := (p_amount_cents * public.config_bigint('commission_bps', 0)) / 10000;

  insert into public.orders (item_id, buyer_id, seller_id, offer_id, amount_cents, commission_cents, status, delivery_method, confirm_by)
  values (p_item, p_buyer, it.seller_id, p_offer, p_amount_cents, commission, 'awaiting_meetup', 'meetup', now() + interval '24 hours')
  returning id into new_order;

  update public.items set status = 'reserved' where id = p_item;

  -- Any other open offers on this item are closed.
  update public.offers
    set status = 'declined', responded_at = now()
    where item_id = p_item and status = 'open' and id is distinct from p_offer;

  perform public.log_order_event(new_order, p_buyer, 'created', jsonb_build_object('amount_cents', p_amount_cents, 'offer_id', p_offer));
  perform public.notify_user(it.seller_id, 'order_created', jsonb_build_object('order_id', new_order, 'item_id', p_item));
  perform public.notify_user(p_buyer, 'order_created', jsonb_build_object('order_id', new_order, 'item_id', p_item));
  return new_order;
end;
$$;

-- Validates a meet-up request. Times are checked in Windhoek local time against the spot's hours.
create or replace function public.assert_valid_meetup(p_item uuid, p_spot integer, p_at timestamptz, p_order_created timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  spot public.meetup_spots%rowtype;
  item_town integer;
  local_time time;
begin
  select * into spot from public.meetup_spots where id = p_spot and active;
  if not found then
    raise exception 'meetup_spot_unavailable' using errcode = 'P0001';
  end if;

  select town_id into item_town from public.items where id = p_item;
  if spot.town_id is distinct from item_town then
    raise exception 'meetup_spot_wrong_town' using errcode = 'P0001';
  end if;

  if p_at is null or p_at < now() + interval '3 hours' then
    raise exception 'meetup_too_soon' using errcode = 'P0001';
  end if;
  if p_at > p_order_created + interval '3 days' then
    raise exception 'meetup_too_late' using errcode = 'P0001';
  end if;

  local_time := (p_at at time zone 'Africa/Windhoek')::time;
  if local_time < spot.opens or local_time > spot.closes then
    raise exception 'meetup_outside_hours' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function
  public.config_bigint(text, bigint),
  public.notify_user(uuid, text, jsonb),
  public.log_order_event(uuid, uuid, text, jsonb),
  public.assert_active_member(uuid),
  public.assert_can_buy(uuid, uuid, bigint),
  public.issue_strike(uuid, public.strike_reason, uuid),
  public.finish_cancel(uuid, uuid, text, text, boolean),
  public.create_order(uuid, uuid, uuid, bigint),
  public.assert_valid_meetup(uuid, integer, timestamptz, timestamptz)
from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------------------------

create or replace function public.make_offer(p_item uuid, p_amount_cents bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
  min_pct bigint := public.config_bigint('minimum_offer_percent', 60);
  new_offer uuid;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;

  select * into it from public.items where id = p_item;
  if not found or it.status <> 'active' then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;

  perform public.assert_can_buy(me, it.seller_id, p_amount_cents);

  if p_amount_cents is null or p_amount_cents % 100 <> 0 then
    raise exception 'offer_not_whole_amount' using errcode = 'P0001';
  end if;
  if p_amount_cents < (it.price_cents * min_pct + 99) / 100 then
    raise exception 'offer_too_low' using errcode = 'P0001';
  end if;
  if p_amount_cents >= it.price_cents then
    raise exception 'offer_not_below_price' using errcode = 'P0001';
  end if;

  if (select count(*) from public.offers o
      where o.item_id = p_item and o.buyer_id = me and o.status = 'open' and not o.made_by_seller and o.expires_at > now())
     >= public.config_bigint('max_open_offers_per_item', 3) then
    raise exception 'too_many_offers_on_item' using errcode = 'P0001';
  end if;
  if (select count(*) from public.offers o
      where o.buyer_id = me and o.status = 'open' and not o.made_by_seller and o.expires_at > now())
     >= public.config_bigint('max_open_offers_total', 10) then
    raise exception 'too_many_open_offers' using errcode = 'P0001';
  end if;

  insert into public.offers (item_id, buyer_id, amount_cents, expires_at)
  values (p_item, me, p_amount_cents, now() + make_interval(hours => public.config_bigint('offer_expiry_hours', 24)::integer))
  returning id into new_offer;

  perform public.notify_user(it.seller_id, 'offer_received', jsonb_build_object('offer_id', new_offer, 'item_id', p_item, 'amount_cents', p_amount_cents));
  return new_offer;
end;
$$;

create or replace function public.withdraw_offer(p_offer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  updated integer;
begin
  update public.offers
    set status = 'withdrawn', responded_at = now()
    where id = p_offer and buyer_id = me and status = 'open' and not made_by_seller;
  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'offer_not_open' using errcode = 'P0001';
  end if;
end;
$$;

-- Seller answers a buyer's offer (accept, decline or counter), or the buyer answers a seller's
-- counter (accept or decline). Returns what happened and any new order or counter offer id.
create or replace function public.respond_to_offer(p_offer uuid, p_action text, p_counter_cents bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  off public.offers%rowtype;
  it public.items%rowtype;
  min_pct bigint := public.config_bigint('minimum_offer_percent', 60);
  responder uuid;
  new_order uuid;
  new_offer uuid;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if p_action not in ('accept', 'decline', 'counter') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;

  select * into off from public.offers where id = p_offer for update;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0001';
  end if;
  select * into it from public.items where id = off.item_id;

  responder := case when off.made_by_seller then off.buyer_id else it.seller_id end;
  if me is distinct from responder then
    raise exception 'not_your_offer_to_answer' using errcode = 'P0001';
  end if;
  if off.status <> 'open' then
    raise exception 'offer_not_open' using errcode = 'P0001';
  end if;
  if off.expires_at <= now() then
    update public.offers set status = 'expired', responded_at = now() where id = p_offer;
    return jsonb_build_object('action', 'expired');
  end if;

  perform public.assert_active_member(me);

  if p_action = 'decline' then
    update public.offers set status = 'declined', responded_at = now() where id = p_offer;
    perform public.notify_user(case when off.made_by_seller then it.seller_id else off.buyer_id end, 'offer_declined',
      jsonb_build_object('offer_id', p_offer, 'item_id', off.item_id));
    return jsonb_build_object('action', 'declined', 'offer_id', p_offer);
  end if;

  if p_action = 'accept' then
    if it.status <> 'active' then
      raise exception 'item_unavailable' using errcode = 'P0001';
    end if;
    perform public.assert_can_buy(off.buyer_id, it.seller_id, off.amount_cents);
    update public.offers set status = 'accepted', responded_at = now() where id = p_offer;
    new_order := public.create_order(off.item_id, off.buyer_id, p_offer, off.amount_cents);
    perform public.notify_user(case when off.made_by_seller then it.seller_id else off.buyer_id end, 'offer_accepted',
      jsonb_build_object('offer_id', p_offer, 'order_id', new_order));
    return jsonb_build_object('action', 'accepted', 'order_id', new_order);
  end if;

  -- Counter: only a seller can counter, and only a buyer's own offer.
  if off.made_by_seller then
    raise exception 'cannot_counter_a_counter' using errcode = 'P0001';
  end if;
  if it.status <> 'active' then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;
  if p_counter_cents is null or p_counter_cents % 100 <> 0
     or p_counter_cents <= off.amount_cents or p_counter_cents > it.price_cents
     or p_counter_cents < (it.price_cents * min_pct + 99) / 100 then
    raise exception 'invalid_counter_amount' using errcode = 'P0001';
  end if;

  update public.offers set status = 'countered', responded_at = now() where id = p_offer;
  insert into public.offers (item_id, buyer_id, amount_cents, parent_offer_id, made_by_seller, expires_at)
  values (off.item_id, off.buyer_id, p_counter_cents, p_offer, true,
          now() + make_interval(hours => public.config_bigint('offer_expiry_hours', 24)::integer))
  returning id into new_offer;
  perform public.notify_user(off.buyer_id, 'offer_countered', jsonb_build_object('offer_id', new_offer, 'item_id', off.item_id, 'amount_cents', p_counter_cents));
  return jsonb_build_object('action', 'countered', 'offer_id', new_offer);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------------------------

-- Buy at the listed price. Spot and time may be proposed now or later with propose_meetup.
create or replace function public.buy_now(p_item uuid, p_spot integer default null, p_meetup_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
  new_order uuid;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select * into it from public.items where id = p_item;
  if not found or it.status <> 'active' then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;
  perform public.assert_can_buy(me, it.seller_id, it.price_cents);
  if p_spot is not null then
    perform public.assert_valid_meetup(p_item, p_spot, p_meetup_at, now());
  end if;

  new_order := public.create_order(p_item, me, null, it.price_cents);

  if p_spot is not null then
    update public.orders set meetup_spot_id = p_spot, meetup_at = p_meetup_at where id = new_order;
    perform public.log_order_event(new_order, me, 'meetup_proposed', jsonb_build_object('spot_id', p_spot, 'at', p_meetup_at));
    perform public.notify_user(it.seller_id, 'meetup_requested', jsonb_build_object('order_id', new_order));
  end if;
  return new_order;
end;
$$;

create or replace function public.propose_meetup(p_order uuid, p_spot integer, p_meetup_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or ord.buyer_id is distinct from me then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'awaiting_meetup' or ord.meetup_confirmed_at is not null then
    raise exception 'meetup_already_confirmed' using errcode = 'P0001';
  end if;
  perform public.assert_active_member(me);
  perform public.assert_valid_meetup(ord.item_id, p_spot, p_meetup_at, ord.created_at);

  update public.orders
    set meetup_spot_id = p_spot, meetup_at = p_meetup_at, confirm_by = now() + interval '24 hours'
    where id = p_order;
  perform public.log_order_event(p_order, me, 'meetup_proposed', jsonb_build_object('spot_id', p_spot, 'at', p_meetup_at));
  perform public.notify_user(ord.seller_id, 'meetup_requested', jsonb_build_object('order_id', p_order));
end;
$$;

-- Seller confirms the proposed spot and time. This creates the code the buyer will show.
create or replace function public.confirm_meetup(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
  new_code text;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or ord.seller_id is distinct from me then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'awaiting_meetup' then
    raise exception 'order_not_open' using errcode = 'P0001';
  end if;
  if ord.meetup_at is null then
    raise exception 'no_meetup_proposed' using errcode = 'P0001';
  end if;
  if ord.meetup_confirmed_at is not null then
    return;
  end if;
  if ord.meetup_at <= now() then
    raise exception 'meetup_time_passed' using errcode = 'P0001';
  end if;
  perform public.assert_active_member(me);

  new_code := lpad((((('x' || left(replace(gen_random_uuid()::text, '-', ''), 8))::bit(32)::bigint) % 900000) + 100000)::text, 6, '0');
  insert into public.order_meetup_codes (order_id, code) values (p_order, new_code) on conflict (order_id) do nothing;

  update public.orders
    set meetup_confirmed_at = now(), confirm_by = meetup_at + interval '24 hours'
    where id = p_order;
  perform public.log_order_event(p_order, me, 'meetup_confirmed');
  perform public.notify_user(ord.buyer_id, 'meetup_confirmed', jsonb_build_object('order_id', p_order));
end;
$$;

-- The buyer reads the code. Nobody else can. It only works within the validity window.
create or replace function public.get_meetup_code(p_order uuid)
returns table (code text, valid_from timestamptz, valid_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.code, o.meetup_at - interval '1 hour', o.meetup_at + interval '24 hours'
  from public.orders o
  join public.order_meetup_codes c on c.order_id = o.id
  where o.id = p_order
    and o.buyer_id = (select auth.uid())
    and o.status = 'awaiting_meetup'
    and o.meetup_confirmed_at is not null
$$;

-- The seller enters the code the buyer read out. Wrong entries are counted and persist, which is
-- why this returns a result instead of raising. Five wrong entries lock the order for support.
create or replace function public.complete_meetup(p_order uuid, p_code text)
returns table (result text, attempts_left integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
  expected text;
  max_attempts integer := public.config_bigint('meetup_code_attempt_limit', 5)::integer;
  before_min integer := public.config_bigint('meetup_code_valid_from_minutes_before', 60)::integer;
  after_hours integer := public.config_bigint('meetup_code_valid_until_hours_after', 24)::integer;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or ord.seller_id is distinct from me then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'awaiting_meetup' or ord.meetup_confirmed_at is null then
    raise exception 'order_not_ready' using errcode = 'P0001';
  end if;

  if ord.code_attempts >= max_attempts then
    return query select 'locked'::text, 0;
    return;
  end if;
  if now() < ord.meetup_at - make_interval(mins => before_min) or now() > ord.meetup_at + make_interval(hours => after_hours) then
    return query select 'outside_window'::text, max_attempts - ord.code_attempts;
    return;
  end if;

  select c.code into expected from public.order_meetup_codes c where c.order_id = p_order;
  if expected is not null and p_code is not null and p_code = expected then
    update public.orders set status = 'completed', completed_at = now() where id = p_order;
    if ord.item_id is not null then
      update public.items set status = 'sold', sold_at = now() where id = ord.item_id;
    end if;
    perform public.log_order_event(p_order, me, 'code_entered');
    perform public.log_order_event(p_order, me, 'completed');
    perform public.notify_user(ord.buyer_id, 'order_completed', jsonb_build_object('order_id', p_order));
    perform public.notify_user(ord.seller_id, 'order_completed', jsonb_build_object('order_id', p_order));
    return query select 'completed'::text, max_attempts - ord.code_attempts;
    return;
  end if;

  update public.orders set code_attempts = code_attempts + 1 where id = p_order;
  perform public.log_order_event(p_order, me, 'code_wrong', jsonb_build_object('attempt', ord.code_attempts + 1));

  if ord.code_attempts + 1 >= max_attempts then
    perform public.log_order_event(p_order, me, 'code_locked');
    insert into public.notifications (user_id, kind, payload)
    select u.id, 'code_locked', jsonb_build_object('order_id', p_order)
    from public.users u where u.role in ('moderator', 'admin') and u.status = 'active';
    return query select 'locked'::text, 0;
  else
    return query select 'wrong_code'::text, max_attempts - (ord.code_attempts + 1);
  end if;
end;
$$;

-- Cancel an order. reason is one of: buyer_cancelled, seller_cancelled, item_damaged_or_lost, agreement.
create or replace function public.cancel_order(p_order uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
  other uuid;
  agreed boolean;
  struck boolean := false;
begin
  if p_reason not in ('buyer_cancelled', 'seller_cancelled', 'item_damaged_or_lost', 'agreement') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  select * into ord from public.orders where id = p_order for update;
  if not found or me is null or me not in (ord.buyer_id, ord.seller_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'awaiting_meetup' then
    raise exception 'order_not_open' using errcode = 'P0001';
  end if;
  other := case when me = ord.buyer_id then ord.seller_id else ord.buyer_id end;

  if p_reason = 'agreement' then
    -- First tap records the request. When the other person has already asked, cancel for free.
    select exists (
      select 1 from public.order_events e
      where e.order_id = p_order and e.event = 'cancel_agreement_requested' and e.actor_id = other
        and e.created_at > now() - interval '48 hours'
    ) into agreed;
    if not agreed then
      if not exists (select 1 from public.order_events e where e.order_id = p_order and e.event = 'cancel_agreement_requested' and e.actor_id = me and e.created_at > now() - interval '48 hours') then
        perform public.log_order_event(p_order, me, 'cancel_agreement_requested');
        perform public.notify_user(other, 'cancel_agreement_requested', jsonb_build_object('order_id', p_order));
      end if;
      return jsonb_build_object('status', 'requested');
    end if;
    perform public.finish_cancel(p_order, me, 'agreement', case when me = ord.buyer_id then 'buyer' else 'seller' end);
    return jsonb_build_object('status', 'cancelled');
  end if;

  if me = ord.buyer_id then
    if p_reason <> 'buyer_cancelled' then
      raise exception 'invalid_reason' using errcode = 'P0001';
    end if;
    if ord.meetup_confirmed_at is not null and ord.meetup_at - interval '2 hours' < now() then
      raise exception 'too_late_to_cancel' using errcode = 'P0001';
    end if;
    perform public.finish_cancel(p_order, me, 'buyer_cancelled', 'buyer');
    return jsonb_build_object('status', 'cancelled', 'strike', false);
  end if;

  -- Seller. Cancelling after agreeing to the trade earns a strike, unless the item was damaged or
  -- lost and the seller says so before the meet-up. Turning down a buy-now request that was never
  -- confirmed is not a strike.
  if p_reason not in ('seller_cancelled', 'item_damaged_or_lost') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;
  if p_reason = 'item_damaged_or_lost' and ord.meetup_at is not null and ord.meetup_at <= now() then
    raise exception 'too_late_to_report_damage' using errcode = 'P0001';
  end if;
  if p_reason = 'seller_cancelled' and (ord.offer_id is not null or ord.meetup_confirmed_at is not null) then
    perform public.issue_strike(me, 'seller_cancel', p_order);
    struck := true;
  end if;
  perform public.finish_cancel(p_order, me, p_reason, 'seller', p_reason = 'item_damaged_or_lost');
  return jsonb_build_object('status', 'cancelled', 'strike', struck);
end;
$$;

-- "They didn't show." Allowed from 30 minutes after the meet-up time.
create or replace function public.report_no_show(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
  other uuid;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or me is null or me not in (ord.buyer_id, ord.seller_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'awaiting_meetup' or ord.meetup_confirmed_at is null then
    raise exception 'order_not_open' using errcode = 'P0001';
  end if;
  if now() < ord.meetup_at + interval '30 minutes' then
    raise exception 'too_early_to_report' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.order_events e where e.order_id = p_order and e.event = 'no_show_reported' and e.actor_id = me) then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;

  other := case when me = ord.buyer_id then ord.seller_id else ord.buyer_id end;
  perform public.log_order_event(p_order, me, 'no_show_reported', jsonb_build_object('accused', other));
  perform public.notify_user(other, 'no_show_reported', jsonb_build_object('order_id', p_order));
end;
$$;

-- The accused says they were there. A moderator then decides from the chat history.
create or replace function public.dispute_no_show(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or me is null or me not in (ord.buyer_id, ord.seller_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'awaiting_meetup' or not exists (
    select 1 from public.order_events e where e.order_id = p_order and e.event = 'no_show_reported' and e.actor_id <> me
  ) then
    raise exception 'no_report_to_dispute' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.order_events e where e.order_id = p_order and e.event = 'no_show_disputed') then
    return;
  end if;

  perform public.log_order_event(p_order, me, 'no_show_disputed');
  insert into public.notifications (user_id, kind, payload)
  select u.id, 'no_show_disputed', jsonb_build_object('order_id', p_order)
  from public.users u where u.role in ('moderator', 'admin') and u.status = 'active';
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Timers. Run every few minutes by pg_cron, or by a scheduled function.
-- ---------------------------------------------------------------------------------------------

create or replace function public.process_order_timers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  expired_offers integer;
  cancelled integer := 0;
  struck integer := 0;
begin
  update public.offers set status = 'expired', responded_at = now() where status = 'open' and expires_at <= now();
  get diagnostics expired_offers = row_count;

  -- Nobody proposed a meet-up in time, or the seller did not confirm in time: cancel, no strike.
  for rec in
    select o.id, o.meetup_at from public.orders o
    where o.status = 'awaiting_meetup' and o.meetup_confirmed_at is null and o.confirm_by < now()
  loop
    perform public.finish_cancel(rec.id, null, case when rec.meetup_at is null then 'no_meetup_proposed' else 'seller_did_not_confirm' end, 'system');
    cancelled := cancelled + 1;
  end loop;

  -- A reported no-show nobody disputed within 24 hours: cancel and strike the absent person.
  for rec in
    select o.id, (e.data ->> 'accused')::uuid as accused
    from public.orders o
    join public.order_events e on e.order_id = o.id and e.event = 'no_show_reported'
    where o.status = 'awaiting_meetup'
      and e.created_at < now() - interval '24 hours'
      and not exists (select 1 from public.order_events d where d.order_id = o.id and d.event = 'no_show_disputed')
  loop
    perform public.issue_strike(rec.accused, 'no_show', rec.id);
    perform public.finish_cancel(rec.id, null, 'no_show', 'system');
    struck := struck + 1;
    cancelled := cancelled + 1;
  end loop;

  -- Confirmed but never completed, 24 hours after the meet-up: cancel without a strike. Nobody
  -- reported a problem, so there is no fault to assign.
  for rec in
    select o.id from public.orders o
    where o.status = 'awaiting_meetup' and o.meetup_confirmed_at is not null
      and o.meetup_at + interval '24 hours' < now()
      and not exists (select 1 from public.order_events e where e.order_id = o.id and e.event in ('no_show_reported', 'no_show_disputed'))
  loop
    perform public.finish_cancel(rec.id, null, 'meetup_expired', 'system');
    cancelled := cancelled + 1;
  end loop;

  return jsonb_build_object('offers_expired', expired_offers, 'orders_cancelled', cancelled, 'strikes_issued', struck);
end;
$$;

revoke all on function public.process_order_timers() from public, anon, authenticated;

-- Client-callable functions: signed-in users only.
revoke all on function
  public.make_offer(uuid, bigint),
  public.withdraw_offer(uuid),
  public.respond_to_offer(uuid, text, bigint),
  public.buy_now(uuid, integer, timestamptz),
  public.propose_meetup(uuid, integer, timestamptz),
  public.confirm_meetup(uuid),
  public.get_meetup_code(uuid),
  public.complete_meetup(uuid, text),
  public.cancel_order(uuid, text),
  public.report_no_show(uuid),
  public.dispute_no_show(uuid)
from public, anon;
grant execute on function
  public.make_offer(uuid, bigint),
  public.withdraw_offer(uuid),
  public.respond_to_offer(uuid, text, bigint),
  public.buy_now(uuid, integer, timestamptz),
  public.propose_meetup(uuid, integer, timestamptz),
  public.confirm_meetup(uuid),
  public.get_meetup_code(uuid),
  public.complete_meetup(uuid, text),
  public.cancel_order(uuid, text),
  public.report_no_show(uuid),
  public.dispute_no_show(uuid)
to authenticated;

-- Schedule the timers every five minutes where pg_cron is available (Supabase has it). When it is
-- not, call public.process_order_timers() from a scheduled function instead.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rehang-order-timers', '*/5 * * * *', 'select public.process_order_timers()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;
