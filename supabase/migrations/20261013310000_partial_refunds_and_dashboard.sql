-- Partial refunds for orders that were paid online, and the seller dashboard.

alter table public.orders add column if not exists refunded_cents bigint not null default 0 check (refunded_cents >= 0);
revoke select on public.orders from authenticated;
grant select (
  id, item_id, bundle_offer_id, buyer_id, seller_id, offer_id, amount_cents, commission_cents,
  buyer_fee_cents, status, delivery_method, meetup_spot_id, meetup_at, fulfilment_point_id,
  code_attempts, tracking_number, payment_ref, confirm_by, completed_at, cancelled_at,
  cancel_reason, created_at, meetup_confirmed_at,
  shipping_cents, delivery_address, paid_at, ship_by, shipped_at, delivered_at, refunded_cents
) on public.orders to authenticated;

-- The seller's payout now takes any partial refund off.
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
    values (new.id, new.seller_id, cap.provider, greatest(new.amount_cents + new.shipping_cents - new.commission_cents - new.refunded_cents, 0), 'pending')
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

-- A moderator gives the buyer part of their money back and completes the order. The seller is paid the
-- rest. For a full refund use decide_dispute (seller at fault), which cancels the order.
create or replace function public.partial_refund(p_order uuid, p_refund_cents bigint, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  ord public.orders%rowtype;
  cap public.payment_transactions%rowtype;
  d public.disputes%rowtype;
  note_in text := btrim(coalesce(p_note, ''));
begin
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
  if ord.status not in ('disputed', 'shipped', 'delivered') then
    raise exception 'order_not_open' using errcode = 'P0001';
  end if;
  select * into cap from public.payment_transactions
    where order_id = p_order and kind = 'capture' and status = 'succeeded' order by created_at limit 1;
  if not found then
    raise exception 'not_paid_online' using errcode = 'P0001';
  end if;
  if p_refund_cents is null or p_refund_cents < 100 or p_refund_cents >= ord.amount_cents + ord.shipping_cents then
    raise exception 'invalid_refund_amount' using errcode = 'P0001';
  end if;

  insert into public.disputes (order_id, opened_by, reason) values (p_order, me, 'other') on conflict (order_id) do nothing;
  select * into d from public.disputes where order_id = p_order for update;
  if d.decided_at is not null then
    raise exception 'report_already_handled' using errcode = 'P0001';
  end if;

  insert into public.payment_transactions (order_id, provider, provider_reference, kind, status, amount_cents, metadata)
  values (p_order, cap.provider, 'refund:' || p_order::text || ':partial', 'refund', 'pending', p_refund_cents, jsonb_build_object('reason', 'partial_refund'));
  -- The refund is on the order before it completes, so the payout trigger sees it.
  update public.orders set refunded_cents = p_refund_cents where id = p_order;
  update public.orders set status = 'completed', completed_at = now() where id = p_order;
  if ord.item_id is not null then
    update public.items set status = 'sold', sold_at = now() where id = ord.item_id;
  end if;
  update public.disputes set decision = 'partial_refund', decision_note = note_in, decided_by = me, decided_at = now() where id = d.id;
  perform public.log_order_event(p_order, me, 'dispute_decided', jsonb_build_object('decision', 'partial_refund', 'refund_cents', p_refund_cents));
  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, 'dispute_partial_refund', 'order', p_order, note_in);
  perform public.notify_user(ord.buyer_id, 'dispute_decided', jsonb_build_object('order_id', p_order, 'decision', 'partial_refund'));
  perform public.notify_user(ord.seller_id, 'dispute_decided', jsonb_build_object('order_id', p_order, 'decision', 'partial_refund'));
  perform public.notify_user(ord.buyer_id, 'refund_pending', jsonb_build_object('order_id', p_order));
end;
$$;
revoke all on function public.partial_refund(uuid, bigint, text) from public, anon;
grant execute on function public.partial_refund(uuid, bigint, text) to authenticated;

-- The seller dashboard: what needs doing, money, the last eight weeks, and listings. Only the caller's own data.
create or replace function public.seller_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  today date := (now() at time zone 'Africa/Windhoek')::date;
  this_week timestamp := date_trunc('week', now() at time zone 'Africa/Windhoek');
  result jsonb;
