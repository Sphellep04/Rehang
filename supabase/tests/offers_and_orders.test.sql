begin;

select plan(72);

-- Helper: run a statement and return the error message, or 'ok' when it succeeds.
create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlerrm;
end $$;
grant execute on function public.tap_err(text) to authenticated;

-- Helper: act as a signed-in user.
create function public.tap_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end $$;

-- Fixtures ------------------------------------------------------------------------------------
-- seller S (level 2), buyer B (level 1), buyer C (level 2), new member Z (level 0), admin A.
insert into auth.users (id, phone) values
  ('cccccccc-0000-0000-0000-00000000000a', '+264811000001'),
  ('cccccccc-0000-0000-0000-00000000000b', '+264811000002'),
  ('cccccccc-0000-0000-0000-00000000000c', '+264811000003'),
  ('cccccccc-0000-0000-0000-00000000000d', '+264811000004'),
  ('cccccccc-0000-0000-0000-00000000000e', '+264811000005');

update public.users set handle = 'seller_s', display_name = 'Seller', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = 'cccccccc-0000-0000-0000-00000000000a';
update public.users set handle = 'buyer_b', display_name = 'Buyer B', status = 'active', terms_accepted_at = now(), verification_level = 'level1' where id = 'cccccccc-0000-0000-0000-00000000000b';
update public.users set handle = 'buyer_c', display_name = 'Buyer C', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = 'cccccccc-0000-0000-0000-00000000000c';
update public.users set handle = 'newbie_z', display_name = 'Newbie', status = 'active', terms_accepted_at = now(), verification_level = 'level0' where id = 'cccccccc-0000-0000-0000-00000000000d';
update public.users set handle = 'admin_a', display_name = 'Admin', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'admin' where id = 'cccccccc-0000-0000-0000-00000000000e';

update public.meetup_spots set active = true, address = 'Test address' where name = 'Maerua Mall';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select v.id, 'cccccccc-0000-0000-0000-00000000000a', v.title,
  (select c.id from public.categories c where c.slug = 'women-dresses'),
  (select s.id from public.sizes s order by s.id limit 1),
  'good'::public.item_condition, array['red'], v.price,
  (select t.id from public.towns t where t.name = 'Windhoek'), 'active'::public.item_status, now()
from (values
  ('dddddddd-0000-0000-0000-000000000001'::uuid, 'Offer target dress', 25000),
  ('dddddddd-0000-0000-0000-000000000002'::uuid, 'Buy now jacket one', 30000),
  ('dddddddd-0000-0000-0000-000000000003'::uuid, 'Expensive coat here', 150000),
  ('dddddddd-0000-0000-0000-000000000004'::uuid, 'Second buy now item', 20000),
  ('dddddddd-0000-0000-0000-000000000005'::uuid, 'Third buy now item', 20000),
  ('dddddddd-0000-0000-0000-000000000006'::uuid, 'Strike ladder item', 20000),
  ('dddddddd-0000-0000-0000-000000000007'::uuid, 'No show item one', 20000),
  ('dddddddd-0000-0000-0000-000000000008'::uuid, 'No show item two', 20000),
  ('dddddddd-0000-0000-0000-000000000009'::uuid, 'Timer item unconfirmed', 20000),
  ('dddddddd-0000-0000-0000-00000000000a'::uuid, 'Timer item confirmed', 20000)
) as v(id, title, price);

-- A meet-up time tomorrow at 10:00 Windhoek time, and one at 22:00 (outside spot hours).
create function public.tap_slot(p_hour integer) returns timestamptz language sql stable as $$
  select ((date_trunc('day', now() at time zone 'Africa/Windhoek') + interval '1 day' + make_interval(hours => p_hour)) at time zone 'Africa/Windhoek')
$$;

-- Offers --------------------------------------------------------------------------------------
select public.tap_as('cccccccc-0000-0000-0000-00000000000d');
set local role authenticated;
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000001', 20000)$$) = 'verification_required', 'level 0 members cannot make offers');
reset role;

select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000001', 20000)$$) = 'own_item', 'sellers cannot offer on their own item');
reset role;

