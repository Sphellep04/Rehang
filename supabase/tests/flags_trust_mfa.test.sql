begin;
select plan(19);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('1a1a1a1a-0000-0000-0000-00000000000a', 'fs@example.com', now()),
  ('1a1a1a1a-0000-0000-0000-00000000000b', 'fb@example.com', now()),
  ('1a1a1a1a-0000-0000-0000-00000000000c', 'fm@example.com', now()),
  ('1a1a1a1a-0000-0000-0000-00000000000d', 'fo@example.com', now()),
  ('1a1a1a1a-0000-0000-0000-00000000000e', 'fa@example.com', now());
update public.users set handle = 'f_seller', display_name = 'S', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '1a1a1a1a-0000-0000-0000-00000000000a';
update public.users set handle = 'f_buyer', display_name = 'B', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '1a1a1a1a-0000-0000-0000-00000000000b';
update public.users set handle = 'f_mod', display_name = 'M', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'moderator' where id = '1a1a1a1a-0000-0000-0000-00000000000c';
update public.users set handle = 'f_other', display_name = 'O', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '1a1a1a1a-0000-0000-0000-00000000000d';
update public.users set handle = 'f_admin', display_name = 'A', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'admin' where id = '1a1a1a1a-0000-0000-0000-00000000000e';

-- Four drafts: three at N$1,000 and one at N$1,600, each with the three required photos.
insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status)
select ('1b1b1b1b-0000-0000-0000-00000000000' || n)::uuid, '1a1a1a1a-0000-0000-0000-00000000000a', 'Flag test item number ' || n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'very_good', array['blue'], case when n = 4 then 160000 else 100000 end, (select tw.id from public.towns tw where tw.name = 'Windhoek'), 'draft'
from generate_series(1, 4) n;
insert into public.item_photos (item_id, position, kind, path_thumb, path_card, path_full, width, height)
select i.id, k.pos, k.kind::public.item_photo_kind, 'p', 'p', 'p', 800, 800
from public.items i, (values (1, 'front'), (2, 'back'), (3, 'label')) as k(pos, kind)
where i.id::text like '1b1b1b1b-%';

select public.tap_as('1a1a1a1a-0000-0000-0000-00000000000a');
set local role authenticated;
select public.publish_item('1b1b1b1b-0000-0000-0000-000000000001');
select public.publish_item('1b1b1b1b-0000-0000-0000-000000000002');
select public.publish_item('1b1b1b1b-0000-0000-0000-000000000003');
select public.publish_item('1b1b1b1b-0000-0000-0000-000000000004');
reset role;
select ok((select count(*) = 1 from public.account_flags where user_id = '1a1a1a1a-0000-0000-0000-00000000000a' and reason = 'new_account_high_value'), 'a new account with three expensive listings is flagged');
select ok((select count(*) = 1 from public.item_flags where item_id = '1b1b1b1b-0000-0000-0000-000000000004' and reason = 'brand_check') and (select count(*) = 0 from public.item_flags where item_id = '1b1b1b1b-0000-0000-0000-000000000001' and reason = 'brand_check'), 'only items over N$1,500 get a brand check');

select public.tap_as('1a1a1a1a-0000-0000-0000-00000000000d');
set local role authenticated;
select ok(public.tap_err($$select public.resolve_item_flag((select id from public.item_flags where reason = 'brand_check'), 'approve')$$) = 'not_allowed', 'members cannot approve brand checks');
select ok((select count(*) = 0 from public.account_flags), 'members cannot read account flags');
select public.tap_as('1a1a1a1a-0000-0000-0000-00000000000c');
select public.resolve_item_flag((select id from public.item_flags where reason = 'brand_check'), 'approve', 'Label and stitching look right');
reset role;
select ok((select photos_reviewed_at is not null from public.items where id = '1b1b1b1b-0000-0000-0000-000000000004'), 'approving marks the photos as reviewed');
insert into public.item_photos (item_id, position, kind, path_thumb, path_card, path_full, width, height)
values ('1b1b1b1b-0000-0000-0000-000000000004', 4, 'other', 'q', 'q', 'q', 800, 800);
select ok((select photos_reviewed_at is null from public.items where id = '1b1b1b1b-0000-0000-0000-000000000004') and (select count(*) = 1 from public.item_flags where item_id = '1b1b1b1b-0000-0000-0000-000000000004' and resolved_at is null), 'new photos remove the label and queue another check');

-- Strikes
select public.issue_strike('1a1a1a1a-0000-0000-0000-00000000000b', 'no_show', null);
select ok((select count(*) = 0 from public.account_flags where user_id = '1a1a1a1a-0000-0000-0000-00000000000b'), 'one strike is not flagged');
select public.issue_strike('1a1a1a1a-0000-0000-0000-00000000000b', 'no_show', null);
select ok((select count(*) = 1 from public.account_flags where user_id = '1a1a1a1a-0000-0000-0000-00000000000b' and reason = 'repeat_strikes'), 'a second strike is flagged');

-- Contact sharing across two chats
insert into public.conversations (id, item_id, buyer_id, seller_id) values
  ('1c1c1c1c-0000-0000-0000-000000000001', '1b1b1b1b-0000-0000-0000-000000000001', '1a1a1a1a-0000-0000-0000-00000000000b', '1a1a1a1a-0000-0000-0000-00000000000a'),
  ('1c1c1c1c-0000-0000-0000-000000000002', '1b1b1b1b-0000-0000-0000-000000000002', '1a1a1a1a-0000-0000-0000-00000000000d', '1a1a1a1a-0000-0000-0000-00000000000a');
