begin;
select plan(18);

create function public.tap_err(p_sql text) returns text
language plpgsql security invoker set search_path = '' as $$
begin execute p_sql; return 'ok'; exception when others then return sqlerrm; end $$;
grant execute on function public.tap_err(text) to anon, authenticated;
create function public.tap_as(p_user uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', p_user::text, true); perform set_config('request.jwt.claims', '', true); end $$;

insert into auth.users (id, email, email_confirmed_at) values
  ('3a3a3a3a-0000-0000-0000-00000000000a', 'gdon@example.com', now()),
  ('3a3a3a3a-0000-0000-0000-00000000000b', 'gmod@example.com', now()),
  ('3a3a3a3a-0000-0000-0000-00000000000c', 'gadm@example.com', now()),
  ('3a3a3a3a-0000-0000-0000-00000000000d', 'goth@example.com', now());
update public.users set handle = 'g_donor', display_name = 'D', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '3a3a3a3a-0000-0000-0000-00000000000a';
update public.users set handle = 'g_mod', display_name = 'M', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'moderator' where id = '3a3a3a3a-0000-0000-0000-00000000000b';
update public.users set handle = 'g_admin', display_name = 'A', status = 'active', terms_accepted_at = now(), verification_level = 'level2', role = 'admin' where id = '3a3a3a3a-0000-0000-0000-00000000000c';
update public.users set handle = 'g_other', display_name = 'O', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '3a3a3a3a-0000-0000-0000-00000000000d';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select ('3b3b3b3b-0000-0000-0000-00000000000' || n)::uuid, '3a3a3a3a-0000-0000-0000-00000000000a', 'Giving item number ' || n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['blue'], 5000, (select tw.id from public.towns tw where tw.name = 'Windhoek'), case when n = 5 then 'sold' else 'active' end::public.item_status, now()
from generate_series(1, 7) n;

-- Admin adds a home
select public.tap_as('3a3a3a3a-0000-0000-0000-00000000000b');
set local role authenticated;
select ok(public.tap_err($$select public.save_donation_partner(null, 'Test Children Home', 1, 'secret@example.com', 'A home for children', 'Clothes for ages 3 to 12', true)$$) = 'not_allowed', 'a moderator who is not an admin cannot add a home');
select public.tap_as('3a3a3a3a-0000-0000-0000-00000000000c');
select ok(public.tap_err($$select public.save_donation_partner(null, 'ab', 1, null, null, null, true)$$) = 'name_required', 'a home needs a name');
create temp table p as select public.save_donation_partner(null, 'Test Children Home', (select id from public.towns where name = 'Windhoek'), 'secret@example.com', 'A home for children', 'Clothes for ages 3 to 12', true) as id;
grant select on p to authenticated;
reset role;

-- Off by default
select public.tap_as('3a3a3a3a-0000-0000-0000-00000000000a');
set local role authenticated;
select ok(public.tap_err($$select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000001', (select id from p), 'Good as new')$$) = 'donations_off', 'giving is refused while the switch is off');
reset role;
update public.app_config set value = 'true'::jsonb where key = 'donations_enabled';

set local role authenticated;
select ok(public.tap_err($$select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000005', (select id from p), null)$$) = 'item_unavailable', 'a sold item cannot be given');
select ok(public.tap_err($$select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000001', gen_random_uuid(), null)$$) = 'partner_not_found', 'the home must exist');
select public.tap_as('3a3a3a3a-0000-0000-0000-00000000000d');
select ok(public.tap_err($$select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000001', (select id from p), null)$$) = 'item_unavailable', 'nobody can give away someone else''s item');
select public.tap_as('3a3a3a3a-0000-0000-0000-00000000000a');
select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000001', (select id from p), 'Good as new');
select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000002', (select id from p), null);
select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000003', (select id from p), null);
select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000004', (select id from p), null);
select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000006', (select id from p), null);
select ok(public.tap_err($$select public.offer_donation('3b3b3b3b-0000-0000-0000-000000000007', (select id from p), null)$$) = 'too_many_donations', 'no more than five open gifts at once');
reset role;
select ok((select status = 'reserved' from public.items where id = '3b3b3b3b-0000-0000-0000-000000000001'), 'a gifted item comes off sale');
select ok((select count(*) = 1 from public.notifications where user_id = '3a3a3a3a-0000-0000-0000-00000000000b' and kind = 'donation_offered' and payload ->> 'donation_id' = (select id::text from public.donations where item_id = '3b3b3b3b-0000-0000-0000-000000000001')), 'the team is told about a new gift');

-- Contact details stay private
select public.tap_as('3a3a3a3a-0000-0000-0000-00000000000d');
set local role authenticated;
select ok(public.tap_err($$select contact from public.donation_partners$$) like 'permission denied%', 'members cannot read a home''s contact details');
select ok((select count(*) = 1 from public.donation_partners), 'but they can see the home itself');
reset role;
set local role anon;
select ok((select count(*) = 1 from public.donation_partners), 'and so can visitors who are not signed in');
reset role;

-- Team decisions
select public.tap_as('3a3a3a3a-0000-0000-0000-00000000000b');
set local role authenticated;
select ok((select count(*) = 1 and bool_and(contact = 'secret@example.com') from public.donation_partner_contacts()), 'the team can read contact details');
select ok(public.tap_err($$select public.decide_donation((select id from public.donations where item_id = '3b3b3b3b-0000-0000-0000-000000000001'), 'collected', null)$$) = 'donation_not_open', 'a gift must be accepted before it is collected');
select ok(public.tap_err($$select public.decide_donation((select id from public.donations where item_id = '3b3b3b3b-0000-0000-0000-000000000002'), 'decline', null)$$) = 'reason_required', 'declining needs a reason');
select public.decide_donation((select id from public.donations where item_id = '3b3b3b3b-0000-0000-0000-000000000001'), 'accept', null);
select public.decide_donation((select id from public.donations where item_id = '3b3b3b3b-0000-0000-0000-000000000001'), 'collected', 'Handed to the home on Friday');
select public.decide_donation((select id from public.donations where item_id = '3b3b3b3b-0000-0000-0000-000000000002'), 'decline', 'The home needs children''s sizes only');
reset role;
select ok((select status = 'donated' from public.items where id = '3b3b3b3b-0000-0000-0000-000000000001') and (select status = 'active' from public.items where id = '3b3b3b3b-0000-0000-0000-000000000002'), 'a collected gift is marked donated and a declined one goes back on sale');

-- Donor cancels, public totals
select public.tap_as('3a3a3a3a-0000-0000-0000-00000000000a');
set local role authenticated;
select public.cancel_donation((select id from public.donations where item_id = '3b3b3b3b-0000-0000-0000-000000000003'));
reset role;
select ok((select status = 'active' from public.items where id = '3b3b3b3b-0000-0000-0000-000000000003'), 'cancelling puts the item back on sale');
set local role anon;
select ok((select items_given = 1 and homes_helped = 1 from public.donation_totals()), 'the public totals count collected gifts only');
reset role;

select * from finish();
rollback;
