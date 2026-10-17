-- Delivery orders with held payments (Phase 2). Everything here sits behind two switches in
-- app_config, courier_enabled and payments_enabled, which are both off. No money moves in this
-- file: it records what a payment partner reports and queues the refunds and payouts that the
-- partner's adapter must then carry out. Cash meet-ups are untouched.

insert into public.app_config (key, value) values
  ('ship_within_days', '3'::jsonb),
  ('delivery_confirm_hours', '48'::jsonb),
  ('delivery_wait_days', '14'::jsonb),
  ('payment_window_minutes', '30'::jsonb)
on conflict (key) do nothing;

-- Sellers choose whether an item can be posted and what they charge for it. Empty means meet-up only.
alter table public.items add column if not exists shipping_cents bigint check (shipping_cents is null or (shipping_cents >= 0 and shipping_cents <= 100000));
grant select (shipping_cents) on public.items to anon, authenticated;
grant insert (shipping_cents) on public.items to authenticated;
grant update (shipping_cents) on public.items to authenticated;

alter table public.orders add column if not exists shipping_cents bigint not null default 0 check (shipping_cents >= 0);
alter table public.orders add column if not exists delivery_address text check (delivery_address is null or char_length(delivery_address) <= 300);
alter table public.orders add column if not exists paid_at timestamptz;
alter table public.orders add column if not exists ship_by timestamptz;
alter table public.orders add column if not exists shipped_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders drop constraint if exists orders_tracking_length;
alter table public.orders add constraint orders_tracking_length check (tracking_number is null or char_length(tracking_number) between 3 and 60);

revoke select on public.orders from authenticated;
grant select (
  id, item_id, bundle_offer_id, buyer_id, seller_id, offer_id, amount_cents, commission_cents,
  buyer_fee_cents, status, delivery_method, meetup_spot_id, meetup_at, fulfilment_point_id,
  code_attempts, tracking_number, payment_ref, confirm_by, completed_at, cancelled_at,
  cancel_reason, created_at, meetup_confirmed_at,
  shipping_cents, delivery_address, paid_at, ship_by, shipped_at, delivered_at
) on public.orders to authenticated;

create or replace function public.config_flag(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_config where key = p_key), false)
$$;
revoke all on function public.config_flag(text) from public, anon, authenticated;

-- The amount the buyer pays: item, postage and the buyer fee.
create or replace function public.order_total_cents(p_order public.orders)
returns bigint
language sql
immutable
set search_path = ''
as $$ select p_order.amount_cents + p_order.shipping_cents + p_order.buyer_fee_cents $$;
revoke all on function public.order_total_cents(public.orders) from public, anon, authenticated;

