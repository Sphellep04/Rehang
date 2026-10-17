begin;
select plan(18);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('17171717-0000-0000-0000-00000000000a', 'dsel@example.com', now()),
  ('17171717-0000-0000-0000-00000000000b', 'dbuy@example.com', now()),
  ('17171717-0000-0000-0000-00000000000c', 'dmod@example.com', now()),
  ('17171717-0000-0000-0000-00000000000d', 'dout@example.com', now());
update public.users set handle = 'd_seller', display_name = 'S', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '17171717-0000-0000-0000-00000000000a';
update public.users set handle = 'd_buyer', display_name = 'B', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '17171717-0000-0000-0000-00000000000b';
update public.users set handle = 'd_mod', display_name = 'M', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'moderator' where id = '17171717-0000-0000-0000-00000000000c';
update public.users set handle = 'd_out', display_name = 'O', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '17171717-0000-0000-0000-00000000000d';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select ('18181818-0000-0000-0000-00000000000' || n)::uuid, '17171717-0000-0000-0000-00000000000a', 'Dispute item number ' || n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['blue'], 20000, (select tw.id from public.towns tw where tw.name = 'Windhoek'), 'reserved', now()
from generate_series(1, 6) n;

-- 1 completed yesterday, 2 awaiting (meet-up passed), 3 awaiting (meet-up passed), 4 cancelled, 5 locked with no dispute yet, 6 completed 10 days ago
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, status, meetup_confirmed_at, meetup_at, completed_at, code_attempts)
select ('19191919-0000-0000-0000-00000000000' || n)::uuid, ('18181818-0000-0000-0000-00000000000' || n)::uuid,
  '17171717-0000-0000-0000-00000000000b', '17171717-0000-0000-0000-00000000000a', 20000,
  s::public.order_status, now() - interval '2 days', now() - interval '1 day', c, a
from (values (1, 'completed', now() - interval '1 day', 0), (2, 'awaiting_meetup', null::timestamptz, 0), (3, 'awaiting_meetup', null, 0),
             (4, 'cancelled', null, 0), (5, 'awaiting_meetup', null, 5), (6, 'completed', now() - interval '10 days', 0)) as v(n, s, c, a);

select public.tap_as('17171717-0000-0000-0000-00000000000d');
set local role authenticated;
select ok(public.tap_err($$select public.open_dispute('19191919-0000-0000-0000-000000000001', 'not_as_described', 'There is a big stain on the back')$$) = 'order_not_found', 'an outsider cannot report a problem');
select public.tap_as('17171717-0000-0000-0000-00000000000b');
select ok(public.tap_err($$select public.open_dispute('19191919-0000-0000-0000-000000000001', 'not_as_described', 'short')$$) = 'statement_length', 'a statement needs some detail');
select ok(public.tap_err($$select public.open_dispute('19191919-0000-0000-0000-000000000004', 'other', 'This order was cancelled already')$$) = 'order_not_open', 'a cancelled order cannot be reported');
select ok(public.tap_err($$select public.open_dispute('19191919-0000-0000-0000-000000000006', 'other', 'It was completed ten days ago')$$) = 'order_not_open', 'the problem window closes after 7 days');
select public.open_dispute('19191919-0000-0000-0000-000000000001', 'not_as_described', 'There is a big stain on the back');
select public.open_dispute('19191919-0000-0000-0000-000000000002', 'unsafe', 'The seller made me feel unsafe at the meet-up');
reset role;
select ok((select status = 'completed' from public.orders where id = '19191919-0000-0000-0000-000000000001') and (select buyer_statement is not null from public.disputes where order_id = '19191919-0000-0000-0000-000000000001'), 'a problem on a completed order is recorded and the order stays completed');
select ok((select status = 'disputed' from public.orders where id = '19191919-0000-0000-0000-000000000002'), 'a problem at the meet-up locks the order');
select ok((select count(*) = 1 from public.notifications where user_id = '17171717-0000-0000-0000-00000000000c' and kind = 'dispute_opened' and payload->>'order_id' = '19191919-0000-0000-0000-000000000001'), 'moderators are told');
select ok((select count(*) = 1 from public.notifications where user_id = '17171717-0000-0000-0000-00000000000a' and kind = 'dispute_opened' and payload->>'order_id' = '19191919-0000-0000-0000-000000000001'), 'the other person is told');

