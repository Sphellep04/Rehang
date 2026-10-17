-- Order problems and disputes. People can report a problem, the other side can answer, and a
-- moderator decides. Nothing here moves money: payment is in cash at the meet-up.

alter table public.disputes drop constraint if exists disputes_decision_check;
alter table public.disputes add constraint disputes_decision_check
  check (decision is null or decision in ('refund', 'partial_refund', 'release', 'seller_at_fault', 'buyer_at_fault', 'no_fault', 'completed'));
alter table public.disputes drop constraint if exists disputes_reason_check;
alter table public.disputes add constraint disputes_reason_check
  check (reason in ('no_show', 'not_as_described', 'unsafe', 'code_locked', 'other'));
alter table public.disputes add constraint disputes_statement_length
  check ((buyer_statement is null or char_length(buyer_statement) <= 500) and (seller_statement is null or char_length(seller_statement) <= 500) and (decision_note is null or char_length(decision_note) <= 500));

-- Someone reports a problem with an order.
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
  if p_reason not in ('not_as_described', 'unsafe', 'other') then
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
  if ord.status = 'awaiting_meetup' then
    update public.orders set status = 'disputed' where id = p_order;
  end if;
  perform public.log_order_event(p_order, me, 'dispute_opened', jsonb_build_object('reason', p_reason));
  perform public.notify_user(other, 'dispute_opened', jsonb_build_object('order_id', p_order));
  insert into public.notifications (user_id, kind, payload)
  select u.id, 'dispute_opened', jsonb_build_object('order_id', p_order)
  from public.users u where u.role in ('moderator', 'admin') and u.status = 'active' and u.id not in (ord.buyer_id, ord.seller_id);
end;
$$;

-- The other person gives their side, once.
create or replace function public.respond_to_dispute(p_order uuid, p_statement text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
  d public.disputes%rowtype;
  text_in text := btrim(coalesce(p_statement, ''));
begin
  select * into ord from public.orders where id = p_order;
  if me is null or not found or me not in (ord.buyer_id, ord.seller_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if char_length(text_in) < 10 or char_length(text_in) > 500 then
    raise exception 'statement_length' using errcode = 'P0001';
  end if;
  select * into d from public.disputes where order_id = p_order for update;
  if not found or d.decided_at is not null then
    raise exception 'no_report_to_dispute' using errcode = 'P0001';
  end if;
  if (me = ord.buyer_id and d.buyer_statement is not null) or (me = ord.seller_id and d.seller_statement is not null) then
    raise exception 'already_responded' using errcode = 'P0001';
  end if;
  update public.disputes
  set buyer_statement = case when me = ord.buyer_id then text_in else buyer_statement end,
      seller_statement = case when me = ord.seller_id then text_in else seller_statement end
  where id = d.id;
  perform public.log_order_event(p_order, me, 'dispute_response');
  insert into public.notifications (user_id, kind, payload)
  select u.id, 'dispute_response', jsonb_build_object('order_id', p_order)
  from public.users u where u.role in ('moderator', 'admin') and u.status = 'active' and u.id not in (ord.buyer_id, ord.seller_id);
end;
$$;

-- A disputed no-show now also becomes a dispute a moderator can decide.
create or replace function public.dispute_no_show(p_order uuid)
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
  if not found or me is null or me not in (ord.buyer_id, ord.seller_id) then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'awaiting_meetup' or not exists (
    select 1 from public.order_events e where e.order_id = p_order and e.event = 'no_show_reported' and e.actor_id <> me
  ) then
    raise exception 'no_report_to_dispute' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.order_events e where e.order_id = p_order and e.event = 'no_show_disputed') then
    return;
  end if;

  perform public.log_order_event(p_order, me, 'no_show_disputed');
  insert into public.disputes (order_id, opened_by, reason)
  values (p_order, me, 'no_show')
  on conflict (order_id) do nothing;
  update public.orders set status = 'disputed' where id = p_order;
  insert into public.notifications (user_id, kind, payload)
  select u.id, 'no_show_disputed', jsonb_build_object('order_id', p_order)
  from public.users u where u.role in ('moderator', 'admin') and u.status = 'active';
end;
$$;

-- A moderator decides. The note is shown to both people.
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
  if ord.status not in ('awaiting_meetup', 'disputed', 'completed') then
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

-- When the code locks, the order goes to the moderators as a dispute instead of hanging.
create or replace function public.complete_meetup(p_order uuid, p_code text)
returns table (result text, attempts_left integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ord public.orders%rowtype;
  expected text;
  max_attempts integer := public.config_bigint('meetup_code_attempt_limit', 5)::integer;
  before_min integer := public.config_bigint('meetup_code_valid_from_minutes_before', 60)::integer;
  after_hours integer := public.config_bigint('meetup_code_valid_until_hours_after', 24)::integer;
begin
  select * into ord from public.orders where id = p_order for update;
  if not found or ord.seller_id is distinct from me then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  if ord.status <> 'awaiting_meetup' or ord.meetup_confirmed_at is null then
    raise exception 'order_not_ready' using errcode = 'P0001';
  end if;

  if ord.code_attempts >= max_attempts then
    return query select 'locked'::text, 0;
    return;
  end if;
  if now() < ord.meetup_at - make_interval(mins => before_min) or now() > ord.meetup_at + make_interval(hours => after_hours) then
    return query select 'outside_window'::text, max_attempts - ord.code_attempts;
    return;
  end if;

  select c.code into expected from public.order_meetup_codes c where c.order_id = p_order;
  if expected is not null and p_code is not null and p_code = expected then
    update public.orders set status = 'completed', completed_at = now() where id = p_order;
    if ord.item_id is not null then
      update public.items set status = 'sold', sold_at = now() where id = ord.item_id;
    end if;
    perform public.log_order_event(p_order, me, 'code_entered');
    perform public.log_order_event(p_order, me, 'completed');
    perform public.notify_user(ord.buyer_id, 'order_completed', jsonb_build_object('order_id', p_order));
    perform public.notify_user(ord.seller_id, 'order_completed', jsonb_build_object('order_id', p_order));
    return query select 'completed'::text, max_attempts - ord.code_attempts;
    return;
  end if;

  update public.orders set code_attempts = code_attempts + 1 where id = p_order;
  perform public.log_order_event(p_order, me, 'code_wrong', jsonb_build_object('attempt', ord.code_attempts + 1));

  if ord.code_attempts + 1 >= max_attempts then
    perform public.log_order_event(p_order, me, 'code_locked');
    insert into public.disputes (order_id, opened_by, reason) values (p_order, me, 'code_locked') on conflict (order_id) do nothing;
    update public.orders set status = 'disputed' where id = p_order;
    insert into public.notifications (user_id, kind, payload)
    select u.id, 'code_locked', jsonb_build_object('order_id', p_order)
    from public.users u where u.role in ('moderator', 'admin') and u.status = 'active';
    return query select 'locked'::text, 0;
  else
    return query select 'wrong_code'::text, max_attempts - (ord.code_attempts + 1);
  end if;
end;
$$;

revoke all on function public.open_dispute(uuid, text, text), public.respond_to_dispute(uuid, text), public.decide_dispute(uuid, text, text) from public, anon;
grant execute on function public.open_dispute(uuid, text, text), public.respond_to_dispute(uuid, text), public.decide_dispute(uuid, text, text) to authenticated;
revoke all on function public.dispute_no_show(uuid), public.complete_meetup(uuid, text) from public, anon;
grant execute on function public.dispute_no_show(uuid), public.complete_meetup(uuid, text) to authenticated;
