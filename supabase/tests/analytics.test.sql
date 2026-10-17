begin;
select plan(9);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to anon, authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, email_confirmed_at) values ('2a2a2a2a-0000-0000-0000-000000000001', 'am@example.com', now()), ('2a2a2a2a-0000-0000-0000-000000000002', 'au@example.com', now());
update public.users set handle = 'a_mod', display_name = 'M', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'moderator' where id = '2a2a2a2a-0000-0000-0000-000000000001';
update public.users set handle = 'a_user', display_name = 'U', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '2a2a2a2a-0000-0000-0000-000000000002';

set local role anon;
select ok(public.track_event('share_clicked', '{"channel":"whatsapp","object":"item","email":"a@b.com"}'::jsonb), 'a visitor can record a share');
select ok(not public.track_event('page_viewed'), 'an unknown event name is not accepted');
select ok(not public.track_event(null), 'a missing name is not accepted');
select ok(public.tap_err($$select * from public.analytics_events$$) like 'permission denied%', 'visitors cannot read events');
reset role;

select ok((select props = '{"channel":"whatsapp","object":"item"}'::jsonb from public.analytics_events limit 1), 'only the allowed property keys are kept');

select public.track_event('pwa_installed', jsonb_build_object('surface', repeat('x', 100) || '<script>'));
select ok((select length(props ->> 'surface') = 40 and props ->> 'surface' not like '%<%' from public.analytics_events where name = 'pwa_installed'), 'values are cleaned and cut to 40 characters');

-- Per-person limit of 60 an hour
select public.tap_as('2a2a2a2a-0000-0000-0000-000000000002');
set local role authenticated;
select count(*) filter (where public.track_event('share_clicked')) from generate_series(1, 70);
reset role;
select ok((select count(*) = 60 from public.analytics_events where user_id = '2a2a2a2a-0000-0000-0000-000000000002'), 'one person is limited to 60 events an hour');

-- Weekly report
select public.tap_as('2a2a2a2a-0000-0000-0000-000000000002');
set local role authenticated;
select ok(public.tap_err($$select * from public.weekly_metrics(4)$$) = 'not_allowed', 'ordinary users cannot read the weekly report');
reset role;
select public.tap_as('2a2a2a2a-0000-0000-0000-000000000001');
set local role authenticated;
select ok((select count(*) = 4 and sum(shares) = 61 and sum(app_installs) = 1 from public.weekly_metrics(4)), 'moderators get one row per week with the shares and installs counted');
reset role;

select * from finish();
rollback;