select public.tap_as('17171717-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err($$select public.open_dispute('19191919-0000-0000-0000-000000000001', 'other', 'Trying to report it a second time')$$) = 'already_reported', 'a second report on the same order is refused');
select public.tap_as('17171717-0000-0000-0000-00000000000a');
select public.respond_to_dispute('19191919-0000-0000-0000-000000000001', 'The stain was shown in the back photo');
select ok(public.tap_err($$select public.respond_to_dispute('19191919-0000-0000-0000-000000000001', 'Adding more later on please')$$) = 'already_responded', 'each side answers once');
select ok(public.tap_err($$select public.decide_dispute('19191919-0000-0000-0000-000000000001', 'no_fault', 'Not allowed for sellers to decide')$$) = 'not_allowed', 'only moderators decide');

select public.tap_as('17171717-0000-0000-0000-00000000000c');
select ok(public.tap_err($$select public.decide_dispute('19191919-0000-0000-0000-000000000002', 'seller_at_fault', 'short')$$) = 'reason_required', 'a decision needs a written reason');
select public.decide_dispute('19191919-0000-0000-0000-000000000002', 'seller_at_fault', 'Seller behaviour was not acceptable at the meet-up');
select public.decide_dispute('19191919-0000-0000-0000-000000000003', 'no_fault', 'Both agreed the meet-up did not work out');
select public.decide_dispute('19191919-0000-0000-0000-000000000005', 'completed', 'Both confirmed the item changed hands');
select public.decide_dispute('19191919-0000-0000-0000-000000000001', 'buyer_at_fault', 'The stain was clearly shown in the listing photos');
reset role;

select ok((select status = 'cancelled' from public.orders where id = '19191919-0000-0000-0000-000000000002') and (select status = 'active' from public.items where id = '18181818-0000-0000-0000-000000000002') and (select count(*) = 1 from public.strikes where user_id = '17171717-0000-0000-0000-00000000000a'), 'seller at fault cancels the order, relists the item and gives the seller a strike');
select ok((select status = 'cancelled' from public.orders where id = '19191919-0000-0000-0000-000000000003') and (select count(*) = 0 from public.strikes where order_id = '19191919-0000-0000-0000-000000000003'), 'no fault cancels without a strike');
select ok((select status = 'completed' from public.orders where id = '19191919-0000-0000-0000-000000000005') and (select status = 'sold' from public.items where id = '18181818-0000-0000-0000-000000000005') and (select reason = 'code_locked' from public.disputes where order_id = '19191919-0000-0000-0000-000000000005'), 'a locked order can be completed by a moderator');
select ok((select status = 'completed' from public.orders where id = '19191919-0000-0000-0000-000000000001') and (select count(*) = 1 from public.strikes where user_id = '17171717-0000-0000-0000-00000000000b'), 'a decision after completion records fault without undoing the sale');

select public.tap_as('17171717-0000-0000-0000-00000000000c');
set local role authenticated;
select ok(public.tap_err($$select public.decide_dispute('19191919-0000-0000-0000-000000000001', 'no_fault', 'Trying to decide the same thing twice')$$) = 'report_already_handled', 'a decided dispute cannot be decided again');
reset role;
select ok((select count(*) = 4 from public.moderator_actions where action like 'dispute_%') and (select count(*) = 2 from public.notifications where kind = 'dispute_decided' and payload->>'order_id' = '19191919-0000-0000-0000-000000000002'), 'decisions are logged and both people are told');

select * from finish();
rollback;
