-- Discovery: prefix search, public shop statistics, favourite counts and reserved shop handles.

-- Fix: the public read policies on items, item_photos, item_promotions and shops were written
-- "to anon, authenticated" but call current_user_role(), which anonymous users may not execute.
-- Every logged-out read of those tables failed with "permission denied for function
-- current_user_role". Each policy is split in two: a public one for everyone that never touches
-- the role helper, and an owner or moderator one for signed-in users only.
drop policy items_read_public_or_owner on public.items;
create policy items_read_public on public.items for select to anon, authenticated
using (
  status in ('active'::public.item_status, 'reserved'::public.item_status, 'sold'::public.item_status)
  and not (select public.users_blocked_pair((select auth.uid()), seller_id))
);
create policy items_read_owner_or_moderator on public.items for select to authenticated
using (
  seller_id = (select auth.uid())
  or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role)
);

drop policy item_photos_read_parent on public.item_photos;
create policy item_photos_read_public on public.item_photos for select to anon, authenticated
using (
  exists (
    select 1 from public.items i
    where i.id = item_id
      and i.status in ('active'::public.item_status, 'reserved'::public.item_status, 'sold'::public.item_status)
  )
);
create policy item_photos_read_owner_or_moderator on public.item_photos for select to authenticated
using (
  exists (select 1 from public.items i where i.id = item_id and i.seller_id = (select auth.uid()))
  or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role)
);

drop policy item_promotions_read_active_or_seller on public.item_promotions;
create policy item_promotions_read_active on public.item_promotions for select to anon, authenticated
using (status = 'active' and now() between starts_at and ends_at);
create policy item_promotions_read_seller_or_moderator on public.item_promotions for select to authenticated
using (seller_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));

drop policy shops_read_active_or_owner on public.shops;
create policy shops_read_active on public.shops for select to anon, authenticated using (active);
create policy shops_read_owner_or_moderator on public.shops for select to authenticated
using (owner_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));

-- Prefix search over the generated tsvector. SECURITY INVOKER so item RLS still applies,
-- which keeps blocked sellers and non-public statuses out of results.
create or replace function public.items_search(p_query text)
returns setof public.items
language sql
stable
security invoker
set search_path = ''
as $$
  with terms as (
    select string_agg(word || ':*', ' & ') as tsq
    from (
      select lower(w) as word
      from regexp_split_to_table(
        regexp_replace(coalesce(left(p_query, 80), ''), '[^[:alnum:][:space:]]', ' ', 'g'),
        '\s+'
      ) as w
      where char_length(w) > 0
      limit 6
    ) as cleaned
  )
  select i.*
  from public.items as i, terms
  where terms.tsq is not null
    and i.search @@ to_tsquery('simple'::regconfig, terms.tsq)
$$;

revoke all on function public.items_search(text) from public;
grant execute on function public.items_search(text) to anon, authenticated;

-- Public shop numbers. Counts only, no private data.
create or replace function public.shop_stats(p_seller uuid)
returns table (follower_count bigint, active_count bigint, sold_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.follows f where f.seller_id = p_seller),
    (select count(*) from public.items i where i.seller_id = p_seller and i.status = 'active'::public.item_status),
    (select count(*) from public.items i where i.seller_id = p_seller and i.status = 'sold'::public.item_status)
  where exists (select 1 from public.users u where u.id = p_seller and u.status = 'active')
$$;

revoke all on function public.shop_stats(uuid) from public;
grant execute on function public.shop_stats(uuid) to anon, authenticated;

-- Number of people who saved an item. Only for items the caller could already see.
create or replace function public.item_favourite_count(p_item uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)
  from public.favourites f
  where f.item_id = p_item
    and exists (
      select 1 from public.items i
      where i.id = p_item
        and i.status in ('active'::public.item_status, 'reserved'::public.item_status, 'sold'::public.item_status)
    )
$$;

revoke all on function public.item_favourite_count(uuid) from public;
grant execute on function public.item_favourite_count(uuid) to anon, authenticated;

-- Speeds up shop pages and the saved list.
create index if not exists items_seller_published_idx
  on public.items (seller_id, status, published_at desc);
create index if not exists favourites_user_created_idx
  on public.favourites (user_id, created_at desc);
create index if not exists follows_seller_idx
  on public.follows (seller_id);

-- Shop handles become URLs (/handle), so they must never collide with app routes.
create or replace function public.reject_reserved_handle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.handle in (
    'admin', 'api', 'app', 'auth', 'browse', 'inbox', 'item', 'login', 'logout', 'onboarding',
    'orders', 'privacy', 'rehang', 'saved', 'search', 'sell', 'settings', 'shop', 'support',
    'terms', 'help', 'about', 'offers', 'following', 'moderator', 'mod'
  ) and new.handle !~ '^user_[0-9a-f]+$' then
    raise exception using errcode = '23514', message = 'that handle is reserved';
  end if;
  return new;
end;
$$;

drop trigger if exists users_reject_reserved_handle on public.users;
create trigger users_reject_reserved_handle
before insert or update of handle on public.users
for each row execute function public.reject_reserved_handle();
