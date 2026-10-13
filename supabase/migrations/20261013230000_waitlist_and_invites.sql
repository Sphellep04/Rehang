-- Waiting list and invite codes (table signup_invites; the older invite_codes table from the first schema is unused). While `signup_requires_invite` is on, only people with a valid code can
-- create an account. The check runs inside the database, so calling the sign-up API directly does not get around it.

insert into public.app_config (key, value) values ('signup_requires_invite', 'false'::jsonb) on conflict (key) do nothing;

create table if not exists public.signup_invites (
  code text primary key check (code ~ '^[A-Z2-9]{8}$'),
  created_by uuid references public.users (id) on delete set null,
  waitlist_id uuid references public.waitlist (id) on delete set null,
  note text check (note is null or char_length(note) <= 100),
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.signup_invites enable row level security;
revoke all on public.signup_invites from anon, authenticated;
grant select on public.signup_invites to authenticated;
create policy signup_invites_moderators_read on public.signup_invites for select to authenticated
  using ((select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));

create table if not exists public.invite_redemptions (
  user_id uuid primary key,
  code text not null references public.signup_invites (code),
  redeemed_at timestamptz not null default now()
);
alter table public.invite_redemptions enable row level security;
revoke all on public.invite_redemptions from anon, authenticated;

create or replace function public.signup_requires_invite()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.value = 'true'::jsonb from public.app_config c where c.key = 'signup_requires_invite'), false)
$$;
revoke all on function public.signup_requires_invite() from public;
grant execute on function public.signup_requires_invite() to anon, authenticated;

create or replace function public.check_invite(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.signup_invites i
    where i.code = upper(btrim(coalesce(p_code, ''))) and i.uses < i.max_uses and i.expires_at > now()
  )
$$;
revoke all on function public.check_invite(text) from public;
grant execute on function public.check_invite(text) to anon, authenticated;

-- Eight characters from an alphabet without look-alikes (no 0, 1, O, I, L).
create or replace function public.make_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  result text := '';
  i integer;
begin
  bytes := uuid_send(gen_random_uuid());
  for i in 0..7 loop
    result := result || substr(alphabet, (get_byte(bytes, i + 4) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;
revoke all on function public.make_invite_code() from public, anon, authenticated;

create or replace function public.create_invite(p_max_uses integer default 1, p_days integer default 14, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  new_code text;
begin
  if p_max_uses not between 1 and 100 or p_days not between 1 and 90 then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  loop
    new_code := public.make_invite_code();
    begin
      insert into public.signup_invites (code, created_by, note, max_uses, expires_at)
      values (new_code, me, nullif(btrim(p_note), ''), p_max_uses, now() + make_interval(days => p_days));
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  insert into public.moderator_actions (actor_id, action, target_type, target_id, note) values (me, 'create_invite', 'invite', gen_random_uuid(), nullif(btrim(p_note), ''));
  return new_code;
end;
$$;
revoke all on function public.create_invite(integer, integer, text) from public, anon;
grant execute on function public.create_invite(integer, integer, text) to authenticated;

-- One single-use code for a person on the waiting list. Returns who to email and the code.
create or replace function public.invite_from_waitlist(p_waitlist uuid)
returns table (email text, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  w public.waitlist%rowtype;
  new_code text;
begin
  select * into w from public.waitlist where id = p_waitlist for update;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
  loop
    new_code := public.make_invite_code();
    begin
      insert into public.signup_invites (code, created_by, waitlist_id, max_uses, expires_at)
      values (new_code, me, p_waitlist, 1, now() + interval '14 days');
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  update public.waitlist set invited_at = now() where id = p_waitlist;
  insert into public.moderator_actions (actor_id, action, target_type, target_id, note) values (me, 'invite_from_waitlist', 'waitlist', p_waitlist, null);
  return query select w.contact, new_code;
end;
$$;
revoke all on function public.invite_from_waitlist(uuid) from public, anon;
grant execute on function public.invite_from_waitlist(uuid) to authenticated;

-- Anyone can join the list. The reply is the same whether or not the address was already there.
create or replace function public.join_waitlist(p_email text, p_role text default 'both', p_town text default null, p_source text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mail text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(mail) > 254 or mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = 'P0001';
  end if;
  if p_role not in ('buyer', 'seller', 'both') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  -- Crude flood guard: at most 300 sign-ups to the list an hour across the whole site.
  if (select count(*) from public.waitlist where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'too_many_requests' using errcode = 'P0001';
  end if;
  insert into public.waitlist (contact, role, town, source)
  values (mail, p_role::public.waitlist_role, left(nullif(btrim(p_town), ''), 40), left(nullif(regexp_replace(coalesce(p_source, ''), '[^a-z0-9_-]', '', 'gi'), ''), 40))
  on conflict (contact) do nothing;
end;
$$;
revoke all on function public.join_waitlist(text, text, text, text) from public;
grant execute on function public.join_waitlist(text, text, text, text) to anon, authenticated;

-- Enforcement at the front door: a new account needs a valid code while the setting is on.
create or replace function public.require_invite_for_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  found_code text;
begin
  if not public.signup_requires_invite() then
    return new;
  end if;
  update public.signup_invites
  set uses = uses + 1
  where code = supplied and uses < max_uses and expires_at > now()
  returning code into found_code;
  if found_code is null then
    raise exception 'invite_required';
  end if;
  insert into public.invite_redemptions (user_id, code) values (new.id, found_code);
  return new;
end;
$$;
revoke all on function public.require_invite_for_signup() from public, anon, authenticated;
drop trigger if exists rehang_require_invite on auth.users;
create trigger rehang_require_invite before insert on auth.users for each row execute function public.require_invite_for_signup();

-- Moderators read the list in /admin. The existing policy limits rows to staff.
grant select on public.waitlist to authenticated;
