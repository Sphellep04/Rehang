begin;
select plan(13);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to anon, authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, email_confirmed_at) values ('1f1f1f1f-0000-0000-0000-00000000000c', 'wm@example.com', now()), ('1f1f1f1f-0000-0000-0000-00000000000d', 'wo@example.com', now());
update public.users set handle = 'w_mod', display_name = 'M', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'moderator' where id = '1f1f1f1f-0000-0000-0000-00000000000c';
update public.users set handle = 'w_other', display_name = 'O', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '1f1f1f1f-0000-0000-0000-00000000000d';

-- Waiting list
set local role anon;
select public.join_waitlist('Ann@Example.com ', 'seller', 'Windhoek', 'Whats App!');
select public.join_waitlist('ann@example.com');
select ok(public.tap_err($$select public.join_waitlist('not-an-email')$$) = 'invalid_email', 'a bad address is refused');
select ok(public.tap_err($$select public.join_waitlist('x@example.com', 'robot')$$) = 'invalid_action', 'an unknown role is refused');
reset role;
select ok((select count(*) = 1 and bool_and(contact = 'ann@example.com') and bool_and(source = 'WhatsApp') from public.waitlist), 'joining twice keeps one tidy row');
set local role anon;
select ok(public.tap_err($$select * from public.waitlist$$) like 'permission denied%', 'visitors cannot read the list');
reset role;

-- Invites while sign-up is open
select ok(not public.signup_requires_invite(), 'sign-up is open by default');
insert into auth.users (id, email) values ('1f1f1f1f-0000-0000-0000-000000000001', 'open@example.com');
select ok((select count(*) = 1 from auth.users where email = 'open@example.com'), 'anyone can sign up while it is open');

-- Making codes
select public.tap_as('1f1f1f1f-0000-0000-0000-00000000000d');
set local role authenticated;
select ok(public.tap_err($$select public.create_invite()$$) = 'not_allowed', 'members cannot make invite codes');
select public.tap_as('1f1f1f1f-0000-0000-0000-00000000000c');
create temp table codes as select public.create_invite(1, 7, 'for a friend') as code;
grant all on codes to authenticated;
create temp table wl as select * from public.invite_from_waitlist((select id from public.waitlist limit 1));
reset role;
select ok((select code ~ '^[A-Z2-9]{8}$' from codes) and (select email = 'ann@example.com' and code ~ '^[A-Z2-9]{8}$' from wl) and (select invited_at is not null from public.waitlist), 'moderators can make codes and invite from the list');

-- Invite-only
update public.app_config set value = 'true'::jsonb where key = 'signup_requires_invite';
select ok(public.signup_requires_invite() and public.check_invite((select lower(code) from codes)) and not public.check_invite('NOPE0000'), 'codes are checked without caring about case');
select ok(public.tap_err($$insert into auth.users (id, email) values (gen_random_uuid(), 'nocode@example.com')$$) = 'invite_required', 'sign-up without a code is refused by the database');
select ok(public.tap_err(format($$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'yes@example.com', '{"invite_code":"%s"}')$$, (select lower(code) from codes))) = 'ok', 'sign-up with a valid code works');
select ok(public.tap_err(format($$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'again@example.com', '{"invite_code":"%s"}')$$, (select code from codes))) = 'invite_required', 'a single-use code cannot be used twice');
update public.signup_invites set uses = 0, expires_at = now() - interval '1 minute' where code = (select code from codes);
select ok(not public.check_invite((select code from codes)), 'expired codes stop working');

select * from finish();
rollback;
