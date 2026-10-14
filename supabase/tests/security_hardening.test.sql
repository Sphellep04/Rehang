begin;
select plan(9);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to anon, authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, email_confirmed_at) values ('3b3b3b3b-0000-0000-0000-000000000001', 'sm@example.com', now()), ('3b3b3b3b-0000-0000-0000-000000000002', 'su@example.com', now());
update public.users set handle = 's_mod', display_name = 'M', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'moderator' where id = '3b3b3b3b-0000-0000-0000-000000000001';
update public.users set handle = 's_user', display_name = 'U', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '3b3b3b3b-0000-0000-0000-000000000002';

-- Settings
set local role anon;
select ok((select count(*) from public.app_config where key = 'minimum_offer_percent') = 1, 'visitors can read a public setting');
select ok((select count(*) from public.app_config where key in ('messages_per_hour', 'level1_order_limit_cents', 'require_moderator_mfa')) = 0, 'visitors cannot read abuse limits or the staff two-factor switch');
reset role;
select public.tap_as('3b3b3b3b-0000-0000-0000-000000000002');
set local role authenticated;
select ok((select count(*) from public.app_config where key = 'messages_per_hour') = 0, 'ordinary signed-in users cannot read abuse limits');
select public.tap_err($$update public.app_config set value = '9999'::jsonb where key = 'commission_bps'$$);
reset role;
select ok((select value <> '9999'::jsonb from public.app_config where key = 'commission_bps'), 'ordinary users cannot change settings');
set local role authenticated;
reset role;
select public.tap_as('3b3b3b3b-0000-0000-0000-000000000001');
set local role authenticated;
select ok((select count(*) from public.app_config where key = 'messages_per_hour') = 1, 'moderators can read every setting');
reset role;

-- Storage
select ok(not exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'item_photos_owner_update'), 'item photo files can no longer be overwritten in place');

select public.tap_as('3b3b3b3b-0000-0000-0000-000000000002');
set local role authenticated;
select ok(public.tap_err($$insert into storage.objects (bucket_id, name) values ('id-documents', '3b3b3b3b-0000-0000-0000-000000000002/a.jpg')$$) = 'ok', 'a person can upload to their own ID folder');
reset role;
insert into storage.objects (bucket_id, name) select 'id-documents', '3b3b3b3b-0000-0000-0000-000000000002/f' || g || '.jpg' from generate_series(1, 11) g;
select public.tap_as('3b3b3b3b-0000-0000-0000-000000000002');
set local role authenticated;
select ok(public.tap_err($$insert into storage.objects (bucket_id, name) values ('id-documents', '3b3b3b3b-0000-0000-0000-000000000002/too-many.jpg')$$) like '%row-level security%', 'the twelfth-plus ID upload is refused');
select ok(public.tap_err($$insert into storage.objects (bucket_id, name) values ('id-documents', '3b3b3b3b-0000-0000-0000-000000000001/other.jpg')$$) like '%row-level security%', 'uploading into someone else''s folder is still refused');
reset role;

select * from finish();
rollback;
