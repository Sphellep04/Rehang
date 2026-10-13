begin;

select plan(16);

-- Fixtures: two sellers, one buyer, three items.
insert into auth.users (id, phone) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '+264810000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '+264810000002'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '+264810000003');

update public.users set handle = 'nandi_closet', display_name = 'Nandi', status = 'active'
where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update public.users set handle = 'tuli_threads', display_name = 'Tuli', status = 'active'
where id = 'aaaaaaaa-0000-0000-0000-000000000002';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select v.id, v.seller, v.title,
  (select c.id from public.categories c where c.slug = 'women-dresses'),
  (select s.id from public.sizes s order by s.id limit 1),
  'very_good'::public.item_condition, array['blue'], v.price, (select t.id from public.towns t where t.name = 'Windhoek'),
  v.status::public.item_status, now()
from (values
  ('bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'Linen summer dress', 25000, 'active'),
  ('bbbbbbbb-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'Denim jacket classic', 40000, 'sold'),
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid, 'aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'Private draft dress', 30000, 'draft')
) as v(id, seller, title, price, status);

insert into public.follows (follower_id, seller_id) values
  ('aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.favourites (user_id, item_id) values
  ('aaaaaaaa-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000001');

select ok(has_function_privilege('anon', 'public.items_search(text)', 'execute'), 'anonymous visitors can search listings');
select ok(has_function_privilege('anon', 'public.shop_stats(uuid)', 'execute'), 'anonymous visitors can read shop counts');

-- Search runs as an anonymous visitor so item RLS applies.
set local role anon;

select ok((select count(*) = 1 from public.items_search('lin')), 'prefix search matches partial words');
select ok((select count(*) = 1 from public.items_search('Linen DRESS!')), 'search ignores case and punctuation');
select ok((select count(*) = 0 from public.items_search('private')), 'draft listings never appear in search');
select ok((select count(*) = 0 from public.items_search('')), 'empty search returns nothing instead of everything');
select ok((select count(*) = 0 from public.items_search(''' ); drop table public.items; --')), 'search input cannot inject SQL');

select ok((select follower_count = 2 and active_count = 1 and sold_count = 1 from public.shop_stats('aaaaaaaa-0000-0000-0000-000000000001')), 'shop stats count followers, active and sold items');
select ok((select public.item_favourite_count('bbbbbbbb-0000-0000-0000-000000000001') = 1), 'public favourite count works for visible items');
select ok((select public.item_favourite_count('bbbbbbbb-0000-0000-0000-000000000003') = 0), 'favourite count hides draft items');

reset role;


-- Save and follow buttons: the same calls the app makes, as a signed-in buyer.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);

insert into public.favourites (item_id) values ('bbbbbbbb-0000-0000-0000-000000000001') on conflict (user_id, item_id) do nothing;
insert into public.favourites (item_id) values ('bbbbbbbb-0000-0000-0000-000000000001') on conflict (user_id, item_id) do nothing;
select ok((select count(*) = 1 from public.favourites where item_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'saving the same item twice keeps one favourite');

insert into public.follows (seller_id) values ('aaaaaaaa-0000-0000-0000-000000000002') on conflict (follower_id, seller_id) do nothing;
insert into public.follows (seller_id) values ('aaaaaaaa-0000-0000-0000-000000000002') on conflict (follower_id, seller_id) do nothing;
select ok((select count(*) = 1 from public.follows where seller_id = 'aaaaaaaa-0000-0000-0000-000000000002' and follower_id = 'aaaaaaaa-0000-0000-0000-000000000003'), 'following the same seller twice keeps one follow');

-- Another user cannot see this buyer's saved item while it exists.
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000002', true);
select ok((select count(*) = 0 from public.favourites where item_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'saved items are private to their owner');

select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000003', true);
delete from public.favourites where item_id = 'bbbbbbbb-0000-0000-0000-000000000001';
select ok((select count(*) = 0 from public.favourites where item_id = 'bbbbbbbb-0000-0000-0000-000000000001'), 'unsaving removes the favourite');

reset role;

select ok(
  (select count(*) = 0 from (
    select 1 from public.shop_stats('00000000-0000-0000-0000-00000000dead')
  ) as missing),
  'shop stats return nothing for unknown sellers'
);

do $$
begin
  update public.users set handle = 'login' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  raise exception 'reserved handle was accepted';
exception when check_violation then
  null;
end $$;
select ok(true, 'reserved route names cannot be used as shop handles');

select * from finish();
rollback;