-- Buyer asks to have an item posted. The order waits for payment; the item is held meanwhile.
create or replace function public.buy_with_delivery(p_item uuid, p_method text, p_address text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
  addr text := btrim(coalesce(p_address, ''));
  new_order uuid;
  window_minutes integer := public.config_bigint('payment_window_minutes', 30)::integer;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not (public.config_flag('courier_enabled') and public.config_flag('payments_enabled')) then
    raise exception 'delivery_not_available' using errcode = 'P0001';
  end if;
  if p_method not in ('courier', 'post') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  if char_length(addr) < 10 or char_length(addr) > 300 then
    raise exception 'address_length' using errcode = 'P0001';
  end if;
  select * into it from public.items where id = p_item for update;
  if not found or it.status <> 'active' then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;
  if it.shipping_cents is null then
    raise exception 'delivery_not_offered' using errcode = 'P0001';
  end if;
  perform public.assert_can_buy(me, it.seller_id, it.price_cents);

  insert into public.orders (item_id, buyer_id, seller_id, amount_cents, commission_cents, buyer_fee_cents, shipping_cents,
                             status, delivery_method, delivery_address, confirm_by)
  values (p_item, me, it.seller_id, it.price_cents,
          (it.price_cents * public.config_bigint('commission_bps', 0)) / 10000,
          public.config_bigint('buyer_fee_cents', 0), it.shipping_cents,
          'awaiting_payment', p_method::public.delivery_method, addr, now() + make_interval(mins => window_minutes))
  returning id into new_order;

  update public.items set status = 'reserved' where id = p_item;
  update public.offers set status = 'declined', responded_at = now() where item_id = p_item and status = 'open';
  perform public.log_order_event(new_order, me, 'created', jsonb_build_object('amount_cents', it.price_cents, 'method', p_method));
  return new_order;
end;
$$;

-- Called by the payment webhook (service role only). Safe to repeat: a reference already seen is ignored.
create or replace function public.record_payment(
  p_order uuid, p_provider text, p_reference text, p_kind text, p_status text, p_amount_cents bigint, p_metadata jsonb default '{}'::jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord public.orders%rowtype;
  ship_days integer := public.config_bigint('ship_within_days', 3)::integer;
  inserted uuid;
begin
  if not public.config_flag('payments_enabled') then
    raise exception 'payments_off' using errcode = 'P0001';
  end if;
  if p_kind not in ('authorization', 'capture') or p_status not in ('pending', 'succeeded', 'failed', 'reversed') then
    raise exception 'invalid_payment' using errcode = 'P0001';
  end if;
  select * into ord from public.orders where id = p_order for update;
  if not found then
    return 'order_not_found';
  end if;

  insert into public.payment_transactions (order_id, provider, provider_reference, kind, status, amount_cents, metadata)
  values (p_order, p_provider, p_reference, p_kind::public.payment_transaction_kind, p_status::public.payment_transaction_status, p_amount_cents, coalesce(p_metadata, '{}'::jsonb))
  on conflict (provider_reference) do nothing
  returning id into inserted;
  if inserted is null then
    return 'duplicate';
  end if;

  if p_kind <> 'capture' then
    return 'recorded';
  end if;
  if p_status = 'failed' then
    perform public.log_order_event(p_order, null, 'payment_failed', jsonb_build_object('reference', p_reference));
    perform public.notify_user(ord.buyer_id, 'payment_failed', jsonb_build_object('order_id', p_order));
    return 'failed_recorded';
  end if;
  if p_status <> 'succeeded' then
    return 'recorded';
  end if;

  if ord.status = 'awaiting_payment' then
    if p_amount_cents <> public.order_total_cents(ord) then
      perform public.log_order_event(p_order, null, 'payment_amount_mismatch', jsonb_build_object('paid', p_amount_cents, 'due', public.order_total_cents(ord)));
      insert into public.notifications (user_id, kind, payload)
      select u.id, 'payment_mismatch', jsonb_build_object('order_id', p_order)
      from public.users u where u.role in ('moderator', 'admin') and u.status = 'active';
      return 'amount_mismatch';
    end if;
    update public.orders
      set status = 'paid_held', paid_at = now(), payment_ref = p_reference, ship_by = now() + make_interval(days => ship_days), confirm_by = null
      where id = p_order;
    perform public.log_order_event(p_order, null, 'paid', jsonb_build_object('reference', p_reference));
    perform public.notify_user(ord.seller_id, 'order_paid', jsonb_build_object('order_id', p_order));
    perform public.notify_user(ord.buyer_id, 'order_paid', jsonb_build_object('order_id', p_order));
    return 'paid';
  end if;

  -- Money arrived for an order that is no longer waiting for it (it timed out or was cancelled): give it back.
  insert into public.payment_transactions (order_id, provider, provider_reference, kind, status, amount_cents, metadata)
  values (p_order, p_provider, 'refund:' || p_order::text || ':late:' || p_reference, 'refund', 'pending', p_amount_cents, jsonb_build_object('reason', 'late_payment'))
  on conflict (provider_reference) do nothing;
  perform public.log_order_event(p_order, null, 'late_payment_refund_queued', jsonb_build_object('reference', p_reference));
  perform public.notify_user(ord.buyer_id, 'refund_pending', jsonb_build_object('order_id', p_order));
  return 'late_refund_queued';
end;
$$;

-- Called by the payment adapter after it has paid a seller out or refunded a buyer (service role only).
create or replace function public.settle_money_movement(p_order uuid, p_kind text, p_status text, p_reference text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_kind not in ('refund', 'payout') or p_status not in ('succeeded', 'failed') then
    raise exception 'invalid_payment' using errcode = 'P0001';
  end if;
  if p_kind = 'payout' then
    update public.payouts
      set status = case when p_status = 'succeeded' then 'paid'::public.payout_status else 'failed'::public.payout_status end,
          provider_reference = p_reference,
          paid_at = case when p_status = 'succeeded' then now() end
      where order_id = p_order and status in ('pending', 'processing');
  else
    update public.payment_transactions
      set status = p_status::public.payment_transaction_status, metadata = metadata || jsonb_build_object('settled_reference', p_reference)
      where order_id = p_order and kind = 'refund' and status = 'pending';
  end if;
  get diagnostics n = row_count;
  if n = 0 then
    return 'nothing_pending';
  end if;
  perform public.log_order_event(p_order, null, p_kind || '_' || p_status, jsonb_build_object('reference', p_reference));
  return 'settled';
end;
$$;

-- Queues the money movements when an order that was paid ends. The partner's adapter carries them out.
create or replace function public.orders_money_movements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cap public.payment_transactions%rowtype;
begin
  if new.status = old.status or new.status not in ('completed', 'cancelled') then
    return new;
  end if;
  select * into cap from public.payment_transactions
    where order_id = new.id and kind = 'capture' and status = 'succeeded' order by created_at limit 1;
  if not found then
    return new;
  end if;
  if new.status = 'completed' then
    insert into public.payouts (order_id, seller_id, provider, amount_cents, status)
    values (new.id, new.seller_id, cap.provider, greatest(new.amount_cents + new.shipping_cents - new.commission_cents, 0), 'pending')
    on conflict (order_id) do nothing;
    insert into public.notifications (user_id, kind, payload) values (new.seller_id, 'payout_pending', jsonb_build_object('order_id', new.id));
  else
    insert into public.payment_transactions (order_id, provider, provider_reference, kind, status, amount_cents, metadata)
    values (new.id, cap.provider, 'refund:' || new.id::text, 'refund', 'pending', cap.amount_cents, jsonb_build_object('reason', new.cancel_reason))
    on conflict (provider_reference) do nothing;
    insert into public.notifications (user_id, kind, payload) values (new.buyer_id, 'refund_pending', jsonb_build_object('order_id', new.id));
  end if;
  return new;
end;
$$;
drop trigger if exists orders_money_movements on public.orders;
create trigger orders_money_movements after update of status on public.orders for each row execute function public.orders_money_movements();

-- Seller adds the tracking number once the parcel is handed over.
create or replace function public.mark_shipped(p_order uuid, p_tracking text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
  track text := btrim(coalesce(p_tracking, ''));
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or me is null or ord.seller_id <> me then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'paid_held' then
    raise exception 'order_not_ready' using errcode = 'P0001';
  end if;
  if char_length(track) < 3 or char_length(track) > 60 then
    raise exception 'tracking_length' using errcode = 'P0001';
  end if;
  update public.orders set status = 'shipped', tracking_number = track, shipped_at = now(), ship_by = null where id = p_order;
  perform public.log_order_event(p_order, me, 'shipped', jsonb_build_object('tracking', track));
  perform public.notify_user(ord.buyer_id, 'order_shipped', jsonb_build_object('order_id', p_order));
end;
$$;

-- Buyer says the parcel has arrived. The 48 hour window to confirm or report a problem starts here.
create or replace function public.confirm_received(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
  hours integer := public.config_bigint('delivery_confirm_hours', 48)::integer;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or me is null or ord.buyer_id <> me then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'shipped' then
    raise exception 'order_not_ready' using errcode = 'P0001';
  end if;
  update public.orders set status = 'delivered', delivered_at = now(), confirm_by = now() + make_interval(hours => hours) where id = p_order;
  perform public.log_order_event(p_order, me, 'delivered');
  perform public.notify_user(ord.seller_id, 'order_delivered', jsonb_build_object('order_id', p_order));
end;
$$;

-- Buyer is happy with the item: the order completes and the seller's payout is queued.
create or replace function public.accept_delivery(p_order uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or me is null or ord.buyer_id <> me then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status not in ('shipped', 'delivered') then
    raise exception 'order_not_ready' using errcode = 'P0001';
  end if;
  update public.orders set status = 'completed', completed_at = now(), delivered_at = coalesce(delivered_at, now()) where id = p_order;
  update public.items set status = 'sold', sold_at = now() where id = ord.item_id;
  perform public.log_order_event(p_order, me, 'accepted');
  perform public.notify_user(ord.seller_id, 'order_completed', jsonb_build_object('order_id', p_order));
  perform public.notify_user(ord.buyer_id, 'order_completed', jsonb_build_object('order_id', p_order));
end;
$$;

-- Run alongside process_order_timers (every five minutes).
create or replace function public.process_delivery_timers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
  unpaid integer := 0;
  unshipped integer := 0;
  auto_delivered integer := 0;
  auto_completed integer := 0;
  hours integer := public.config_bigint('delivery_confirm_hours', 48)::integer;
  wait_days integer := public.config_bigint('delivery_wait_days', 14)::integer;
begin
  for rec in select id from public.orders where status = 'awaiting_payment' and confirm_by < now() loop
    perform public.finish_cancel(rec.id, null, 'payment_timeout', 'system');
    unpaid := unpaid + 1;
  end loop;

  -- Paid but never posted within the time allowed: refund the buyer and strike the seller.
  for rec in select id, seller_id from public.orders where status = 'paid_held' and ship_by < now() loop
    perform public.issue_strike(rec.seller_id, 'seller_cancel', rec.id);
    perform public.finish_cancel(rec.id, null, 'seller_did_not_ship', 'system');
    unshipped := unshipped + 1;
  end loop;

  -- Posted long ago and the buyer never answered: treat as delivered and start the confirm window.
  for rec in select id, seller_id from public.orders where status = 'shipped' and shipped_at < now() - make_interval(days => wait_days) loop
    update public.orders set status = 'delivered', delivered_at = now(), confirm_by = now() + make_interval(hours => hours) where id = rec.id;
    perform public.log_order_event(rec.id, null, 'delivered', jsonb_build_object('automatic', true));
    auto_delivered := auto_delivered + 1;
  end loop;

  -- Confirm window over with no problem reported: complete.
  for rec in select id, item_id, buyer_id, seller_id from public.orders where status = 'delivered' and confirm_by < now() loop
    update public.orders set status = 'completed', completed_at = now() where id = rec.id;
    update public.items set status = 'sold', sold_at = now() where id = rec.item_id;
    perform public.log_order_event(rec.id, null, 'accepted', jsonb_build_object('automatic', true));
    perform public.notify_user(rec.seller_id, 'order_completed', jsonb_build_object('order_id', rec.id));
    perform public.notify_user(rec.buyer_id, 'order_completed', jsonb_build_object('order_id', rec.id));
    auto_completed := auto_completed + 1;
  end loop;

  return jsonb_build_object('unpaid_cancelled', unpaid, 'unshipped_cancelled', unshipped, 'auto_delivered', auto_delivered, 'auto_completed', auto_completed);
end;
$$;

revoke all on function public.record_payment(uuid, text, text, text, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.settle_money_movement(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.process_delivery_timers() from public, anon, authenticated;
revoke all on function public.orders_money_movements() from public, anon, authenticated;
revoke all on function public.buy_with_delivery(uuid, text, text), public.mark_shipped(uuid, text),
  public.confirm_received(uuid), public.accept_delivery(uuid) from public, anon;
grant execute on function public.buy_with_delivery(uuid, text, text), public.mark_shipped(uuid, text),
  public.confirm_received(uuid), public.accept_delivery(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rehang-delivery-timers', '*/5 * * * *', 'select public.process_delivery_timers()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;

-- Disputes also cover shipped orders (reason 'not_received').
alter table public.disputes drop constraint if exists disputes_reason_check;
alter table public.disputes add constraint disputes_reason_check
  check (reason in ('no_show', 'not_as_described', 'unsafe', 'code_locked', 'other', 'not_received'));

create or replace function public.open_dispute(p_order uuid, p_reason text, p_statement text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
  other uuid;
  text_in text := btrim(coalesce(p_statement, ''));
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if p_reason not in ('not_as_described', 'unsafe', 'other', 'not_received') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;
  if char_length(text_in) < 10 or char_length(text_in) > 500 then
    raise exception 'statement_length' using errcode = 'P0001';
  end if;
  select * into ord from public.orders where id = p_order for update;
  if not found or me not in (ord.buyer_id, ord.seller_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  -- Either the meet-up time has come, or the order was completed in the last 7 days.
  if not (
    (ord.status = 'awaiting_meetup' and ord.meetup_confirmed_at is not null and ord.meetup_at <= now())
    or (ord.status = 'completed' and ord.completed_at > now() - interval '7 days')
    or ord.status in ('shipped', 'delivered')
  ) then
    raise exception 'order_not_open' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.disputes d where d.order_id = p_order) then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;

  other := case when me = ord.buyer_id then ord.seller_id else ord.buyer_id end;
  insert into public.disputes (order_id, opened_by, reason, buyer_statement, seller_statement)
  values (p_order, me, p_reason,
          case when me = ord.buyer_id then text_in end,
          case when me = ord.seller_id then text_in end);
  if ord.status in ('awaiting_meetup', 'shipped', 'delivered') then
    update public.orders set status = 'disputed' where id = p_order;
  end if;
  perform public.log_order_event(p_order, me, 'dispute_opened', jsonb_build_object('reason', p_reason));
  perform public.notify_user(other, 'dispute_opened', jsonb_build_object('order_id', p_order));
  insert into public.notifications (user_id, kind, payload)
  select u.id, 'dispute_opened', jsonb_build_object('order_id', p_order)
  from public.users u where u.role in ('moderator', 'admin') and u.status = 'active' and u.id not in (ord.buyer_id, ord.seller_id);
end;
$$;

create or replace function public.decide_dispute(p_order uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  ord public.orders%rowtype;
  d public.disputes%rowtype;
  note_in text := btrim(coalesce(p_note, ''));
  reason public.strike_reason;
begin
  if p_decision not in ('seller_at_fault', 'buyer_at_fault', 'no_fault', 'completed') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if char_length(note_in) < 10 or char_length(note_in) > 500 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select * into ord from public.orders where id = p_order for update;
  if not found then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if me in (ord.buyer_id, ord.seller_id) then
    raise exception 'cannot_review_own' using errcode = 'P0001';
  end if;
  if ord.status not in ('awaiting_meetup', 'disputed', 'completed', 'shipped', 'delivered', 'paid_held') then
    raise exception 'order_not_open' using errcode = 'P0001';
  end if;
  if p_decision = 'completed' and ord.status = 'completed' then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;

  -- Locked codes have no dispute yet, so one is made on the spot.
  insert into public.disputes (order_id, opened_by, reason)
  values (p_order, me, case when ord.code_attempts >= 5 then 'code_locked' else 'other' end)
  on conflict (order_id) do nothing;
  select * into d from public.disputes where order_id = p_order for update;
  if d.decided_at is not null then
    raise exception 'report_already_handled' using errcode = 'P0001';
  end if;

  reason := case when d.reason = 'no_show' then 'no_show'::public.strike_reason else 'other'::public.strike_reason end;
  if p_decision = 'seller_at_fault' then
    perform public.issue_strike(ord.seller_id, reason, p_order);
  elsif p_decision = 'buyer_at_fault' then
    perform public.issue_strike(ord.buyer_id, reason, p_order);
  end if;

  if p_decision = 'completed' then
    update public.orders set status = 'completed', completed_at = now() where id = p_order;
    if ord.item_id is not null then
      update public.items set status = 'sold', sold_at = now() where id = ord.item_id;
    end if;
  elsif ord.status <> 'completed' then
    perform public.finish_cancel(p_order, me, 'dispute_' || p_decision, 'moderator');
  end if;

  update public.disputes set decision = p_decision, decision_note = note_in, decided_by = me, decided_at = now() where id = d.id;
  perform public.log_order_event(p_order, me, 'dispute_decided', jsonb_build_object('decision', p_decision));
  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, 'dispute_' || p_decision, 'order', p_order, note_in);
  perform public.notify_user(ord.buyer_id, 'dispute_decided', jsonb_build_object('order_id', p_order, 'decision', p_decision));
  perform public.notify_user(ord.seller_id, 'dispute_decided', jsonb_build_object('order_id', p_order, 'decision', p_decision));
end;
$$;
