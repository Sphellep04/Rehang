begin;
select plan(12);

-- An email sign-up starts at level 0 and moves to level 1 once the email is confirmed.
insert into auth.users (id, email) values ('99999999-0000-0000-0000-000000000001', 'new@example.com');
select ok((select email = 'new@example.com' and verification_level = 'level0' from public.users where id = '99999999-0000-0000-0000-000000000001'), 'sign-up copies the email and starts unverified');
update auth.users set email_confirmed_at = now() where id = '99999999-0000-0000-0000-000000000001';
select ok((select verification_level = 'level1' from public.users where id = '99999999-0000-0000-0000-000000000001'), 'confirming the email grants level 1');

insert into auth.users (id, email, email_confirmed_at) values ('99999999-0000-0000-0000-000000000002', 'ok@example.com', now());
select ok((select verification_level = 'level1' from public.users where id = '99999999-0000-0000-0000-000000000002'), 'an already confirmed email starts at level 1');

-- Fixtures: a level 1 seller, a level 2 seller, a moderator.
insert into auth.users (id, email, email_confirmed_at) values
  ('99999999-0000-0000-0000-000000000003', 'two@example.com', now()),
  ('99999999-0000-0000-0000-000000000004', 'mod@example.com', now());
update public.users set handle = 'seller_one', display_name = 'One', status = 'active', terms_accepted_at = now() where id = '99999999-0000-0000-0000-000000000001';
update public.users set handle = 'seller_two', display_name = 'Two', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '99999999-0000-0000-0000-000000000003';
update public.users set handle = 'mod_four', display_name = 'Mod', status = 'active', terms_accepted_at = now(), role = 'moderator' where id = '99999999-0000-0000-0000-000000000004';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status)
select v.id, v.seller, 'Cotton draft dress ' || v.n,
  (select c.id from public.categories c where c.slug = 'women-dresses'),
  (select s.id from public.sizes s order by s.id limit 1),
  'good', array['black'], 10000, (select t.id from public.towns t where t.name = 'Windhoek'), 'draft'
from (values
  ('88888888-0000-0000-0000-000000000001'::uuid, '99999999-0000-0000-0000-000000000001'::uuid, 1),
  ('88888888-0000-0000-0000-000000000002'::uuid, '99999999-0000-0000-0000-000000000003'::uuid, 2),
  ('88888888-0000-0000-0000-000000000003'::uuid, '99999999-0000-0000-0000-000000000003'::uuid, 3)
) as v(id, seller, n);

insert into public.item_photos (item_id, position, kind, path_thumb, path_card, path_full, width, height)
select i, k.pos, k.kind::public.item_photo_kind, 'a', 'b', 'c', 100, 100
from unnest(array['88888888-0000-0000-0000-000000000001'::uuid, '88888888-0000-0000-0000-000000000002'::uuid]) as i
cross join (values (1, 'front'), (2, 'back'), (3, 'label')) as k(pos, kind);

set local role authenticated;

select set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000003', true);
do $$ begin
  perform public.publish_item('88888888-0000-0000-0000-000000000003');
  raise exception 'published without photos';
exception when others then
  if sqlerrm <> 'photos_missing' then raise; end if;
end $$;
select ok(true, 'listings need front, back and label photos before publishing');

select ok(public.publish_item('88888888-0000-0000-0000-000000000002') = 'active', 'a verified seller publishes straight away');
select ok((select published_at is not null from public.items where id = '88888888-0000-0000-0000-000000000002'), 'publishing stamps the publish time');

do $$ begin
  perform public.publish_item('88888888-0000-0000-0000-000000000001');
  raise exception 'wrong owner';
exception when others then
  if sqlerrm <> 'item_not_found' then raise; end if;
end $$;
select ok(true, 'people cannot publish other sellers'' listings');

select set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000001', true);
select ok(public.publish_item('88888888-0000-0000-0000-000000000001') = 'awaiting_verification', 'an unverified seller''s listing waits for ID verification');

set local role anon;
select ok((select count(*) = 0 from public.items where id = '88888888-0000-0000-0000-000000000001'), 'waiting listings are not public');
reset role;

-- Approval puts waiting listings live.
set local role authenticated;
select set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000001', true);
select public.submit_id_verification('99999999-0000-0000-0000-000000000001/id.jpg', '99999999-0000-0000-0000-000000000001/selfie.jpg');
select set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000004', true);
select public.review_verification((select id from public.verifications limit 1), 'approve');
select ok((select status = 'active' and published_at is not null from public.items where id = '88888888-0000-0000-0000-000000000001'), 'approving an ID publishes the seller''s waiting listings');
reset role;

do $$ begin
  update public.users set handle = 'verify' where id = '99999999-0000-0000-0000-000000000001';
  raise exception 'reserved';
exception when check_violation then null;
end $$;
select ok(true, 'new route names are reserved');

select ok(not has_function_privilege('anon', 'public.publish_item(uuid)', 'execute'), 'anonymous visitors cannot publish');

select * from finish();
rollback;
