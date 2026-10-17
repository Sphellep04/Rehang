-- Bundles: buy 3 or more items from one seller and save a set percentage. Meet-up only. Off until
-- bundles_enabled is true. A bundle is one order covering several items; when it completes every
-- item is sold, and when it is cancelled every item goes back on sale.

insert into public.app_config (key, value) values
  ('bundle_discount_percent', '10'::jsonb),
  ('bundle_min_items', '3'::jsonb)
on conflict (key) do nothing;

-- A bundle order has no single item, so the town check looks at its first item.
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
  perform public.assert_valid_meetup(coalesce(ord.item_id, (select bi.item_id from public.bundle_offer_items bi where bi.bundle_offer_id = ord.bundle_offer_id limit 1)), p_spot, p_meetup_at, ord.created_at);

  update public.orders
    set meetup_spot_id = p_spot, meetup_at = p_meetup_at, confirm_by = now() + interval '24 hours'
    where id = p_order;
  perform public.log_order_event(p_order, me, 'meetup_proposed', jsonb_build_object('spot_id', p_spot, 'at', p_meetup_at));
  perform public.notify_user(ord.seller_id, 'meetup_requested', jsonb_build_object('order_id', p_order));
end;
$$;

create or replace function public.create_bundle(p_items uuid[], p_spot integer default null, p_meetup_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ids uuid[];
  seller uuid;
  n integer;
  min_items integer := public.config_bigint('bundle_min_items', 3)::integer;
  pct integer := public.config_bigint('bundle_discount_percent', 10)::integer;
  total bigint;
  discounted bigint;
  allocated bigint := 0;
  share bigint;
  rec record;
  seen integer := 0;
  new_bundle uuid;
  new_order uuid;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not public.config_flag('bundles_enabled') then
    raise exception 'bundles_off' using errcode = 'P0001';
  end if;
  select array_agg(distinct x order by x) into ids from unnest(coalesce(p_items, '{}'::uuid[])) as x;
  n := coalesce(array_length(ids, 1), 0);
  if n < min_items or n > 10 then
    raise exception 'bundle_size' using errcode = 'P0001';
  end if;

  perform 1 from public.items where id = any (ids) order by id for update;
  select count(distinct i.seller_id), min(i.seller_id::text)::uuid, coalesce(sum(i.price_cents), 0)
    into seen, seller, total
    from public.items i where i.id = any (ids) and i.status = 'active';
  if (select count(*) from public.items i where i.id = any (ids) and i.status = 'active') <> n then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;
  if seen <> 1 then
    raise exception 'bundle_one_seller' using errcode = 'P0001';
  end if;

  discounted := total - (total * pct) / 100;
  perform public.assert_can_buy(me, seller, discounted);
  if p_spot is not null then
    perform public.assert_valid_meetup(ids[1], p_spot, p_meetup_at, now());
  end if;

  insert into public.bundle_offers (seller_id, buyer_id, amount_cents, status) values (seller, me, discounted, 'accepted') returning id into new_bundle;
  for rec in select i.id, i.price_cents from public.items i where i.id = any (ids) order by i.id loop
    n := n - 1;
    share := case when n = 0 then discounted - allocated else (discounted * rec.price_cents) / total end;
    allocated := allocated + share;
    insert into public.bundle_offer_items (bundle_offer_id, item_id, amount_cents) values (new_bundle, rec.id, share);
  end loop;

  insert into public.orders (bundle_offer_id, buyer_id, seller_id, amount_cents, commission_cents, status, delivery_method, confirm_by)
  values (new_bundle, me, seller, discounted, (discounted * public.config_bigint('commission_bps', 0)) / 10000, 'awaiting_meetup', 'meetup', now() + interval '24 hours')
  returning id into new_order;

  update public.items set status = 'reserved' where id = any (ids);
  update public.offers set status = 'declined', responded_at = now() where item_id = any (ids) and status = 'open';

  perform public.log_order_event(new_order, me, 'created', jsonb_build_object('amount_cents', discounted, 'bundle_items', array_length(ids, 1), 'discount_percent', pct));
  perform public.notify_user(seller, 'order_created', jsonb_build_object('order_id', new_order));
  perform public.notify_user(me, 'order_created', jsonb_build_object('order_id', new_order));
  if p_spot is not null then
    update public.orders set meetup_spot_id = p_spot, meetup_at = p_meetup_at where id = new_order;
    perform public.log_order_event(new_order, me, 'meetup_proposed', jsonb_build_object('spot_id', p_spot, 'at', p_meetup_at));
    perform public.notify_user(seller, 'meetup_requested', jsonb_build_object('order_id', new_order));
  end if;
  return new_order;
end;
$$;

-- Sold when a bundle order completes, back on sale when it is cancelled. Covers every path that ends an order.
create or replace function public.orders_bundle_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.bundle_offer_id is null or new.status = old.status then
    return new;
  end if;
  if new.status = 'completed' then
    update public.items set status = 'sold', sold_at = now() where id in (select item_id from public.bundle_offer_items where bundle_offer_id = new.bundle_offer_id);
  elsif new.status = 'cancelled' then
    update public.items set status = 'active' where status = 'reserved' and id in (select item_id from public.bundle_offer_items where bundle_offer_id = new.bundle_offer_id);
  end if;
  return new;
end;
$$;
drop trigger if exists orders_bundle_items on public.orders;
create trigger orders_bundle_items after update of status on public.orders for each row execute function public.orders_bundle_items();

-- Titles and amounts of a bundle's items, for the people in the order.
create or replace function public.bundle_order_items(p_order uuid)
returns table (item_id uuid, title text, amount_cents bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select bi.item_id, i.title, bi.amount_cents
  from public.orders o
  join public.bundle_offer_items bi on bi.bundle_offer_id = o.bundle_offer_id
  join public.items i on i.id = bi.item_id
  where o.id = p_order and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()))
  order by i.title
$$;

revoke all on function public.orders_bundle_items() from public, anon, authenticated;
revoke all on function public.create_bundle(uuid[], integer, timestamptz), public.bundle_order_items(uuid) from public, anon;
grant execute on function public.create_bundle(uuid[], integer, timestamptz), public.bundle_order_items(uuid) to authenticated;
