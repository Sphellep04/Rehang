-- Email sign-in, publish gating by seller verification, and more reserved route names.

-- 1. Accounts are created from an email address. A confirmed email is Level 1.
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, phone, email, handle, display_name, verification_level)
  values (
    new.id,
    new.phone,
    new.email,
    'user_' || right(replace(new.id::text, '-', ''), 12),
    'New member',
    case when new.email_confirmed_at is not null then 'level1'::public.verification_level else 'level0'::public.verification_level end
  )
  on conflict (id) do update set phone = excluded.phone, email = excluded.email;
  return new;
end;
$$;
revoke all on function public.handle_auth_user_created() from public, anon, authenticated;

create or replace function public.handle_auth_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set email = new.email,
      verification_level = case when verification_level = 'level0' then 'level1'::public.verification_level else verification_level end
  where id = new.id;
  return new;
end;
$$;
revoke all on function public.handle_auth_user_confirmed() from public, anon, authenticated;

drop trigger if exists rehang_email_confirmed on auth.users;
create trigger rehang_email_confirmed
after update of email_confirmed_at, email on auth.users
for each row
when (new.email_confirmed_at is not null)
execute function public.handle_auth_user_confirmed();

-- Existing accounts that already have a confirmed email.
update public.users u
set verification_level = 'level1', email = coalesce(u.email, a.email)
from auth.users a
where a.id = u.id and a.email_confirmed_at is not null and u.verification_level = 'level0';

-- 2. More route names that a shop handle must never take.
create or replace function public.reject_reserved_handle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.handle in (
    'admin', 'api', 'app', 'auth', 'browse', 'inbox', 'item', 'login', 'logout', 'onboarding',
    'orders', 'privacy', 'rehang', 'saved', 'search', 'sell', 'settings', 'shop', 'support',
    'terms', 'help', 'about', 'offers', 'following', 'moderator', 'mod', 'signup', 'forgot-password',
    'reset-password', 'verify', 'notifications', 'account', 'spots'
  ) and new.handle !~ '^user_[0-9a-f]+$' then
    raise exception using errcode = '23514', message = 'that handle is reserved';
  end if;
  return new;
end;
$$;

-- 3. Publishing. Drafts become live only for ID-verified sellers. Everyone else waits, and the
-- listing goes live by itself when a moderator approves their ID.
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
  return new_status::text;
end;
$$;
revoke all on function public.publish_item(uuid) from public, anon;
grant execute on function public.publish_item(uuid) to authenticated;

-- Approving an ID also puts that seller's waiting listings live.
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
      update public.items set status = 'active', published_at = coalesce(published_at, now())
      where seller_id = ver.user_id and status = 'awaiting_verification';
    end if;
    perform public.notify_user(ver.user_id, 'verification_' || (case p_decision when 'approve' then 'approved' else 'rejected' end), '{}'::jsonb);
  end if;

  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, 'verification_' || p_decision, 'user', ver.user_id, nullif(btrim(p_reason), ''));
end;
$$;
revoke all on function public.review_verification(uuid, text, text) from public, anon;
grant execute on function public.review_verification(uuid, text, text) to authenticated;