begin
  if me is null then
    raise exception 'sign_in_required' using errcode = 'P0001';
  end if;
  select jsonb_build_object(
    'todo', jsonb_build_object(
      'confirm_meetup', (select count(*) from public.orders o where o.seller_id = me and o.status = 'awaiting_meetup' and o.meetup_at is not null and o.meetup_confirmed_at is null),
      'to_post', (select count(*) from public.orders o where o.seller_id = me and o.status = 'paid_held'),
      'offers_to_answer', (select count(*) from public.offers f join public.items i on i.id = f.item_id where i.seller_id = me and f.status = 'open' and not f.made_by_seller and f.expires_at > now()),
      'disputes_to_answer', (select count(*) from public.disputes d join public.orders o on o.id = d.order_id where o.seller_id = me and d.decided_at is null and d.seller_statement is null and d.opened_by <> me),
      'meetups_today', (select count(*) from public.orders o where o.seller_id = me and o.status = 'awaiting_meetup' and o.meetup_confirmed_at is not null and (o.meetup_at at time zone 'Africa/Windhoek')::date = today)
    ),
    'money', jsonb_build_object(
      'sold_30d_cents', coalesce((select sum(o.amount_cents + o.shipping_cents - o.refunded_cents) from public.orders o where o.seller_id = me and o.status = 'completed' and o.completed_at > now() - interval '30 days'), 0),
      'commission_30d_cents', coalesce((select sum(o.commission_cents) from public.orders o where o.seller_id = me and o.status = 'completed' and o.completed_at > now() - interval '30 days'), 0),
      'sold_total_cents', coalesce((select sum(o.amount_cents + o.shipping_cents - o.refunded_cents) from public.orders o where o.seller_id = me and o.status = 'completed'), 0),
      'payout_pending_cents', coalesce((select sum(p.amount_cents) from public.payouts p where p.seller_id = me and p.status in ('pending', 'processing')), 0),
      'paid_out_cents', coalesce((select sum(p.amount_cents) from public.payouts p where p.seller_id = me and p.status = 'paid'), 0),
      'refunded_30d_cents', coalesce((select sum(o.refunded_cents) from public.orders o where o.seller_id = me and o.status = 'completed' and o.completed_at > now() - interval '30 days'), 0)
    ),
    'weeks', (
      select coalesce(jsonb_agg(jsonb_build_object('week_start', w.d::date, 'sales', coalesce(s.n, 0), 'sold_cents', coalesce(s.g, 0)) order by w.d), '[]'::jsonb)
      from generate_series(this_week - interval '7 weeks', this_week, interval '1 week') as w(d)
      left join (
        select date_trunc('week', o.completed_at at time zone 'Africa/Windhoek') as wk, count(*) as n, sum(o.amount_cents + o.shipping_cents - o.refunded_cents) as g
        from public.orders o
        where o.seller_id = me and o.status = 'completed' and o.completed_at > now() - interval '9 weeks'
        group by 1
      ) s on s.wk = w.d
    ),
    'listings', jsonb_build_object(
      'active', (select count(*) from public.items i where i.seller_id = me and i.status = 'active'),
      'reserved', (select count(*) from public.items i where i.seller_id = me and i.status = 'reserved'),
      'drafts', (select count(*) from public.items i where i.seller_id = me and i.status in ('draft', 'awaiting_verification')),
      'sold', (select count(*) from public.items i where i.seller_id = me and i.status = 'sold'),
      'given', (select count(*) from public.items i where i.seller_id = me and i.status = 'donated')
    ),
    'top_items', coalesce((
      select jsonb_agg(t order by t.views_7d desc, t.saves desc)
      from (
        select i.id, i.title, i.price_cents,
          coalesce((select sum(v.views) from public.item_views v where v.item_id = i.id and v.day > today - 7), 0) as views_7d,
          (select count(*) from public.favourites f where f.item_id = i.id) as saves
        from public.items i where i.seller_id = me and i.status = 'active'
        order by 4 desc, 5 desc limit 5
      ) t), '[]'::jsonb),
    'rating', (select jsonb_build_object('average', round(avg(r.rating)::numeric, 1), 'count', count(*)) from public.reviews r where r.reviewee_id = me)
  ) into result;
  return result;
end;
$$;
revoke all on function public.seller_dashboard() from public, anon;
grant execute on function public.seller_dashboard() to authenticated;