select public.tap_as('1a1a1a1a-0000-0000-0000-00000000000a');
insert into public.messages (conversation_id, body) values
  ('1c1c1c1c-0000-0000-0000-000000000001', 'Hi, is it still available'),
  ('1c1c1c1c-0000-0000-0000-000000000001', 'message me on whatsapp please'),
  ('1c1c1c1c-0000-0000-0000-000000000001', 'call 0811234567 now'),
  ('1c1c1c1c-0000-0000-0000-000000000002', 'add me on instagram');
select ok((select count(*) = 1 from public.account_flags where user_id = '1a1a1a1a-0000-0000-0000-00000000000a' and reason = 'contact_sharing'), 'repeated contact details across chats are flagged');

-- Reported message context
select public.tap_as('1a1a1a1a-0000-0000-0000-00000000000b');
set local role authenticated;
select public.file_report('message', (select id from public.messages where body like 'message me on whatsapp%'), 'off_platform_payment', null);
select ok(public.tap_err($$select * from public.report_context((select id from public.reports limit 1))$$) = 'not_allowed', 'members cannot read reported chats');
select public.tap_as('1a1a1a1a-0000-0000-0000-00000000000c');
select ok((select count(*) = 3 and count(*) filter (where is_reported) = 1 from public.report_context((select id from public.reports limit 1))), 'moderators see the reported message with the ones around it');
reset role;
select ok((select count(*) = 1 from public.moderator_actions where action = 'view_chat'), 'reading a chat is logged');

-- Acting on an account flag
select public.tap_as('1a1a1a1a-0000-0000-0000-00000000000c');
set local role authenticated;
select ok(public.tap_err($$select public.resolve_account_flag((select id from public.account_flags where reason = 'repeat_strikes'), 'suspend_user', 'x')$$) = 'ok', 'a moderator can act on an account flag');
reset role;
select ok((select status = 'suspended' from public.users where id = '1a1a1a1a-0000-0000-0000-00000000000b'), 'suspending from a flag takes effect');
update public.account_flags set resolved_at = null, resolved_by = null where reason = 'repeat_strikes';
update public.account_flags set user_id = '1a1a1a1a-0000-0000-0000-00000000000e' where reason = 'repeat_strikes';
select public.tap_as('1a1a1a1a-0000-0000-0000-00000000000c');
set local role authenticated;
select ok(public.tap_err($$select public.resolve_account_flag((select id from public.account_flags where reason = 'repeat_strikes'), 'suspend_user', null)$$) = 'cannot_act_on_staff', 'staff cannot be suspended from a flag');
reset role;

-- Trusted sellers: a seller with 10 sales, 5 five-star reviews and an old account
update public.users set created_at = now() - interval '90 days' where id = '1a1a1a1a-0000-0000-0000-00000000000d';
insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select ('1e1e1e1e-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, '1a1a1a1a-0000-0000-0000-00000000000d', 'Sold trusted item ' || n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['blue'], 20000, (select tw.id from public.towns tw where tw.name = 'Windhoek'), 'sold', now()
from generate_series(1, 10) n;
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, status, completed_at)
select ('1d1d1d1d-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, ('1e1e1e1e-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, '1a1a1a1a-0000-0000-0000-00000000000b', '1a1a1a1a-0000-0000-0000-00000000000d', 20000, 'completed', now() - interval '1 day'
from generate_series(1, 10) n;
insert into public.reviews (order_id, reviewer_id, reviewee_id, rating)
select ('1d1d1d1d-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, '1a1a1a1a-0000-0000-0000-00000000000b', '1a1a1a1a-0000-0000-0000-00000000000d', 5 from generate_series(1, 5) n;
create temp table job as select public.refresh_trusted_sellers() as r;
select ok((select (r ->> 'gained')::int >= 1 from job) and (select is_trusted_seller from public.users where id = '1a1a1a1a-0000-0000-0000-00000000000d'), 'a seller who meets every rule becomes trusted');
insert into public.disputes (order_id, opened_by, reason, decision, decision_note, decided_by, decided_at)
values ('1d1d1d1d-0000-0000-0000-000000000009', '1a1a1a1a-0000-0000-0000-00000000000b', 'not_as_described', 'seller_at_fault', 'Upheld for the test', '1a1a1a1a-0000-0000-0000-00000000000c', now());
delete from job;
insert into job select public.refresh_trusted_sellers();
select ok((select (r ->> 'lost')::int >= 1 from job) and not (select is_trusted_seller from public.users where id = '1a1a1a1a-0000-0000-0000-00000000000d'), 'an upheld dispute removes the badge');

-- Two-factor
update public.app_config set value = 'true'::jsonb where key = 'require_moderator_mfa';
select public.tap_as('1a1a1a1a-0000-0000-0000-00000000000c');
set local role authenticated;
select ok(public.tap_err($$select public.resolve_item_flag(gen_random_uuid(), 'dismiss')$$) = 'mfa_required', 'with two-factor required, a moderator without it is refused');
select set_config('request.jwt.claims', '{"sub":"1a1a1a1a-0000-0000-0000-00000000000c","aal":"aal2"}', true);
select ok(public.tap_err($$select public.resolve_item_flag(gen_random_uuid(), 'dismiss')$$) = 'report_not_found', 'with two-factor passed, the moderator gets through');
reset role;

select * from finish();
rollback;
