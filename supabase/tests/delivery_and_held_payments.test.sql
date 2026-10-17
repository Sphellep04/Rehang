begin;
select plan(31);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('2a2a2a2a-0000-0000-0000-00000000000a', 'xsel@example.com', now()),
  ('2a2a2a2a-0000-0000-0000-00000000000b', 'xbuy@example.com', now()),
  ('2a2a2a2a-0000-0000-0000-00000000000c', 'xmod@example.com', now());
update public.users set handle = 'x_seller', display_name = 'S', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '2a2a2a2a-0000-0000-0000-00000000000a';
update public.users set handle = 'x_buyer', display_name = 'B', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '2a2a2a2a-0000-0000-0000-00000000000b';
update public.users set handle = 'x_mod', display_name = 'M', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'moderator' where id = '2a2a2a2a-0000-0000-0000-00000000000c';

-- Items 1 to 5 can be posted for N$50; item 6 is meet-up only.
insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, shipping_cents, town_id, status, published_at)
select ('2b2b2b2b-0000-0000-0000-00000000000' || n)::uuid, '2a2a2a2a-0000-0000-0000-00000000000a', 'Postage test item number ' || n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['blue'], 20000, case when n = 6 then null else 5000 end, (select tw.id from public.towns tw where tw.name = 'Windhoek'), 'active', now()
from generate_series(1, 6) n;

update public.app_config set value = '1000'::jsonb where key = 'buyer_fee_cents';
update public.app_config set value = '1000'::jsonb where key = 'commission_bps';

select public.tap_as('2a2a2a2a-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err($$select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000001', 'courier', '12 Example Street, Windhoek')$$) = 'delivery_not_available', 'delivery is refused while the switches are off');
reset role;

update public.app_config set value = 'true'::jsonb where key in ('courier_enabled', 'payments_enabled');

