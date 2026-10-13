-- Seller tools: mark sold, remove, relist, and tell people who saved an item when its price drops.

alter table public.items add column if not exists removed_reason text check (removed_reason is null or removed_reason in ('seller'));

-- True when an order for this item is still in progress.
create or replace function public.item_has_open_order(p_item uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.orders o where o.item_id = p_item and o.status in ('awaiting_meetup', 'paid_held', 'shipped', 'delivered', 'disputed'))
$$;
revoke all on function public.item_has_open_order(uuid) from public, anon, authenticated;

create or replace function public.mark_item_sold(p_item uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
begin
  if me is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select * into it from public.items where id = p_item and seller_id = me for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if it.status <> 'active' then raise exception 'item_not_publishable' using errcode = 'P0001'; end if;
  if public.item_has_open_order(p_item) then raise exception 'item_has_open_order' using errcode = 'P0001'; end if;
  update public.offers set status = 'declined' where item_id = p_item and status = 'open';
  update public.items set status = 'sold' where id = p_item;
end;
$$;

create or replace function public.remove_my_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
begin
  if me is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select * into it from public.items where id = p_item and seller_id = me for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if it.status not in ('draft', 'awaiting_verification', 'active') then raise exception 'item_not_publishable' using errcode = 'P0001'; end if;
  if public.item_has_open_order(p_item) then raise exception 'item_has_open_order' using errcode = 'P0001'; end if;
  update public.offers set status = 'declined' where item_id = p_item and status = 'open';
  update public.items set status = 'removed', removed_reason = 'seller' where id = p_item;
end;
$$;

-- Put a removed listing, or one sold outside Rehang, back on sale. Items removed by moderators stay removed.
create or replace function public.relist_item(p_item uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
  seller public.users%rowtype;
  new_status public.item_status;
begin
  if me is null then raise exception 'not_signed_in' using errcode = 'P0001'; end if;
  select * into it from public.items where id = p_item and seller_id = me for update;
  if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  if not ((it.status = 'removed' and it.removed_reason is not distinct from 'seller')
          or (it.status = 'sold' and not exists (select 1 from public.orders o where o.item_id = p_item and o.status = 'completed'))) then
    raise exception 'cannot_relist' using errcode = 'P0001';
  end if;
  select * into seller from public.users where id = me;
  if seller.status <> 'active' then raise exception 'account_not_active' using errcode = 'P0001'; end if;
  new_status := case when seller.verification_level = 'level2' then 'active'::public.item_status else 'awaiting_verification'::public.item_status end;
  update public.items
  set status = new_status, removed_reason = null,
      published_at = case when new_status = 'active' then now() else published_at end
  where id = p_item;
  return new_status::text;
end;
$$;

revoke all on function public.mark_item_sold(uuid), public.remove_my_item(uuid), public.relist_item(uuid) from public, anon;
grant execute on function public.mark_item_sold(uuid), public.remove_my_item(uuid), public.relist_item(uuid) to authenticated;

-- Price drops of at least 5 percent tell everyone who saved the item.
create or replace function public.notify_price_drop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and new.price_cents <= old.price_cents * 0.95 then
    insert into public.notifications (user_id, kind, payload)
    select f.user_id, 'price_drop',
           jsonb_build_object('item_id', new.id, 'title', new.title, 'old_cents', old.price_cents, 'new_cents', new.price_cents)
    from public.favourites f
    where f.item_id = new.id and f.user_id <> new.seller_id;
  end if;
  return new;
end;
$$;
revoke all on function public.notify_price_drop() from public, anon, authenticated;

drop trigger if exists items_notify_price_drop on public.items;
create trigger items_notify_price_drop
after update of price_cents on public.items
for each row
when (old.price_cents is distinct from new.price_cents)
execute function public.notify_price_drop();

create or replace function public.reject_reserved_handle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.handle in (
    'admin', 'api', 'app', 'auth', 'browse', 'inbox', 'item', 'login', 'logout', 'onboarding',
    'orders', 'privacy', 'rehang', 'saved', 'search', 'sell', 'settings', 'shop', 'support',
    'terms', 'help', 'about', 'offers', 'following', 'moderator', 'mod', 'signup', 'forgot-password',
    'reset-password', 'verify', 'notifications', 'account', 'spots', 'my-listings', 'join', 'invite',
    'manifest', 'sw', 'offline', 'waitlist'
  ) and new.handle !~ '^user_[0-9a-f]+$' then
    raise exception using errcode = '23514', message = 'that handle is reserved';
  end if;
  return new;
end;
$$;
