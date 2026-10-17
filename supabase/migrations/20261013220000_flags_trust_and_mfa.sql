-- Scam-signal flags, brand checks ("Photos reviewed"), chat context for reports, the trusted-seller
-- job and optional two-factor enforcement for moderators.

---------------------------------------------------------------------------------------------------
-- Account flags: the signals in docs/operations/moderator-guide.md that can be spotted by the system.
---------------------------------------------------------------------------------------------------
create table if not exists public.account_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  reason text not null check (reason in ('new_account_high_value', 'repeat_strikes', 'contact_sharing')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.users (id) on delete set null,
  resolved_at timestamptz
);
create unique index if not exists account_flags_one_open on public.account_flags (user_id, reason) where resolved_at is null;
alter table public.account_flags enable row level security;
create policy account_flags_moderators_read on public.account_flags for select to authenticated
  using ((select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
grant select on public.account_flags to authenticated;

-- Item flags: add brand checks, and record when photos were reviewed.
alter table public.item_flags drop constraint if exists item_flags_reason_check;
alter table public.item_flags add constraint item_flags_reason_check check (reason in ('duplicate_photo', 'brand_check'));
alter table public.items add column if not exists photos_reviewed_at timestamptz;

-- Changing photos removes the "Photos reviewed" label, and sends expensive items back for a check.
create or replace function public.reset_photo_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.items set photos_reviewed_at = null where id = new.item_id and photos_reviewed_at is not null;
  insert into public.item_flags (item_id, reason)
  select i.id, 'brand_check' from public.items i
  where i.id = new.item_id and i.price_cents >= 150000 and i.status = 'active'::public.item_status
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.reset_photo_review() from public, anon, authenticated;
drop trigger if exists item_photos_reset_review on public.item_photos;
create trigger item_photos_reset_review after insert on public.item_photos for each row execute function public.reset_photo_review();

-- Publishing now also looks for scam signals. Flags never block a listing.
create or replace function public.publish_item(p_item uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
  seller public.users%rowtype;
  new_status public.item_status;
  expensive integer;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select * into it from public.items where id = p_item and seller_id = me for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if it.status not in ('draft'::public.item_status, 'awaiting_verification'::public.item_status) then
    raise exception 'item_not_publishable' using errcode = 'P0001';
  end if;

  select * into seller from public.users where id = me;
  if seller.status <> 'active' or seller.terms_accepted_at is null then
    raise exception 'account_not_active' using errcode = 'P0001';
  end if;

  if (select count(distinct p.kind) from public.item_photos p
      where p.item_id = p_item and p.kind in ('front'::public.item_photo_kind, 'back'::public.item_photo_kind, 'label'::public.item_photo_kind)) < 3 then
    raise exception 'photos_missing' using errcode = 'P0001';
  end if;

  new_status := case when seller.verification_level = 'level2' then 'active'::public.item_status else 'awaiting_verification'::public.item_status end;
  update public.items
  set status = new_status,
      published_at = case when new_status = 'active' then coalesce(published_at, now()) else published_at end
  where id = p_item;

  -- Scam signal: a brand new account listing several expensive items.
  select count(*) into expensive from public.items i
  where i.seller_id = me and i.price_cents >= 100000 and i.status in ('active'::public.item_status, 'awaiting_verification'::public.item_status);
  if seller.created_at > now() - interval '14 days' and expensive >= 3 then
    insert into public.account_flags (user_id, reason, detail)
    values (me, 'new_account_high_value', jsonb_build_object('expensive_items', expensive))
    on conflict do nothing;
  end if;

  -- Items over N$1,500 get a brand check (photos reviewed by a moderator).
  if it.price_cents >= 150000 then
    insert into public.item_flags (item_id, reason) values (p_item, 'brand_check') on conflict do nothing;
  end if;
  return new_status::text;
end;
$$;
revoke all on function public.publish_item(uuid) from public, anon;
grant execute on function public.publish_item(uuid) to authenticated;

-- Two or more strikes in 90 days is a signal worth a look.
create or replace function public.issue_strike(p_user uuid, p_reason public.strike_reason, p_order uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  insert into public.strikes (user_id, reason, order_id) values (p_user, p_reason, p_order);
  select count(*) into recent from public.strikes where user_id = p_user and created_at > now() - interval '90 days';

  if recent = 2 then
    update public.users set restricted_until = greatest(coalesce(restricted_until, now()), now() + interval '72 hours') where id = p_user;
  elsif recent = 3 then
    update public.users set restricted_until = greatest(coalesce(restricted_until, now()), now() + interval '14 days') where id = p_user;
  elsif recent >= 4 then
    update public.users set restricted_until = greatest(coalesce(restricted_until, now()), now() + interval '14 days') where id = p_user;
    insert into public.notifications (user_id, kind, payload)
    select u.id, 'account_review_needed', jsonb_build_object('user_id', p_user, 'strikes', recent)
    from public.users u where u.role in ('moderator', 'admin') and u.status = 'active';
  end if;
  if recent >= 2 then
    insert into public.account_flags (user_id, reason, detail) values (p_user, 'repeat_strikes', jsonb_build_object('strikes_in_90_days', recent)) on conflict do nothing;
  end if;

  perform public.notify_user(p_user, 'strike_issued', jsonb_build_object('reason', p_reason, 'strikes_in_90_days', recent, 'order_id', p_order));
  return recent;
end;
$$;
revoke all on function public.issue_strike(uuid, public.strike_reason, uuid) from public, anon, authenticated;

-- Three messages with contact details in a week, to at least two people.
create or replace function public.flag_contact_sharing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hits integer;
  people integer;
begin
  select count(*), count(distinct conversation_id) into hits, people
  from public.messages where sender_id = new.sender_id and flagged_contact and created_at > now() - interval '7 days';
  if hits >= 3 and people >= 2 then
    insert into public.account_flags (user_id, reason, detail)
    values (new.sender_id, 'contact_sharing', jsonb_build_object('messages', hits, 'conversations', people))
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.flag_contact_sharing() from public, anon, authenticated;
drop trigger if exists messages_flag_contact on public.messages;
create trigger messages_flag_contact after insert on public.messages for each row when (new.flagged_contact) execute function public.flag_contact_sharing();

---------------------------------------------------------------------------------------------------
-- Resolving flags
---------------------------------------------------------------------------------------------------
drop function if exists public.resolve_item_flag(uuid);
create or replace function public.resolve_item_flag(p_flag uuid, p_action text default 'dismiss', p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  f public.item_flags%rowtype;
begin
  if p_action not in ('dismiss', 'approve') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  select * into f from public.item_flags where id = p_flag and resolved_at is null for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  if p_action = 'approve' then
    if f.reason <> 'brand_check' then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
    update public.items set photos_reviewed_at = now() where id = f.item_id;
  end if;
  update public.item_flags set resolved_by = me, resolved_at = now() where id = p_flag;
  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, case when p_action = 'approve' then 'photos_reviewed' else 'dismiss_flag' end, 'item', f.item_id, nullif(btrim(p_note), ''));
end;
$$;
revoke all on function public.resolve_item_flag(uuid, text, text) from public, anon;
grant execute on function public.resolve_item_flag(uuid, text, text) to authenticated;

create or replace function public.resolve_account_flag(p_flag uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  f public.account_flags%rowtype;
begin
  if p_action not in ('dismiss', 'restrict_user', 'suspend_user') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  select * into f from public.account_flags where id = p_flag and resolved_at is null for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  if p_action <> 'dismiss' then
    if f.user_id = me then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.users u where u.id = f.user_id and u.role in ('moderator'::public.user_role, 'admin'::public.user_role)) then
      raise exception 'cannot_act_on_staff' using errcode = 'P0001';
    end if;
    if p_action = 'restrict_user' then
      update public.users set status = 'restricted', restricted_until = now() + interval '7 days' where id = f.user_id;
    else
      update public.users set status = 'suspended' where id = f.user_id;
    end if;
    perform public.notify_user(f.user_id, 'account_action', jsonb_build_object('action', p_action));
  end if;
  update public.account_flags set resolved_by = me, resolved_at = now() where id = p_flag;
  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, case when p_action = 'dismiss' then 'dismiss_flag' else p_action end, 'user', f.user_id, nullif(btrim(p_note), ''));
end;
$$;
revoke all on function public.resolve_account_flag(uuid, text, text) from public, anon;
grant execute on function public.resolve_account_flag(uuid, text, text) to authenticated;

---------------------------------------------------------------------------------------------------
-- A moderator reading a reported chat message sees it with the messages around it. Every look is logged.
---------------------------------------------------------------------------------------------------
create or replace function public.report_context(p_report uuid)
returns table (message_id uuid, sender_id uuid, body text, created_at timestamptz, is_reported boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  rep public.reports%rowtype;
  conv uuid;
  at timestamptz;
begin
  select * into rep from public.reports where id = p_report;
  if not found or rep.target_type <> 'message' then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  select m.conversation_id, m.created_at into conv, at from public.messages m where m.id = rep.target_id;
  if conv is null then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  insert into public.moderator_actions (actor_id, action, target_type, target_id, note) values (me, 'view_chat', 'report', p_report, null);
  return query
    select m.id, m.sender_id, m.body, m.created_at, m.id = rep.target_id
    from public.messages m
    where m.conversation_id = conv and m.created_at between at - interval '1 day' and at + interval '1 day'
    order by m.created_at
    limit 20;
end;
$$;
revoke all on function public.report_context(uuid) from public, anon;
grant execute on function public.report_context(uuid) to authenticated;

---------------------------------------------------------------------------------------------------
-- Trusted sellers: 10 completed sales, rating 4.5 or higher over at least 5 reviews, account 60+ days old,
-- no upheld dispute in the last 180 days. Lost when the rating drops below 4.3 or a dispute is upheld.
---------------------------------------------------------------------------------------------------
create or replace function public.refresh_trusted_sellers()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  gained integer := 0;
  lost integer := 0;
  rec record;
begin
  for rec in
    select u.id, u.is_trusted_seller as was,
      (select count(*) from public.orders o where o.seller_id = u.id and o.status = 'completed') as sales,
      (select avg(r.rating) from public.reviews r join public.orders o on o.id = r.order_id where r.reviewee_id = u.id and o.seller_id = u.id) as rating,
      (select count(*) from public.reviews r join public.orders o on o.id = r.order_id where r.reviewee_id = u.id and o.seller_id = u.id) as reviews,
      exists (select 1 from public.disputes d join public.orders o on o.id = d.order_id
              where o.seller_id = u.id and d.decision = 'seller_at_fault' and d.decided_at > now() - interval '180 days') as upheld
    from public.users u
    where u.status = 'active' and (u.is_trusted_seller or u.created_at < now() - interval '60 days')
  loop
    if rec.was then
      if rec.upheld or (rec.reviews >= 5 and rec.rating < 4.3) then
        update public.users set is_trusted_seller = false where id = rec.id;
        lost := lost + 1;
      end if;
    elsif rec.sales >= 10 and rec.reviews >= 5 and rec.rating >= 4.5 and not rec.upheld then
      update public.users set is_trusted_seller = true where id = rec.id;
      perform public.notify_user(rec.id, 'trusted_seller_gained', '{}'::jsonb);
      gained := gained + 1;
    end if;
  end loop;
  return jsonb_build_object('gained', gained, 'lost', lost);
end;
$$;
revoke all on function public.refresh_trusted_sellers() from public, anon, authenticated;
grant execute on function public.refresh_trusted_sellers() to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('rehang-trusted-sellers', '30 2 * * *', 'select public.refresh_trusted_sellers()');
  end if;
exception when others then
  raise notice 'pg_cron not scheduled: %', sqlerrm;
end $$;

---------------------------------------------------------------------------------------------------
-- Two-factor login for moderators. Off until the setting is turned on, so the first moderator can
-- enrol an authenticator app at /admin/security before it starts to be enforced:
--   update public.app_config set value = 'true'::jsonb where key = 'require_moderator_mfa';
---------------------------------------------------------------------------------------------------
insert into public.app_config (key, value) values ('require_moderator_mfa', 'false'::jsonb) on conflict (key) do nothing;

create or replace function public.assert_moderator()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null or (select public.current_user_role()) not in ('moderator'::public.user_role, 'admin'::public.user_role) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'require_moderator_mfa'), false)
     and coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then
    raise exception 'mfa_required' using errcode = 'P0001';
  end if;
  return me;
end;
$$;
revoke all on function public.assert_moderator() from public, anon;
