begin;
select plan(14);

insert into auth.users (id, email, email_confirmed_at) values
  ('12121212-0000-0000-0000-000000000001', 's@example.com', now()),
  ('12121212-0000-0000-0000-000000000002', 'b@example.com', now());
update public.users set handle = 'lm_seller', display_name = 'S', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '12121212-0000-0000-0000-000000000001';
update public.users set handle = 'lm_buyer', display_name = 'B', status = 'active', terms_accepted_at = now() where id = '12121212-0000-0000-0000-000000000002';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select t.id, '12121212-0000-0000-0000-000000000001', 'Managed item number ' || t.n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['blue'], 20000, (select tw.id from public.towns tw where tw.name = 'Windhoek'), 'active', now()
from (values (1, '13131313-0000-0000-0000-000000000001'::uuid), (2, '13131313-0000-0000-0000-000000000002'::uuid), (3, '13131313-0000-0000-0000-000000000003'::uuid)) as t(n, id);
insert into public.favourites (user_id, item_id) values ('12121212-0000-0000-0000-000000000002', '13131313-0000-0000-0000-000000000001');
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, status)
values ('14141414-0000-0000-0000-000000000001', '13131313-0000-0000-0000-000000000003', '12121212-0000-0000-0000-000000000002', '12121212-0000-0000-0000-000000000001', 20000, 'awaiting_meetup');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000001', true);

update public.items set price_cents = 15000 where id = '13131313-0000-0000-0000-000000000001';
reset role;
select ok((select count(*) = 1 from public.notifications where kind = 'price_drop' and user_id = '12121212-0000-0000-0000-000000000002'), 'a price drop tells people who saved the item');
select ok((select (payload->>'new_cents')::int = 15000 from public.notifications where kind = 'price_drop'), 'the notification carries the new price');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000001', true);
update public.items set price_cents = 14500 where id = '13131313-0000-0000-0000-000000000001';
reset role;
select ok((select count(*) = 1 from public.notifications where kind = 'price_drop'), 'a tiny drop under 5 percent stays quiet');

set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000001', true);
select public.mark_item_sold('13131313-0000-0000-0000-000000000001');
select ok((select status = 'sold' from public.items where id = '13131313-0000-0000-0000-000000000001'), 'a seller can mark an item sold');

do $$ begin
  perform public.mark_item_sold('13131313-0000-0000-0000-000000000003');
  raise exception 'sold during open order';
exception when others then
  if sqlerrm <> 'item_has_open_order' then raise; end if;
end $$;
select ok(true, 'items with an open order cannot be marked sold or removed by hand');

select public.remove_my_item('13131313-0000-0000-0000-000000000002');
select ok((select status = 'removed' and removed_reason = 'seller' from public.items where id = '13131313-0000-0000-0000-000000000002'), 'a seller can remove a listing');
select ok(public.relist_item('13131313-0000-0000-0000-000000000002') = 'active', 'a verified seller can relist straight away');
select ok(public.relist_item('13131313-0000-0000-0000-000000000001') = 'active', 'an item sold outside Rehang can be relisted');

select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000002', true);
do $$ begin
  perform public.remove_my_item('13131313-0000-0000-0000-000000000001');
  raise exception 'removed someone else item';
exception when others then
  if sqlerrm <> 'item_not_found' then raise; end if;
end $$;
select ok(true, 'people cannot remove other sellers'' listings');
reset role;

-- Moderator removals cannot be undone by the seller.
update public.items set status = 'removed' where id = '13131313-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000001', true);
do $$ begin
  perform public.relist_item('13131313-0000-0000-0000-000000000002');
  raise exception 'relisted moderator removal';
exception when others then
  if sqlerrm <> 'cannot_relist' then raise; end if;
end $$;
select ok(true, 'listings removed by moderators stay removed');
reset role;

-- A completed sale cannot be relisted.
update public.orders set status = 'completed', completed_at = now() where id = '14141414-0000-0000-0000-000000000001';
update public.items set status = 'sold' where id = '13131313-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000001', true);
do $$ begin
  perform public.relist_item('13131313-0000-0000-0000-000000000003');
  raise exception 'relisted completed sale';
exception when others then
  if sqlerrm <> 'cannot_relist' then raise; end if;
end $$;
select ok(true, 'items sold through Rehang cannot be relisted');
reset role;

update public.users set verification_level = 'level1' where id = '12121212-0000-0000-0000-000000000001';
update public.items set status = 'removed', removed_reason = 'seller' where id = '13131313-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '12121212-0000-0000-0000-000000000001', true);
select ok(public.relist_item('13131313-0000-0000-0000-000000000002') = 'awaiting_verification', 'an unverified seller''s relisting waits for ID approval');
reset role;

select ok(not has_function_privilege('anon', 'public.relist_item(uuid)', 'execute'), 'anonymous visitors cannot manage listings');
select ok(not has_function_privilege('authenticated', 'public.item_has_open_order(uuid)', 'execute'), 'the open-order helper is internal');

select * from finish();
rollback;
