begin;
select plan(12);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to anon, authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('5d5d5d5d-0000-0000-0000-000000000001', 'ps@example.com', now()),
  ('5d5d5d5d-0000-0000-0000-000000000002', 'pb@example.com', now()),
  ('5d5d5d5d-0000-0000-0000-000000000003', 'po@example.com', now());
update public.users set handle = 'p_seller', display_name = 'S', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '5d5d5d5d-0000-0000-0000-000000000001';
update public.users set handle = 'p_buyer', display_name = 'B', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '5d5d5d5d-0000-0000-0000-000000000002';
update public.users set handle = 'p_other', display_name = 'O', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '5d5d5d5d-0000-0000-0000-000000000003';

create function pg_temp.add_item(p_n integer, p_brand text, p_price integer, p_status text, p_cond text default 'very_good') returns void language sql as $$
  insert into public.items (seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, brand_text, published_at)
  values ('5d5d5d5d-0000-0000-0000-000000000001', 'Stats test item number ' || p_n, (select c.id from public.categories c where c.slug = 'women-dresses'),
    (select s.id from public.sizes s order by s.id limit 1), p_cond::public.item_condition, array['blue'], p_price, (select tw.id from public.towns tw where tw.name = 'Windhoek'),
    p_status::public.item_status, p_brand, now()) $$;

-- Four Zara dresses and one other, so Zara alone is below the five needed
select pg_temp.add_item(1, 'Zara', 10000, 'active');
select pg_temp.add_item(2, 'Zara', 20000, 'active');
select pg_temp.add_item(3, 'Zara', 30000, 'sold');
select pg_temp.add_item(4, 'Zara', 40000, 'active');
select pg_temp.add_item(5, null, 50000, 'active');
select pg_temp.add_item(6, null, 60000, 'draft');

select public.tap_as('5d5d5d5d-0000-0000-0000-000000000002');
set local role authenticated;
select ok((select sample_size = 5 and middle_cents = 30000 and low_cents = 20000 and high_cents = 40000 and not same_brand from public.price_suggestion((select id from public.categories where slug = 'women-dresses'), 'very_good', 'Zara')),
  'with four brand matches it falls back to the category: five listings, middle N$300, drafts ignored');
select ok((select count(*) = 0 from public.price_suggestion((select id from public.categories where slug = 'women-dresses'), 'fair', null)), 'no suggestion when fewer than five similar items exist');
select ok((select count(*) = 0 from public.price_suggestion((select id from public.categories where slug = 'women-dresses'), 'not-a-condition', null)), 'a bad condition gives no suggestion and no error');
reset role;

select pg_temp.add_item(7, 'zara', 50000, 'active');
select public.tap_as('5d5d5d5d-0000-0000-0000-000000000002');
set local role authenticated;
select ok((select same_brand and sample_size = 5 and middle_cents = 30000 from public.price_suggestion((select id from public.categories where slug = 'women-dresses'), 'very_good', 'ZARA')),
  'with five matches of the brand it uses the brand, whatever the capital letters');
reset role;

set local role anon;
select ok(public.tap_err($$select * from public.price_suggestion(1, 'good', null)$$) like 'permission denied%', 'visitors cannot ask for price suggestions');
reset role;

-- Views
select set_config('rehang.item', (select id::text from public.items where title like '%number 1'), true);
set local role anon;
select public.record_item_view(current_setting('rehang.item')::uuid);
select public.record_item_view(current_setting('rehang.item')::uuid);
reset role;
select public.tap_as('5d5d5d5d-0000-0000-0000-000000000003');
set local role authenticated;
select public.record_item_view(current_setting('rehang.item')::uuid);
reset role;
select public.tap_as('5d5d5d5d-0000-0000-0000-000000000001');
set local role authenticated;
select public.record_item_view(current_setting('rehang.item')::uuid);
reset role;
select ok((select views = 3 from public.item_views where item_id = current_setting('rehang.item')::uuid), 'three visitor views are counted and the seller''s own view is not');
select public.record_item_view((select id from public.items where title like '%number 6'));
select ok((select count(*) = 0 from public.item_views where item_id = (select id from public.items where title like '%number 6')), 'views of a draft are not counted');
set local role anon;
select ok(public.tap_err($$select * from public.item_views$$) like 'permission denied%', 'visitors cannot read the view counts');
reset role;

-- Saves and sales
insert into public.favourites (user_id, item_id) select '5d5d5d5d-0000-0000-0000-000000000002', id from public.items where title like '%number 1' or title like '%number 2';
insert into public.favourites (user_id, item_id) select '5d5d5d5d-0000-0000-0000-000000000003', id from public.items where title like '%number 1';
insert into public.orders (item_id, buyer_id, seller_id, amount_cents, status, completed_at)
select id, '5d5d5d5d-0000-0000-0000-000000000002', '5d5d5d5d-0000-0000-0000-000000000001', price_cents, 'completed', now() from public.items where title like '%number 3';

select public.tap_as('5d5d5d5d-0000-0000-0000-000000000001');
set local role authenticated;
select ok((select (public.seller_stats() ->> 'views_7d')::int = 3), 'seller sees three views this week');
select ok((select (public.seller_stats() ->> 'saves_total')::int = 3), 'seller sees three saves on live items');
select ok((select (public.seller_stats() ->> 'sales_30d')::int = 1 and (public.seller_stats() ->> 'sales_30d_cents')::int = 30000), 'seller sees one sale worth N$300');
reset role;
select public.tap_as('5d5d5d5d-0000-0000-0000-000000000003');
set local role authenticated;
select ok((select (public.seller_stats() ->> 'views_7d')::int = 0 and public.seller_stats() -> 'items' = '{}'::jsonb), 'another user sees only their own, which is nothing');
reset role;

select * from finish();
rollback;
