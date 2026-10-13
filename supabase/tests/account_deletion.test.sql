begin;
select plan(13);

insert into auth.users (id, email, email_confirmed_at) values
  ('33333333-0000-0000-0000-000000000001', 'leaver@example.com', now()),
  ('33333333-0000-0000-0000-000000000002', 'other@example.com', now());
update public.users set handle = 'leaver', display_name = 'Leaver', legal_name = 'Lea Ver', status = 'active', terms_accepted_at = now(), bio = 'hello', id_number_hash = repeat('b', 64) where id = '33333333-0000-0000-0000-000000000001';
update public.users set handle = 'stayer', display_name = 'Stayer', status = 'active', terms_accepted_at = now() where id = '33333333-0000-0000-0000-000000000002';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select t.id, '33333333-0000-0000-0000-000000000001', 'Leaving closet item ' || t.n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['red'], 10000, (select tw.id from public.towns tw where tw.name = 'Windhoek'), t.status, now()
from (values
  (1, '22222222-0000-0000-0000-000000000001'::uuid, 'active'::public.item_status),
  (2, '22222222-0000-0000-0000-000000000002'::uuid, 'sold'::public.item_status),
  (3, '22222222-0000-0000-0000-000000000003'::uuid, 'reserved'::public.item_status)
) as t(n, id, status);
insert into public.favourites (user_id, item_id) values ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001');
insert into public.follows (follower_id, seller_id) values ('33333333-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001');
insert into public.verifications (user_id, type, status, document_path, selfie_path, id_number_hash, legal_name, delete_images_after)
values ('33333333-0000-0000-0000-000000000001', 'id_document', 'approved', 'a/id.jpg', 'a/s.jpg', repeat('b', 64), 'Lea Ver', now() + interval '5 days');
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, status)
values ('11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 10000, 'awaiting_meetup');
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, status, completed_at)
values ('11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000001', 10000, 'completed', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-0000-0000-0000-000000000001', true);

do $$ begin
  perform public.delete_my_account();
  raise exception 'deleted with open order';
exception when others then
  if sqlerrm <> 'open_orders' then raise; end if;
end $$;
select ok(true, 'accounts with an open order cannot be deleted yet');
reset role;
select ok((select status = 'active' from public.users where id = '33333333-0000-0000-0000-000000000001'), 'a refused deletion changes nothing');

update public.orders set status = 'cancelled' where id = '11111111-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-0000-0000-0000-000000000001', true);
select public.delete_my_account();
reset role;

select ok((select status = 'deleted' and display_name = 'Deleted member' and handle like 'deleted\_%' from public.users where id = '33333333-0000-0000-0000-000000000001'), 'the profile is anonymised');
select ok((select email is null and legal_name is null and bio is null and id_number_hash is null from public.users where id = '33333333-0000-0000-0000-000000000001'), 'personal details are erased');
select ok((select status = 'removed' from public.items where id = '22222222-0000-0000-0000-000000000001'), 'live listings are removed');
select ok((select status = 'sold' from public.items where id = '22222222-0000-0000-0000-000000000002'), 'sold items keep their history');
select ok((select count(*) = 0 from public.follows where seller_id = '33333333-0000-0000-0000-000000000001'), 'follows are removed');
select ok((select id_number_hash is null and legal_name is null and delete_images_after <= now() from public.verifications where user_id = '33333333-0000-0000-0000-000000000001'), 'ID photos are queued for deletion and the hash is released');
select ok((select count(*) = 2 from public.orders where seller_id = '33333333-0000-0000-0000-000000000001'), 'order records are kept for the other party');

set local role anon;
select ok((select count(*) = 0 from public.public_profiles where id = '33333333-0000-0000-0000-000000000001'), 'a deleted shop disappears from public view');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-0000-0000-0000-000000000001', true);
do $$ begin
  perform public.delete_my_account();
  raise exception 'deleted twice';
exception when others then
  if sqlerrm <> 'account_not_active' then raise; end if;
end $$;
select ok(true, 'a deleted account cannot be deleted again');
reset role;

-- A deleted ID hash can be used again by the person's replacement account.
insert into auth.users (id, email, email_confirmed_at) values ('33333333-0000-0000-0000-000000000003', 'new@example.com', now());
update public.users set handle = 'comeback', display_name = 'Back', status = 'active', terms_accepted_at = now(), id_number_hash = repeat('b', 64) where id = '33333333-0000-0000-0000-000000000003';
select ok((select id_number_hash = repeat('b', 64) from public.users where id = '33333333-0000-0000-0000-000000000003'), 'the ID can be used again after deletion');

update public.users set role = 'moderator' where id = '33333333-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-0000-0000-0000-000000000002', true);
do $$ begin
  perform public.delete_my_account();
  raise exception 'staff deleted';
exception when others then
  if sqlerrm <> 'staff_cannot_self_delete' then raise; end if;
end $$;
select ok(true, 'staff accounts must be demoted before deletion');
reset role;

select * from finish();
rollback;
