begin;
select plan(16);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('4a4a4a4a-0000-0000-0000-00000000000a', 'bsel@example.com', now()),
  ('4a4a4a4a-0000-0000-0000-00000000000b', 'bbuy@example.com', now()),
  ('4a4a4a4a-0000-0000-0000-00000000000c', 'bsel2@example.com', now()),
  ('4a4a4a4a-0000-0000-0000-00000000000d', 'bmod@example.com', now());
update public.users set handle = 'b_seller', display_name = 'S', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '4a4a4a4a-0000-0000-0000-00000000000a';
update public.users set handle = 'b_buyer', display_name = 'B', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '4a4a4a4a-0000-0000-0000-00000000000b';
update public.users set handle = 'b_seller2', display_name = 'S2', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '4a4a4a4a-0000-0000-0000-00000000000c';
update public.users set handle = 'b_mod', display_name = 'M', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'moderator' where id = '4a4a4a4a-0000-0000-0000-00000000000d';

-- Items 1 to 4 are the first seller's (N$100, 200, 300, 400). Item 5 is another seller's. Item 6 is already sold.
insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select ('4b4b4b4b-0000-0000-0000-00000000000' || n)::uuid,
  case when n = 5 then '4a4a4a4a-0000-0000-0000-00000000000c' else '4a4a4a4a-0000-0000-0000-00000000000a' end::uuid, 'Bundle item number ' || n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['blue'], n * 10000, (select tw.id from public.towns tw where tw.name = 'Windhoek'), case when n = 6 then 'sold' else 'active' end::public.item_status, now()
from generate_series(1, 9) n;
update public.items set price_cents = 10000 where id = '4b4b4b4b-0000-0000-0000-000000000006';

select public.tap_as('4a4a4a4a-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err($$select public.create_bundle(array['4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002','4b4b4b4b-0000-0000-0000-000000000003']::uuid[])$$) = 'bundles_off', 'bundles are refused while the switch is off');
reset role;
update public.app_config set value = 'true'::jsonb where key = 'bundles_enabled';

set local role authenticated;
select ok(public.tap_err($$select public.create_bundle(array['4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002']::uuid[])$$) = 'bundle_size', 'two items are not enough');
select ok(public.tap_err($$select public.create_bundle(array['4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002']::uuid[])$$) = 'bundle_size', 'the same item counted twice does not help');
select ok(public.tap_err($$select public.create_bundle(array['4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002','4b4b4b4b-0000-0000-0000-000000000005']::uuid[])$$) = 'bundle_one_seller', 'all items must be from one seller');
select ok(public.tap_err($$select public.create_bundle(array['4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002','4b4b4b4b-0000-0000-0000-000000000006']::uuid[])$$) = 'item_unavailable', 'a sold item cannot be bundled');
select public.tap_as('4a4a4a4a-0000-0000-0000-00000000000a');
select ok(public.tap_err($$select public.create_bundle(array['4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002','4b4b4b4b-0000-0000-0000-000000000003']::uuid[])$$) = 'own_item', 'sellers cannot bundle their own items');
select public.tap_as('4a4a4a4a-0000-0000-0000-00000000000b');
create temp table b as select public.create_bundle(array['4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002','4b4b4b4b-0000-0000-0000-000000000003']::uuid[]) as id;
grant select on b to authenticated;
reset role;

select ok((select amount_cents = 54000 and status = 'awaiting_meetup' and item_id is null and bundle_offer_id is not null from public.orders where id = (select id from b)), 'three items worth N$600 cost N$540 with the 10 percent discount');
select ok((select sum(bi.amount_cents) = 54000 and count(*) = 3 from public.bundle_offer_items bi join public.orders o on o.bundle_offer_id = bi.bundle_offer_id where o.id = (select id from b)), 'the item shares add up to the order total exactly');
select ok((select count(*) = 3 from public.items where id in ('4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002','4b4b4b4b-0000-0000-0000-000000000003') and status = 'reserved'), 'every bundled item is held');
select ok((select status = 'active' from public.items where id = '4b4b4b4b-0000-0000-0000-000000000004'), 'other items stay on sale');

set local role authenticated;
select ok((select count(*) = 3 from public.bundle_order_items((select id from b))), 'the buyer can see what is in the bundle');
select public.tap_as('4a4a4a4a-0000-0000-0000-00000000000c');
select ok((select count(*) = 0 from public.bundle_order_items((select id from b))), 'an outsider cannot');

-- A meet-up can be arranged for a bundle (needs an active spot)
select public.tap_as('4a4a4a4a-0000-0000-0000-00000000000b');
reset role;
update public.meetup_spots set active = true, address = 'Test address' where id = (select min(id) from public.meetup_spots where town_id = (select id from public.towns where name = 'Windhoek'));
update public.meetup_spots set opens = '00:00', closes = '23:59' where active;
set local role authenticated;
select ok(public.tap_err($$select public.propose_meetup((select id from b), (select min(id) from public.meetup_spots where active), now() + interval '1 day')$$) = 'ok', 'a meet-up can be proposed for a bundle');
reset role;

-- Cancelling puts everything back; completing sells everything
select public.finish_cancel((select id from b), null, 'test', 'system');
select ok((select count(*) = 3 from public.items where id in ('4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002','4b4b4b4b-0000-0000-0000-000000000003') and status = 'active'), 'cancelling puts every item back on sale');

select public.tap_as('4a4a4a4a-0000-0000-0000-00000000000b');
set local role authenticated;
create temp table b2 as select public.create_bundle(array['4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002','4b4b4b4b-0000-0000-0000-000000000004']::uuid[]) as id;
grant select on b2 to authenticated;
reset role;
update public.orders set status = 'completed', completed_at = now() where id = (select id from b2);
select ok((select count(*) = 3 from public.items where id in ('4b4b4b4b-0000-0000-0000-000000000001','4b4b4b4b-0000-0000-0000-000000000002','4b4b4b4b-0000-0000-0000-000000000004') and status = 'sold'), 'completing sells every item');

-- A moderator ruling that completes it also sells everything
select public.tap_as('4a4a4a4a-0000-0000-0000-00000000000b');
set local role authenticated;
create temp table b3 as select public.create_bundle(array['4b4b4b4b-0000-0000-0000-000000000007','4b4b4b4b-0000-0000-0000-000000000008','4b4b4b4b-0000-0000-0000-000000000009']::uuid[]) as id;
grant select on b3 to authenticated;
select public.tap_as('4a4a4a4a-0000-0000-0000-00000000000d');
select public.decide_dispute((select id from b3), 'completed', 'The handover did happen, both agree');
reset role;
select ok((select count(*) = 3 from public.items where id in ('4b4b4b4b-0000-0000-0000-000000000007','4b4b4b4b-0000-0000-0000-000000000008','4b4b4b4b-0000-0000-0000-000000000009') and status = 'sold'), 'a moderator ruling that completes a bundle sells every item');

select * from finish();
rollback;
