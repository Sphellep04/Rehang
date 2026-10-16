-- Phase 2, part 1 (needs no payment partner): price suggestions and seller stats.

-- 1. Price suggestion. Only ever returns a summary of five or more similar listings, never single items.
-- Similar means the same category and condition, and the same brand when the seller names a known one.
-- It looks at the last 180 days of live and sold listings. Prices are in cents.
create or replace function public.price_suggestion(p_category integer, p_condition text, p_brand text default null)
returns table (low_cents integer, middle_cents integer, high_cents integer, sample_size integer, same_brand boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  brand_ref integer;
  cond public.item_condition;
begin
  if (select auth.uid()) is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  begin
    cond := p_condition::public.item_condition;
  exception when invalid_text_representation then
    return;
  end;
  if p_brand is not null and btrim(p_brand) <> '' then
    select b.id into brand_ref from public.brands b
    where public.normalise_brand(b.name) = public.normalise_brand(p_brand) or b.slug = lower(btrim(p_brand)) limit 1;
  end if;

  -- First choice: the same brand. Otherwise the whole category.
  if brand_ref is not null then
    return query
    select round(percentile_cont(0.25) within group (order by i.price_cents))::integer,
           round(percentile_cont(0.5) within group (order by i.price_cents))::integer,
           round(percentile_cont(0.75) within group (order by i.price_cents))::integer,
           count(*)::integer, true
    from public.items i
    where i.category_id = p_category and i.condition = cond and i.brand_id = brand_ref
      and i.status in ('active'::public.item_status, 'sold'::public.item_status)
      and coalesce(i.published_at, i.created_at) > now() - interval '180 days'
    having count(*) >= 5;
    if found then
      return;
    end if;
  end if;

  return query
  select round(percentile_cont(0.25) within group (order by i.price_cents))::integer,
         round(percentile_cont(0.5) within group (order by i.price_cents))::integer,
         round(percentile_cont(0.75) within group (order by i.price_cents))::integer,
         count(*)::integer, false
  from public.items i
  where i.category_id = p_category and i.condition = cond
    and i.status in ('active'::public.item_status, 'sold'::public.item_status)
    and coalesce(i.published_at, i.created_at) > now() - interval '180 days'
  having count(*) >= 5;
end;
$$;
revoke all on function public.price_suggestion(integer, text, text) from public, anon;
grant execute on function public.price_suggestion(integer, text, text) to authenticated;

-- 2. Item views. A daily counter per item. No viewer is recorded, so there is nothing personal to leak or delete.
create table if not exists public.item_views (
  item_id uuid not null references public.items (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  primary key (item_id, day)
);
alter table public.item_views enable row level security;
revoke all on public.item_views from anon, authenticated;

-- Counts one view of a live item. A seller looking at their own item is not counted.
create or replace function public.record_item_view(p_item uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select i.seller_id into owner from public.items i where i.id = p_item and i.status in ('active'::public.item_status, 'reserved'::public.item_status);
  if owner is null or owner is not distinct from (select auth.uid()) then
    return;
  end if;
  insert into public.item_views (item_id, day, views)
  values (p_item, (now() at time zone 'Africa/Windhoek')::date, 1)
  on conflict (item_id, day) do update set views = public.item_views.views + 1;
end;
$$;
revoke all on function public.record_item_view(uuid) from public;
grant execute on function public.record_item_view(uuid) to anon, authenticated;

-- 3. The seller's own numbers: views, saves and sales. Only the caller's items.
create or replace function public.seller_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  today date := (now() at time zone 'Africa/Windhoek')::date;
  result jsonb;
begin
  if me is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'views_7d', coalesce((select sum(v.views) from public.item_views v join public.items i on i.id = v.item_id where i.seller_id = me and v.day > today - 7), 0),
    'saves_total', coalesce((select count(*) from public.favourites f join public.items i on i.id = f.item_id where i.seller_id = me and i.status in ('active'::public.item_status, 'reserved'::public.item_status)), 0),
    'sales_30d', coalesce((select count(*) from public.orders o where o.seller_id = me and o.status = 'completed' and o.completed_at > now() - interval '30 days'), 0),
    'sales_30d_cents', coalesce((select sum(o.amount_cents) from public.orders o where o.seller_id = me and o.status = 'completed' and o.completed_at > now() - interval '30 days'), 0),
    'sales_total', coalesce((select count(*) from public.orders o where o.seller_id = me and o.status = 'completed'), 0),
    'items', coalesce((
      select jsonb_object_agg(i.id, jsonb_build_object(
        'views_7d', coalesce((select sum(v.views) from public.item_views v where v.item_id = i.id and v.day > today - 7), 0),
        'views_total', coalesce((select sum(v.views) from public.item_views v where v.item_id = i.id), 0),
        'saves', (select count(*) from public.favourites f where f.item_id = i.id)))
      from public.items i where i.seller_id = me and i.status in ('active'::public.item_status, 'reserved'::public.item_status, 'sold'::public.item_status)), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.seller_stats() from public, anon;
grant execute on function public.seller_stats() to authenticated;