set local role authenticated;
select ok(public.tap_err($$select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000006', 'courier', '12 Example Street, Windhoek')$$) = 'delivery_not_offered', 'a meet-up only item cannot be posted');
select ok(public.tap_err($$select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000001', 'courier', 'short')$$) = 'address_length', 'an address needs some detail');
select ok(public.tap_err($$select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000001', 'meetup', '12 Example Street, Windhoek')$$) = 'invalid_method', 'only courier or post are accepted');
select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000001', 'courier', '12 Example Street, Windhoek');
select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000002', 'post', '12 Example Street, Windhoek');
select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000003', 'post', '12 Example Street, Windhoek');
select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000004', 'courier', '12 Example Street, Windhoek');
select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000005', 'courier', '12 Example Street, Windhoek');
select ok(public.tap_err($$select public.buy_with_delivery('2b2b2b2b-0000-0000-0000-000000000001', 'courier', '12 Example Street, Windhoek')$$) = 'item_unavailable', 'a held item cannot be bought twice');
reset role;

create temp table o as select substr(i::text, 36)::int as n, ord.id from public.orders ord cross join lateral (select item_id::text as i) x where ord.buyer_id = '2a2a2a2a-0000-0000-0000-00000000000b';
grant select on o to authenticated;
select ok((select status = 'awaiting_payment' and amount_cents = 20000 and shipping_cents = 5000 and buyer_fee_cents = 1000 and commission_cents = 2000 and public.order_total_cents(orders) = 26000 from public.orders where id = (select id from o where n = 1)), 'the order waits for payment and the total is item plus postage plus fee');
select ok((select status = 'reserved' from public.items where id = '2b2b2b2b-0000-0000-0000-000000000001'), 'the item is held while payment is awaited');

-- Payment arrives
select ok(public.record_payment((select id from o where n = 1), 'mock', 'pay-1-short', 'capture', 'succeeded', 25000) = 'amount_mismatch', 'a payment of the wrong amount does not release the order');
select ok((select status = 'awaiting_payment' from public.orders where id = (select id from o where n = 1)), 'the order is still waiting after a wrong amount');
select ok(public.record_payment((select id from o where n = 1), 'mock', 'pay-1', 'capture', 'succeeded', 26000) = 'paid', 'the right amount marks the order paid');
select ok(public.record_payment((select id from o where n = 1), 'mock', 'pay-1', 'capture', 'succeeded', 26000) = 'duplicate', 'the same payment reported twice is ignored');
select ok((select status = 'paid_held' and paid_at is not null and ship_by > now() + interval '2 days' and ship_by < now() + interval '4 days' from public.orders where id = (select id from o where n = 1)), 'a paid order must be posted within three days');

set local role authenticated;
select ok(public.tap_err($$select public.record_payment((select id from o where n = 1), 'mock', 'x', 'capture', 'succeeded', 1)$$) like 'permission denied%', 'signed-in people cannot record payments');
select public.tap_as('2a2a2a2a-0000-0000-0000-00000000000b');
select ok(public.tap_err($$select public.mark_shipped((select id from o where n = 1), 'TRACK12345')$$) = 'order_not_found', 'only the seller can mark it posted');
select public.tap_as('2a2a2a2a-0000-0000-0000-00000000000a');
select ok(public.tap_err($$select public.mark_shipped((select id from o where n = 1), 'ab')$$) = 'tracking_length', 'a tracking number needs some length');
select public.mark_shipped((select id from o where n = 1), 'TRACK12345');
select public.tap_as('2a2a2a2a-0000-0000-0000-00000000000b');
select public.confirm_received((select id from o where n = 1));
reset role;
select ok((select status = 'delivered' and confirm_by > now() + interval '47 hours' and tracking_number = 'TRACK12345' from public.orders where id = (select id from o where n = 1)), 'the buyer has 48 hours after delivery');
set local role authenticated;
select public.accept_delivery((select id from o where n = 1));
reset role;
select ok((select status = 'completed' from public.orders where id = (select id from o where n = 1)) and (select status = 'sold' from public.items where id = '2b2b2b2b-0000-0000-0000-000000000001'), 'accepting completes the order and sells the item');
select ok((select amount_cents = 23000 and status = 'pending' from public.payouts where order_id = (select id from o where n = 1)), 'a payout is queued: item plus postage minus commission');
select ok(public.settle_money_movement((select id from o where n = 1), 'payout', 'succeeded', 'po-1') = 'settled', 'the adapter can settle a payout');
select ok((select status = 'paid' and paid_at is not null from public.payouts where order_id = (select id from o where n = 1)), 'the payout shows as paid');

-- Order 2: paid, never posted
select public.record_payment((select id from o where n = 2), 'mock', 'pay-2', 'capture', 'succeeded', 26000);
update public.orders set ship_by = now() - interval '1 minute' where id = (select id from o where n = 2);
-- Order 3: never paid. Order 4: posted long ago. Order 5: posted, then a problem
update public.orders set confirm_by = now() - interval '1 minute' where id = (select id from o where n = 3);
select public.record_payment((select id from o where n = 4), 'mock', 'pay-4', 'capture', 'succeeded', 26000);
select public.record_payment((select id from o where n = 5), 'mock', 'pay-5', 'capture', 'succeeded', 26000);
update public.orders set status = 'shipped', shipped_at = now() - interval '15 days', tracking_number = 'OLD4444' where id = (select id from o where n = 4);
update public.orders set status = 'shipped', shipped_at = now(), tracking_number = 'NEW5555' where id = (select id from o where n = 5);
select public.process_delivery_timers();
select ok((select status = 'cancelled' and cancel_reason = 'seller_did_not_ship' from public.orders where id = (select id from o where n = 2)) and exists (select 1 from public.strikes where order_id = (select id from o where n = 2)), 'an order not posted in time is cancelled and the seller gets a strike');
select ok((select amount_cents = 26000 and status = 'pending' from public.payment_transactions where order_id = (select id from o where n = 2) and kind = 'refund'), 'a refund of the full amount is queued');
select ok((select status = 'cancelled' and cancel_reason = 'payment_timeout' from public.orders where id = (select id from o where n = 3)) and (select status = 'active' from public.items where id = '2b2b2b2b-0000-0000-0000-000000000003'), 'an unpaid order times out and the item goes back on sale');
select ok(public.record_payment((select id from o where n = 3), 'mock', 'pay-3-late', 'capture', 'succeeded', 26000) = 'late_refund_queued', 'money that arrives after the timeout is accepted');
select ok(exists (select 1 from public.payment_transactions where order_id = (select id from o where n = 3) and kind = 'refund' and status = 'pending'), 'and queued for refund');
select ok(public.settle_money_movement((select id from o where n = 2), 'refund', 'succeeded', 're-2') = 'settled' and public.settle_money_movement((select id from o where n = 2), 'refund', 'succeeded', 're-2') = 'nothing_pending', 'a refund is settled once');
select ok((select status = 'delivered' and confirm_by > now() + interval '47 hours' from public.orders where id = (select id from o where n = 4)), 'a parcel posted 15 days ago counts as delivered and starts the confirm window');
update public.orders set confirm_by = now() - interval '1 minute' where id = (select id from o where n = 4);
select public.process_delivery_timers();
select ok((select status = 'completed' from public.orders where id = (select id from o where n = 4)) and exists (select 1 from public.payouts where order_id = (select id from o where n = 4)), 'silence for 48 hours completes the order and queues the payout');

-- Order 5: the buyer reports it never came
select public.tap_as('2a2a2a2a-0000-0000-0000-00000000000b');
set local role authenticated;
select public.open_dispute((select id from o where n = 5), 'not_received', 'The tracking has not moved for a week');
reset role;
select ok((select status = 'disputed' from public.orders where id = (select id from o where n = 5)), 'a posted order can be reported and goes to the moderators');
select public.tap_as('2a2a2a2a-0000-0000-0000-00000000000c');
set local role authenticated;
select public.decide_dispute((select id from o where n = 5), 'seller_at_fault', 'Tracking shows no movement for seven days');
reset role;
select ok((select status = 'cancelled' from public.orders where id = (select id from o where n = 5)) and exists (select 1 from public.payment_transactions where order_id = (select id from o where n = 5) and kind = 'refund' and amount_cents = 26000), 'a moderator ruling for the buyer refunds them');

update public.app_config set value = 'false'::jsonb where key = 'payments_enabled';
select ok(public.tap_err($$select public.record_payment((select id from o where n = 1), 'mock', 'pay-off', 'capture', 'succeeded', 1)$$) = 'payments_off', 'payments are refused when the switch is off');

select * from finish();
rollback;
