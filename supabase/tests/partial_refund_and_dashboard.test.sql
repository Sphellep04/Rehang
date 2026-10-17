begin;
select plan(19);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('5a5a5a5a-0000-0000-0000-00000000000a', 'dsel@example.com', now()),
  ('5a5a5a5a-0000-0000-0000-00000000000b', 'dbuy@example.com', now()),
  ('5a5a5a5a-0000-0000-0000-00000000000c', 'dmod@example.com', now());
update public.users set handle = 'h_seller', display_name = 'S', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '5a5a5a5a-0000-0000-0000-00000000000a';
update public.users set handle = 'h_buyer', display_name = 'B', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '5a5a5a5a-0000-0000-0000-00000000000b';
update public.users set handle = 'h_mod', display_name = 'M', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'moderator' where id = '5a5a5a5a-0000-0000-0000-00000000000c';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select ('5b5b5b5b-0000-0000-0000-00000000000' || n)::uuid, '5a5a5a5a-0000-0000-0000-00000000000a', 'Dashboard item number ' || n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['blue'], 20000, (select tw.id from public.towns tw where tw.name = 'Windhoek'),
  (case n when 1 then 'reserved' when 2 then 'sold' when 3 then 'reserved' when 4 then 'active' else 'draft' end)::public.item_status, now()
from generate_series(1, 5) n;
update public.items set status = 'reserved' where id = '5b5b5b5b-0000-0000-0000-000000000001';

-- Order 1: paid online (N$200 + N$50 postage + N$10 fee), delivered, disputed. Order 2: completed meet-up last week.
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, commission_cents, shipping_cents, buyer_fee_cents, status, delivery_method)
values ('5c5c5c5c-0000-0000-0000-000000000001', '5b5b5b5b-0000-0000-0000-000000000001', '5a5a5a5a-0000-0000-0000-00000000000b', '5a5a5a5a-0000-0000-0000-00000000000a', 20000, 2000, 5000, 1000, 'delivered', 'courier');
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, commission_cents, status, completed_at, meetup_at, meetup_confirmed_at)
values ('5c5c5c5c-0000-0000-0000-000000000002', '5b5b5b5b-0000-0000-0000-000000000002', '5a5a5a5a-0000-0000-0000-00000000000b', '5a5a5a5a-0000-0000-0000-00000000000a', 20000, 2000, 'completed', now() - interval '3 days', now() - interval '3 days', now() - interval '4 days');
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, status, meetup_at)
values ('5c5c5c5c-0000-0000-0000-000000000003', '5b5b5b5b-0000-0000-0000-000000000003', '5a5a5a5a-0000-0000-0000-00000000000b', '5a5a5a5a-0000-0000-0000-00000000000a', 20000, 'awaiting_meetup', now() + interval '1 day');
insert into public.payment_transactions (order_id, provider, provider_reference, kind, status, amount_cents)
values ('5c5c5c5c-0000-0000-0000-000000000001', 'mock', 'pay-h1', 'capture', 'succeeded', 26000);
insert into public.offers (item_id, buyer_id, amount_cents) values ('5b5b5b5b-0000-0000-0000-000000000004', '5a5a5a5a-0000-0000-0000-00000000000b', 15000);
insert into public.item_views (item_id, day, views) values ('5b5b5b5b-0000-0000-0000-000000000004', (now() at time zone 'Africa/Windhoek')::date, 7);

-- Partial refund
select public.tap_as('5a5a5a5a-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err($$select public.partial_refund('5c5c5c5c-0000-0000-0000-000000000001', 5000, 'The dress had a stain not shown in the photos')$$) = 'not_allowed', 'only the team can give a partial refund');
select public.tap_as('5a5a5a5a-0000-0000-0000-00000000000c');
select ok(public.tap_err($$select public.partial_refund('5c5c5c5c-0000-0000-0000-000000000001', 5000, 'short')$$) = 'reason_required', 'a refund needs a written reason');
select ok(public.tap_err($$select public.partial_refund('5c5c5c5c-0000-0000-0000-000000000001', 50, 'The dress had a stain not shown in the photos')$$) = 'invalid_refund_amount', 'a refund must be at least N$1');
select ok(public.tap_err($$select public.partial_refund('5c5c5c5c-0000-0000-0000-000000000001', 25000, 'The dress had a stain not shown in the photos')$$) = 'invalid_refund_amount', 'a refund must be less than item plus postage');
select ok(public.tap_err($$select public.partial_refund('5c5c5c5c-0000-0000-0000-000000000002', 5000, 'The dress had a stain not shown in the photos')$$) = 'order_not_open', 'a finished order cannot be refunded this way');
select public.partial_refund('5c5c5c5c-0000-0000-0000-000000000001', 5000, 'The dress had a stain not shown in the photos');
reset role;
select ok((select status = 'completed' and refunded_cents = 5000 from public.orders where id = '5c5c5c5c-0000-0000-0000-000000000001'), 'the order completes with the refund recorded');
select ok((select status = 'sold' from public.items where id = '5b5b5b5b-0000-0000-0000-000000000001'), 'the item is sold');
select ok((select amount_cents = 5000 and status = 'pending' from public.payment_transactions where order_id = '5c5c5c5c-0000-0000-0000-000000000001' and kind = 'refund'), 'a refund of N$50 is queued for the buyer');
select ok((select amount_cents = 18000 from public.payouts where order_id = '5c5c5c5c-0000-0000-0000-000000000001'), 'the seller payout is item + postage - commission - refund = N$180');
select ok((select decision = 'partial_refund' from public.disputes where order_id = '5c5c5c5c-0000-0000-0000-000000000001'), 'the decision is on record');

-- Dashboard
select public.tap_as('5a5a5a5a-0000-0000-0000-00000000000a');
set local role authenticated;
create temp table dash as select public.seller_dashboard() as j;
grant select on dash to authenticated;
select ok((select (j #>> '{todo,confirm_meetup}')::int = 1 and (j #>> '{todo,offers_to_answer}')::int = 1 and (j #>> '{todo,to_post}')::int = 0 from dash), 'the to-do counts show one meet-up to confirm and one offer to answer');
select ok((select (j #>> '{money,sold_30d_cents}')::bigint = 20000 + 25000 - 5000 from dash), 'sold in 30 days counts both orders, with postage and less the refund');
select ok((select (j #>> '{money,commission_30d_cents}')::bigint = 4000 from dash), 'commission over 30 days is shown');
select ok((select (j #>> '{money,payout_pending_cents}')::bigint = 18000 from dash), 'the pending payout is shown');
select ok((select jsonb_array_length(j -> 'weeks') = 8 from dash), 'there are eight weeks of history');
select ok((select (select sum((w ->> 'sales')::int) from jsonb_array_elements(j -> 'weeks') w) = 2 from dash), 'both completed orders appear in the weekly history');
select ok((select (j #>> '{listings,active}')::int = 1 and (j #>> '{listings,sold}')::int = 2 and (j #>> '{listings,drafts}')::int = 1 from dash), 'listing counts are right');
select ok((select j #>> '{top_items,0,views_7d}' = '7' from dash), 'the most viewed live item comes first');
select public.tap_as('5a5a5a5a-0000-0000-0000-00000000000b');
select ok((select (j.j #>> '{money,sold_total_cents}')::bigint = 0 from (select public.seller_dashboard() as j) j), 'a buyer sees only their own (empty) dashboard');
reset role;

select * from finish();
rollback;
