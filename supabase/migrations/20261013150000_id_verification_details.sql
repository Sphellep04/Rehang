-- ID verification details: legal name, a one-way hash of the ID number (stops one person opening
-- several seller accounts), and a clean-up queue so ID images are deleted after review.

alter table public.verifications
  add column if not exists id_number_hash text check (id_number_hash is null or id_number_hash ~ '^[0-9a-f]{64}$'),
  add column if not exists legal_name text check (legal_name is null or char_length(legal_name) between 3 and 100),
  add column if not exists images_deleted_at timestamptz;

drop function if exists public.submit_id_verification(text, text);

create or replace function public.submit_id_verification(p_document_path text, p_selfie_path text, p_id_number_hash text, p_legal_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  new_id uuid;
  name_clean text := btrim(regexp_replace(coalesce(p_legal_name, ''), '\s+', ' ', 'g'));
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if split_part(p_document_path, '/', 1) <> me::text or split_part(p_selfie_path, '/', 1) <> me::text
     or p_document_path = p_selfie_path or p_document_path like '%..%' or p_selfie_path like '%..%' then
    raise exception 'invalid_upload' using errcode = 'P0001';
  end if;
  if p_id_number_hash is null or p_id_number_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_id_number' using errcode = 'P0001';
  end if;
  if char_length(name_clean) < 3 or char_length(name_clean) > 100 then
    raise exception 'invalid_legal_name' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.verifications v where v.user_id = me and v.type = 'id_document'::public.verification_type and v.status in ('pending'::public.verification_status, 'escalated'::public.verification_status)) then
    raise exception 'verification_already_pending' using errcode = 'P0001';
  end if;
  if (select u.verification_level from public.users u where u.id = me) = 'level2' then
    raise exception 'already_verified' using errcode = 'P0001';
  end if;
  -- The same ID cannot back two accounts, whether approved already or waiting in the queue.
  if exists (select 1 from public.users u where u.id_number_hash = p_id_number_hash and u.id <> me)
     or exists (select 1 from public.verifications v where v.id_number_hash = p_id_number_hash and v.user_id <> me
                and v.status in ('pending'::public.verification_status, 'escalated'::public.verification_status, 'approved'::public.verification_status)) then
    raise exception 'id_already_used' using errcode = 'P0001';
  end if;

  insert into public.verifications (user_id, type, document_path, selfie_path, id_number_hash, legal_name)
  values (me, 'id_document', p_document_path, p_selfie_path, p_id_number_hash, name_clean)
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.submit_id_verification(text, text, text, text) from public, anon;
grant execute on function public.submit_id_verification(text, text, text, text) to authenticated;

-- Approval copies the name and hash to the account. The unique index on users.id_number_hash is
-- the last line of defence if two accounts raced to use the same ID.
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
    if p_decision = 'approve' then
      begin
        update public.users
        set verification_level = 'level2', legal_name = coalesce(ver.legal_name, legal_name), id_number_hash = coalesce(ver.id_number_hash, id_number_hash)
        where id = ver.user_id;
      exception when unique_violation then
        raise exception 'id_already_used' using errcode = 'P0001';
      end;
      update public.items set status = 'active', published_at = coalesce(published_at, now())
      where seller_id = ver.user_id and status = 'awaiting_verification';
    end if;
    update public.verifications
    set status = case p_decision when 'approve' then 'approved'::public.verification_status else 'rejected'::public.verification_status end,
        rejection_reason = case when p_decision = 'reject' then btrim(p_reason) end,
        reviewed_by = me, reviewed_at = now(),
        delete_images_after = now() + interval '7 days'
    where id = p_verification;
    perform public.notify_user(ver.user_id, 'verification_' || (case p_decision when 'approve' then 'approved' else 'rejected' end), '{}'::jsonb);
  end if;

  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, 'verification_' || p_decision, 'user', ver.user_id, nullif(btrim(p_reason), ''));
end;
$$;
revoke all on function public.review_verification(uuid, text, text) from public, anon;
grant execute on function public.review_verification(uuid, text, text) to authenticated;

-- Clean-up queue for the daily job. Only the service role may call these.
create or replace function public.id_images_due_for_deletion()
returns table (verification_id uuid, document_path text, selfie_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.document_path, v.selfie_path
  from public.verifications v
  where v.delete_images_after <= now() and v.images_deleted_at is null
    and (v.document_path is not null or v.selfie_path is not null)
  order by v.delete_images_after
  limit 200
$$;

create or replace function public.mark_id_images_deleted(p_ids uuid[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with done as (
    update public.verifications
    set document_path = null, selfie_path = null, images_deleted_at = now()
    where id = any (p_ids) and delete_images_after <= now()
    returning 1
  )
  select count(*)::integer from done
$$;

revoke all on function public.id_images_due_for_deletion() from public, anon, authenticated;
revoke all on function public.mark_id_images_deleted(uuid[]) from public, anon, authenticated;
grant execute on function public.id_images_due_for_deletion() to service_role;
grant execute on function public.mark_id_images_deleted(uuid[]) to service_role;
