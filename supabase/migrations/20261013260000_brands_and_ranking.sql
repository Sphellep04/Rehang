-- Brand filter, "trusted sellers first" sort, and a price-far-below-normal flag.

-- 1. Brands. Sellers type a brand freely; known names are linked to the brands table so people can filter by them.
insert into public.brands (name, slug, is_verified_brand) values
  ('Nike', 'nike', true), ('Adidas', 'adidas', true), ('Puma', 'puma', true), ('New Balance', 'new-balance', true),
  ('Converse', 'converse', true), ('Vans', 'vans', true), ('Under Armour', 'under-armour', true), ('Fila', 'fila', true),
  ('Levi''s', 'levis', true), ('Tommy Hilfiger', 'tommy-hilfiger', true), ('Calvin Klein', 'calvin-klein', true),
  ('Ralph Lauren', 'ralph-lauren', true), ('Lacoste', 'lacoste', true), ('Guess', 'guess', true), ('The North Face', 'the-north-face', true),
  ('Zara', 'zara', false), ('H&M', 'h-and-m', false), ('Cotton On', 'cotton-on', false), ('Gap', 'gap', false), ('Mango', 'mango', false),
  ('Woolworths', 'woolworths', false), ('Mr Price', 'mr-price', false), ('Edgars', 'edgars', false), ('Truworths', 'truworths', false),
  ('Foschini', 'foschini', false), ('Markham', 'markham', false), ('Jet', 'jet', false), ('Pep', 'pep', false), ('Ackermans', 'ackermans', false),
  ('Exact', 'exact', false), ('Identity', 'identity', false), ('Studio W', 'studio-w', false), ('Sportscene', 'sportscene', false),
  ('Jeep', 'jeep', false), ('Pierre Cardin', 'pierre-cardin', false), ('Shein', 'shein', false), ('Fashion Nova', 'fashion-nova', false),
  ('Superdry', 'superdry', false), ('Billabong', 'billabong', false), ('Quiksilver', 'quiksilver', false), ('Hurley', 'hurley', false)
on conflict (slug) do nothing;

-- The first schema allowed either a linked brand or free text. Now the text a seller typed is always kept, and a link is added when it matches.
alter table public.items drop constraint if exists items_check;

create or replace function public.normalise_brand(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$ select regexp_replace(lower(replace(coalesce(p_text, ''), '&', 'and')), '[^a-z0-9]', '', 'g') $$;

create or replace function public.link_item_brand()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.brand_text is null or btrim(new.brand_text) = '' then
    new.brand_id := null;
  else
    select b.id into new.brand_id from public.brands b
    where public.normalise_brand(b.name) = public.normalise_brand(new.brand_text) or b.slug = lower(btrim(new.brand_text))
    limit 1;
  end if;
  return new;
end;
$$;
revoke all on function public.link_item_brand() from public, anon, authenticated;
drop trigger if exists items_link_brand on public.items;
create trigger items_link_brand before insert or update of brand_text on public.items for each row execute function public.link_item_brand();

update public.items set brand_text = brand_text where brand_text is not null;
create index if not exists items_brand_idx on public.items (brand_id) where brand_id is not null;

-- 2. Trusted sellers first. A copy of the seller's trusted flag sits on each item so search can sort and filter on it.
alter table public.items add column if not exists seller_trusted boolean not null default false;
grant select (seller_trusted) on public.items to anon, authenticated;

create or replace function public.copy_seller_trust()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.seller_trusted := coalesce((select u.is_trusted_seller from public.users u where u.id = new.seller_id), false);
  return new;
end;
$$;
revoke all on function public.copy_seller_trust() from public, anon, authenticated;
drop trigger if exists items_copy_trust on public.items;
create trigger items_copy_trust before insert on public.items for each row execute function public.copy_seller_trust();

create or replace function public.spread_seller_trust()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.items set seller_trusted = new.is_trusted_seller where seller_id = new.id and seller_trusted is distinct from new.is_trusted_seller;
  return new;
end;
$$;
revoke all on function public.spread_seller_trust() from public, anon, authenticated;
drop trigger if exists users_spread_trust on public.users;
create trigger users_spread_trust after update of is_trusted_seller on public.users for each row when (old.is_trusted_seller is distinct from new.is_trusted_seller) execute function public.spread_seller_trust();

update public.items i set seller_trusted = true from public.users u where u.id = i.seller_id and u.is_trusted_seller and not i.seller_trusted;
create index if not exists items_trusted_feed_idx on public.items (status, seller_trusted desc, published_at desc);

-- 3. Price far below normal. Compares with other listings of the same brand and category (needs five or more).
-- It only raises a flag for a moderator. It never stops or hides a listing.
alter table public.item_flags drop constraint if exists item_flags_reason_check;
alter table public.item_flags add constraint item_flags_reason_check check (reason in ('duplicate_photo', 'brand_check', 'price_low'));

create or replace function public.flag_low_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  comparables integer;
  middle numeric;
begin
  if new.brand_id is null then
    return new;
  end if;
  select count(*), percentile_cont(0.5) within group (order by o.price_cents)
    into comparables, middle
  from public.items o
  where o.brand_id = new.brand_id and o.category_id = new.category_id and o.id <> new.id
    and o.status in ('active'::public.item_status, 'sold'::public.item_status) and o.price_cents > 0;
  if comparables >= 5 and new.price_cents < middle * 0.25 then
    insert into public.item_flags (item_id, reason) values (new.id, 'price_low') on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.flag_low_price() from public, anon, authenticated;
drop trigger if exists items_flag_low_price on public.items;
create trigger items_flag_low_price after update of status on public.items
  for each row when (new.status = 'active'::public.item_status and old.status is distinct from new.status) execute function public.flag_low_price();
