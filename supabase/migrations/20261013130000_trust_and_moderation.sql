-- Trust and moderation: reports, ID verification review, moderator actions and an action log.

-- Every moderator decision is written here, in the same transaction as the decision itself.
create table if not exists public.moderator_actions (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.users (id),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists moderator_actions_created_idx on public.moderator_actions (created_at desc);
alter table public.moderator_actions enable row level security;
revoke all on public.moderator_actions from anon, authenticated;
grant select on public.moderator_actions to authenticated;
create policy moderator_actions_read on public.moderator_actions for select to authenticated
using ((select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));

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
  return me;
end;
$$;
revoke all on function public.assert_moderator() from public, anon;

-- Reports go through one function so the target is checked, duplicates are blocked and the rate is limited.
alter table public.reports drop constraint if exists reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason in ('scam', 'fake_or_counterfeit', 'prohibited_item', 'off_platform_payment', 'harassment', 'inappropriate', 'other'));
alter table public.reports add constraint reports_details_length check (details is null or char_length(details) <= 500);
create unique index if not exists reports_one_open_per_reporter_target
  on public.reports (reporter_id, target_type, target_id) where status = 'open';

revoke insert on public.reports from authenticated;

create or replace function public.file_report(p_target_type public.report_target, p_target_id uuid, p_reason text, p_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  new_id uuid;
  owner_id uuid;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if p_reason not in ('scam', 'fake_or_counterfeit', 'prohibited_item', 'off_platform_payment', 'harassment', 'inappropriate', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;

  owner_id := case p_target_type
    when 'item' then (select i.seller_id from public.items i where i.id = p_target_id)
    when 'user' then (select u.id from public.users u where u.id = p_target_id)
    when 'message' then (select m.sender_id from public.messages m
                         join public.conversations c on c.id = m.conversation_id
                         where m.id = p_target_id and me in (c.buyer_id, c.seller_id))
  end;
  if owner_id is null then
    raise exception 'report_target_not_found' using errcode = 'P0001';
  end if;
  if owner_id = me then
    raise exception 'cannot_report_yourself' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reports r where r.reporter_id = me and r.target_type = p_target_type and r.target_id = p_target_id and r.status = 'open') then
    raise exception 'already_reported' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reports r where r.reporter_id = me and r.created_at > now() - interval '24 hours') >= 10 then
    raise exception 'too_many_reports' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (me, p_target_type, p_target_id, p_reason, nullif(btrim(p_details), ''))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.file_report(public.report_target, uuid, text, text) from public, anon;
grant execute on function public.file_report(public.report_target, uuid, text, text) to authenticated;

-- Moderators resolve a report. Each action is logged in the same transaction.
create or replace function public.moderate_report(p_report uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  rep public.reports%rowtype;
  subject uuid;
begin
  if p_action not in ('dismiss', 'remove_item', 'restrict_user', 'suspend_user') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  select * into rep from public.reports where id = p_report for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  if rep.status <> 'open' then
    raise exception 'report_already_handled' using errcode = 'P0001';
  end if;

  subject := case rep.target_type
    when 'item' then (select i.seller_id from public.items i where i.id = rep.target_id)
    when 'user' then rep.target_id
    when 'message' then (select m.sender_id from public.messages m where m.id = rep.target_id)
  end;

  if p_action = 'remove_item' then
    if rep.target_type <> 'item' then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
    update public.items set status = 'removed'::public.item_status where id = rep.target_id;
    perform public.notify_user(subject, 'item_removed', jsonb_build_object('item_id', rep.target_id));
  elsif p_action in ('restrict_user', 'suspend_user') then
    if subject is null or subject = me then
      raise exception 'invalid_action' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.users u where u.id = subject and u.role in ('moderator'::public.user_role, 'admin'::public.user_role)) then
      raise exception 'cannot_act_on_staff' using errcode = 'P0001';
    end if;
    if p_action = 'restrict_user' then
      update public.users set status = 'restricted', restricted_until = now() + interval '7 days' where id = subject;
    else
      update public.users set status = 'suspended' where id = subject;
    end if;
    perform public.notify_user(subject, 'account_action', jsonb_build_object('action', p_action));
  end if;

  update public.reports
  set status = case when p_action = 'dismiss' then 'dismissed'::public.moderation_status else 'actioned'::public.moderation_status end,
      handled_by = me, handled_at = now()
  where id = p_report;

  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, p_action, rep.target_type::text, rep.target_id, nullif(btrim(p_note), ''));
end;
$$;
revoke all on function public.moderate_report(uuid, text, text) from public, anon;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;

-- ID verification. The person uploads two images to their own folder in the private bucket, then submits them.
create or replace function public.submit_id_verification(p_document_path text, p_selfie_path text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  new_id uuid;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if split_part(p_document_path, '/', 1) <> me::text or split_part(p_selfie_path, '/', 1) <> me::text
     or p_document_path = p_selfie_path or p_document_path like '%..%' or p_selfie_path like '%..%' then
    raise exception 'invalid_upload' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.verifications v where v.user_id = me and v.type = 'id_document'::public.verification_type and v.status in ('pending'::public.verification_status, 'escalated'::public.verification_status)) then
    raise exception 'verification_already_pending' using errcode = 'P0001';
  end if;
  if (select u.verification_level from public.users u where u.id = me) = 'level2' then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;
  insert into public.verifications (user_id, type, document_path, selfie_path)
  values (me, 'id_document', p_document_path, p_selfie_path)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.submit_id_verification(text, text) from public, anon;
grant execute on function public.submit_id_verification(text, text) to authenticated;

create or replace function public.review_verification(p_verification uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  ver public.verifications%rowtype;
begin
  if p_decision not in ('approve', 'reject', 'escalate') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if p_decision = 'reject' and nullif(btrim(p_reason), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  select * into ver from public.verifications where id = p_verification for update;
  if not found then
    raise exception 'verification_not_found' using errcode = 'P0001';
  end if;
  if ver.status not in ('pending'::public.verification_status, 'escalated'::public.verification_status) then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;
  if ver.user_id = me then
    raise exception 'cannot_review_own' using errcode = 'P0001';
  end if;

  if p_decision = 'escalate' then
    update public.verifications set status = 'escalated', reviewed_by = me, reviewed_at = now() where id = p_verification;
  else
    update public.verifications
    set status = case p_decision when 'approve' then 'approved'::public.verification_status else 'rejected'::public.verification_status end,
        rejection_reason = case when p_decision = 'reject' then btrim(p_reason) end,
        reviewed_by = me, reviewed_at = now(),
        delete_images_after = now() + interval '7 days'
    where id = p_verification;
    if p_decision = 'approve' then
      update public.users set verification_level = 'level2' where id = ver.user_id;
    end if;
    perform public.notify_user(ver.user_id, 'verification_' || (case p_decision when 'approve' then 'approved' else 'rejected' end), '{}'::jsonb);
  end if;

  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, 'verification_' || p_decision, 'user', ver.user_id, nullif(btrim(p_reason), ''));
end;
$$;
revoke all on function public.review_verification(uuid, text, text) from public, anon;
grant execute on function public.review_verification(uuid, text, text) to authenticated;