select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000001', 14900)$$) = 'offer_too_low', 'offers under 60 percent are refused');
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000001', 25000)$$) = 'offer_not_below_price', 'an offer at the listed price is refused (use buy now)');
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000001', 20050)$$) = 'offer_not_whole_amount', 'offers must be whole dollars');
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000003', 120000)$$) = 'order_limit_exceeded', 'level 1 buyers cannot exceed the per order limit');
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000001', 15000)$$) = 'ok', 'a valid offer is accepted');
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000001', 16000)$$) = 'ok', 'a second open offer is allowed');
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000001', 17000)$$) = 'ok', 'a third open offer is allowed');
select ok(public.tap_err($$select public.make_offer('dddddddd-0000-0000-0000-000000000001', 18000)$$) = 'too_many_offers_on_item', 'a fourth open offer on one item is refused');
reset role;

select ok((select count(*) = 3 from public.notifications where user_id = 'cccccccc-0000-0000-0000-00000000000a' and kind = 'offer_received'), 'the seller is notified of each offer');

-- Seller counters the 17000 offer.
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok(public.tap_err(format($$select public.respond_to_offer(%L, 'counter', 16000)$$, (select id from public.offers where amount_cents = 17000))) = 'invalid_counter_amount', 'a counter below the buyer offer is refused');
select ok(public.tap_err(format($$select public.respond_to_offer(%L, 'counter', 26000)$$, (select id from public.offers where amount_cents = 17000))) = 'invalid_counter_amount', 'a counter above the listed price is refused');
select ok(public.tap_err(format($$select public.respond_to_offer(%L, 'counter', 21000)$$, (select id from public.offers where amount_cents = 17000))) = 'ok', 'the seller can counter');
reset role;
select ok((select status = 'countered' from public.offers where amount_cents = 17000 and not made_by_seller), 'the original offer is marked countered');
select ok((select count(*) = 1 from public.offers where amount_cents = 21000 and made_by_seller and status = 'open'), 'a seller counter offer is open for the buyer');

-- Buyer cannot answer their own offer; a stranger cannot answer either.
select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err(format($$select public.respond_to_offer(%L, 'accept')$$, (select id from public.offers where amount_cents = 15000))) = 'not_your_offer_to_answer', 'buyers cannot accept their own offer');
reset role;
select set_config('tap.counter', (select id::text from public.offers where amount_cents = 21000), true);
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select ok(public.tap_err(format($$select public.respond_to_offer(%L, 'accept')$$, current_setting('tap.counter'))) = 'not_your_offer_to_answer', 'a stranger cannot accept someone elses counter');
reset role;

-- Buyer accepts the counter: order at 21000, item reserved, other offers closed.
select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err(format($$select public.respond_to_offer(%L, 'accept')$$, (select id from public.offers where amount_cents = 21000))) = 'ok', 'the buyer can accept the counter');
reset role;
select ok((select amount_cents = 21000 and status = 'awaiting_meetup' from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), 'an order is created at the countered price');
select ok((select status = 'reserved' from public.items where id = 'dddddddd-0000-0000-0000-000000000001'), 'the item is reserved');
select ok((select count(*) = 0 from public.offers where item_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'open'), 'other open offers are closed when an order is created');

-- Meet-up proposal rules.
select set_config('tap.order1', (select id::text from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), true);
select set_config('tap.spot_ok', (select id::text from public.meetup_spots where name = 'Maerua Mall'), true);
select set_config('tap.spot_off', (select id::text from public.meetup_spots where name = 'Grove Mall of Namibia'), true);
select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err(format($$select public.propose_meetup(%L, %s, now() + interval '30 minutes')$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), (select id from public.meetup_spots where name = 'Maerua Mall'))) = 'meetup_too_soon', 'a meet-up under 3 hours away is refused');
select ok(public.tap_err(format($$select public.propose_meetup(%L, %s, public.tap_slot(22))$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), (select id from public.meetup_spots where name = 'Maerua Mall'))) = 'meetup_outside_hours', 'a meet-up outside the spot hours is refused');
select ok(public.tap_err(format($$select public.propose_meetup(%L, %s, public.tap_slot(10))$$, current_setting('tap.order1'), current_setting('tap.spot_off'))) = 'meetup_spot_unavailable', 'inactive spots cannot be booked');
select ok(public.tap_err(format($$select public.propose_meetup(%L, %s, public.tap_slot(10))$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), (select id from public.meetup_spots where name = 'Maerua Mall'))) = 'ok', 'a valid meet-up can be proposed');
reset role;

-- The seller cannot see a code before confirming; after confirming only the buyer can.
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok(public.tap_err(format($$select public.confirm_meetup(%L)$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'))) = 'ok', 'the seller can confirm the meet-up');
select ok((select count(*) = 0 from public.get_meetup_code((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'))), 'the seller cannot read the meet-up code');
select ok(public.tap_err($$select code_hash from public.orders$$) like 'permission denied%', 'the seller cannot read the code hash column');
select ok(public.tap_err($$select code from public.order_meetup_codes$$) like 'permission denied%', 'nobody can read the code table directly');
reset role;
select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok((select count(*) = 1 and bool_and(code ~ '^[0-9]{6}$') from public.get_meetup_code((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'))), 'the buyer can read a six digit meet-up code');
reset role;
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select ok((select count(*) = 0 from public.get_meetup_code((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'))), 'a stranger cannot read the meet-up code');
reset role;

-- Code entry. The meet-up is tomorrow, so move it to 30 minutes from now as the superuser.
update public.orders set meetup_at = now() + interval '30 minutes' where item_id = 'dddddddd-0000-0000-0000-000000000001';

select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err(format($$select public.complete_meetup(%L, '000000')$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'))) = 'order_not_found', 'the buyer cannot complete their own order');
reset role;

select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok((select result = 'wrong_code' and attempts_left = 4 from public.complete_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), '000000')), 'a wrong code is counted and does not complete the order');
select ok((select result = 'wrong_code' and attempts_left = 3 from public.complete_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), '000001')), 'wrong attempts accumulate');
select public.complete_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), '000002');
select public.complete_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), '000003');
select ok((select result = 'locked' from public.complete_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), '000004')), 'the fifth wrong code locks the order');
reset role;
select ok((select count(*) = 1 from public.notifications where user_id = 'cccccccc-0000-0000-0000-00000000000e' and kind = 'code_locked'), 'moderators are alerted when a code locks');

-- Even the real code is refused once locked.
select set_config('tap.code', (select code from public.order_meetup_codes where order_id = (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001')), true);
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok((select result = 'locked' from public.complete_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), current_setting('tap.code'))), 'a locked order refuses even the correct code');
reset role;

-- Support unlocks it (as the superuser), then the real code completes the order.
update public.orders set code_attempts = 0 where item_id = 'dddddddd-0000-0000-0000-000000000001';
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok((select result = 'completed' from public.complete_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), current_setting('tap.code'))), 'the correct code completes the order');
reset role;
select ok((select status = 'sold' and sold_at is not null from public.items where id = 'dddddddd-0000-0000-0000-000000000001'), 'the item is marked sold');
select ok((select status = 'completed' and completed_at is not null from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'), 'the order is marked completed');
select ok((select count(*) = 2 from public.notifications where kind = 'order_completed' and payload ->> 'order_id' = (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001')::text), 'both sides are told the trade is complete');
select ok((select count(*) = 2 from public.order_events where event in ('code_entered', 'completed') and order_id = (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001')), 'the audit log records the completion');

-- Reviews: each participant can review once, inside 7 days, and strangers cannot.
select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err(format($$insert into public.reviews (order_id, reviewee_id, rating) values (%L, 'cccccccc-0000-0000-0000-00000000000a', 5)$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'))) = 'ok', 'the buyer can review the seller');
select ok(public.tap_err(format($$insert into public.reviews (order_id, reviewee_id, rating) values (%L, 'cccccccc-0000-0000-0000-00000000000a', 4)$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'))) like 'duplicate key%', 'a second review of the same order is refused');
reset role;
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select ok(public.tap_err(format($$insert into public.reviews (order_id, reviewee_id, rating) values (%L, 'cccccccc-0000-0000-0000-00000000000a', 1)$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'))) like 'new row violates row-level security%', 'strangers cannot review an order');
reset role;
update public.orders set completed_at = now() - interval '8 days' where item_id = 'dddddddd-0000-0000-0000-000000000001';
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok(public.tap_err(format($$insert into public.reviews (order_id, reviewee_id, rating) values (%L, 'cccccccc-0000-0000-0000-00000000000b', 5)$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000001'))) like 'new row violates row-level security%', 'reviews close 7 days after completion');
reset role;

-- Buy now ------------------------------------------------------------------------------------
select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err(format($$select public.buy_now('dddddddd-0000-0000-0000-000000000002', %s, public.tap_slot(10))$$, (select id from public.meetup_spots where name = 'Maerua Mall'))) = 'ok', 'buy now creates an order with a meet-up request');
reset role;
select ok((select status = 'reserved' from public.items where id = 'dddddddd-0000-0000-0000-000000000002'), 'buy now reserves the item');
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select ok(public.tap_err($$select public.buy_now('dddddddd-0000-0000-0000-000000000002')$$) = 'item_unavailable', 'a reserved item cannot be bought twice');
reset role;

-- Buyer cancels before the seller confirms: free, and the item goes back on sale.
select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok((select public.cancel_order((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000002'), 'buyer_cancelled') ->> 'status') = 'cancelled', 'a buyer can cancel before the seller confirms');
reset role;
select ok((select status = 'active' from public.items where id = 'dddddddd-0000-0000-0000-000000000002') and (select count(*) = 0 from public.strikes), 'cancelling early is free and relists the item');

-- Late buyer cancellation is refused (within 2 hours of a confirmed meet-up).
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select public.buy_now('dddddddd-0000-0000-0000-000000000004', (select id from public.meetup_spots where name = 'Maerua Mall'), public.tap_slot(10));
reset role;
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select public.confirm_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000004'));
reset role;
update public.orders set meetup_at = now() + interval '1 hour' where item_id = 'dddddddd-0000-0000-0000-000000000004';
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select ok(public.tap_err(format($$select public.cancel_order(%L, 'buyer_cancelled')$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000004'))) = 'too_late_to_cancel', 'buyers cannot cancel within 2 hours of a confirmed meet-up');
reset role;

-- Seller cancels a confirmed order: strike, and the item is relisted.
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok((select public.cancel_order((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000004'), 'seller_cancelled') ->> 'strike') = 'true', 'a seller cancelling a confirmed order gets a strike');
reset role;
select ok((select count(*) = 1 from public.strikes where user_id = 'cccccccc-0000-0000-0000-00000000000a' and reason = 'seller_cancel') and (select status = 'active' from public.items where id = 'dddddddd-0000-0000-0000-000000000004'), 'the strike is recorded and the item relisted');

-- Cancel by agreement: first tap only requests, the second tap cancels, no strike.
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select public.buy_now('dddddddd-0000-0000-0000-000000000005', (select id from public.meetup_spots where name = 'Maerua Mall'), public.tap_slot(10));
reset role;
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select public.confirm_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000005'));
select ok((select public.cancel_order((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000005'), 'agreement') ->> 'status') = 'requested', 'the first agreement tap only asks the other person');
reset role;
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select ok((select public.cancel_order((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000005'), 'agreement') ->> 'status') = 'cancelled', 'the second tap cancels by agreement');
reset role;
select ok((select count(*) = 1 from public.strikes where user_id = 'cccccccc-0000-0000-0000-00000000000a'), 'cancelling by agreement gives no strike');

-- No-shows -----------------------------------------------------------------------------------
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select public.buy_now('dddddddd-0000-0000-0000-000000000007', (select id from public.meetup_spots where name = 'Maerua Mall'), public.tap_slot(10));
select public.buy_now('dddddddd-0000-0000-0000-000000000008', (select id from public.meetup_spots where name = 'Maerua Mall'), public.tap_slot(11));
reset role;
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select public.confirm_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000007'));
select public.confirm_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000008'));
reset role;
update public.orders set meetup_at = now() - interval '10 minutes' where item_id in ('dddddddd-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000008');
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok(public.tap_err(format($$select public.report_no_show(%L)$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000007'))) = 'too_early_to_report', 'a no-show cannot be reported before 30 minutes have passed');
reset role;
update public.orders set meetup_at = now() - interval '45 minutes' where item_id in ('dddddddd-0000-0000-0000-000000000007', 'dddddddd-0000-0000-0000-000000000008');
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select ok(public.tap_err(format($$select public.report_no_show(%L)$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000007'))) = 'ok', 'a no-show can be reported after 30 minutes');
select ok(public.tap_err(format($$select public.report_no_show(%L)$$, (select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000007'))) = 'already_reported', 'the same no-show cannot be reported twice');
select public.report_no_show((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000008'));
reset role;
-- The accused disputes the second report, and ignores the first.
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select public.dispute_no_show((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000008'));
reset role;
update public.order_events set created_at = now() - interval '25 hours' where event = 'no_show_reported';

select ok((public.process_order_timers() ->> 'strikes_issued')::int = 1, 'the timer issues one no-show strike');
select ok((select status = 'cancelled' and cancel_reason = 'no_show' from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000007'), 'an undisputed no-show cancels the order');
select ok((select count(*) = 1 from public.strikes where user_id = 'cccccccc-0000-0000-0000-00000000000c' and reason = 'no_show'), 'the absent buyer gets the strike');
select ok((select status = 'awaiting_meetup' from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000008'), 'a disputed no-show is left for a moderator');
select ok((select count(*) = 1 from public.notifications where user_id = 'cccccccc-0000-0000-0000-00000000000e' and kind = 'no_show_disputed'), 'moderators are told about the disputed no-show');

-- Timers -------------------------------------------------------------------------------------
select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select public.buy_now('dddddddd-0000-0000-0000-000000000009');
select public.buy_now('dddddddd-0000-0000-0000-00000000000a', (select id from public.meetup_spots where name = 'Maerua Mall'), public.tap_slot(10));
reset role;
update public.orders set confirm_by = now() - interval '1 hour' where item_id in ('dddddddd-0000-0000-0000-000000000009', 'dddddddd-0000-0000-0000-00000000000a');
select public.process_order_timers();
select ok((select status = 'cancelled' and cancel_reason = 'no_meetup_proposed' from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000009'), 'an order nobody scheduled is cancelled after 24 hours');
select ok((select status = 'cancelled' and cancel_reason = 'seller_did_not_confirm' from public.orders where item_id = 'dddddddd-0000-0000-0000-00000000000a'), 'an order the seller never confirmed is cancelled after 24 hours');
select ok((select count(*) = 1 from public.strikes where reason in ('no_show')) and (select status = 'active' from public.items where id = 'dddddddd-0000-0000-0000-000000000009'), 'unconfirmed orders cancel without strikes and relist the item');

select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select public.make_offer('dddddddd-0000-0000-0000-000000000009', 15000);
reset role;
update public.offers set expires_at = now() - interval '1 minute' where item_id = 'dddddddd-0000-0000-0000-000000000009';
select public.process_order_timers();
select ok((select status = 'expired' from public.offers where item_id = 'dddddddd-0000-0000-0000-000000000009'), 'offers expire after their deadline');

-- Strike ladder: a second strike pauses trading for 72 hours.
select public.tap_as('cccccccc-0000-0000-0000-00000000000c');
set local role authenticated;
select public.buy_now('dddddddd-0000-0000-0000-000000000006', (select id from public.meetup_spots where name = 'Maerua Mall'), public.tap_slot(10));
reset role;
select public.tap_as('cccccccc-0000-0000-0000-00000000000a');
set local role authenticated;
select public.confirm_meetup((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000006'));
select public.cancel_order((select id from public.orders where item_id = 'dddddddd-0000-0000-0000-000000000006'), 'seller_cancelled');
reset role;
select ok((select restricted_until > now() + interval '71 hours' from public.users where id = 'cccccccc-0000-0000-0000-00000000000a'), 'two strikes pause trading for 72 hours');
select public.tap_as('cccccccc-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err($$select public.buy_now('dddddddd-0000-0000-0000-000000000002')$$) = 'seller_unavailable', 'nobody can buy from a seller who is paused');
reset role;

select * from finish();
rollback;
