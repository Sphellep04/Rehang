begin;
select plan(11);

insert into auth.users (id, email, email_confirmed_at) values
  ('66666666-0000-0000-0000-000000000001', 'buyer@example.com', now()),
  ('66666666-0000-0000-0000-000000000002', 'seller@example.com', now()),
  ('66666666-0000-0000-0000-000000000003', 'stranger@example.com', now());
update public.users set handle = 'rev_buyer', display_name = 'Buyer', status = 'active', terms_accepted_at = now() where id = '66666666-0000-0000-0000-000000000001';
update public.users set handle = 'rev_seller', display_name = 'Seller', status = 'active', terms_accepted_at = now() where id = '66666666-0000-0000-0000-000000000002';
update public.users set handle = 'rev_other', display_name = 'Other', status = 'active', terms_accepted_at = now() where id = '66666666-0000-0000-0000-000000000003';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select ('55555555-0000-0000-0000-00000000000' || n)::uuid, '66666666-0000-0000-0000-000000000002', 'Reviewed dress ' || n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['red'], 10000, (select t.id from public.towns t where t.name = 'Windhoek'), 'sold', now()
from generate_series(1, 3) as n;
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, status, completed_at) values
  ('44444444-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 10000, 'completed', now()),
  ('44444444-0000-0000-0000-000000000002', '55555555-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 10000, 'completed', now() - interval '8 days'),
  ('44444444-0000-0000-0000-000000000003', '55555555-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 10000, 'awaiting_meetup', null);
insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select '55555555-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000002', 'Reviewed dress four',
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['red'], 10000, (select t.id from public.towns t where t.name = 'Windhoek'), 'sold', now();
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, status, completed_at)
values ('44444444-0000-0000-0000-000000000004', '55555555-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 10000, 'completed', now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '66666666-0000-0000-0000-000000000001', true);

insert into public.reviews (order_id, reviewee_id, rating, comment) values ('44444444-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 5, 'Lovely dress, easy meet-up');
select ok((select count(*) = 1 from public.reviews), 'a buyer can review the seller after a completed order');

do $$ begin
  insert into public.reviews (order_id, reviewee_id, rating) values ('44444444-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 4);
  raise exception 'second review accepted';
exception when unique_violation then null;
end $$;
select ok(true, 'one review per person per order');

do $$ begin
  insert into public.reviews (order_id, reviewee_id, rating) values ('44444444-0000-0000-0000-000000000002', '66666666-0000-0000-0000-000000000002', 5);
  raise exception 'late review accepted';
exception when insufficient_privilege then null;
end $$;
select ok(true, 'reviews close 7 days after completion');

do $$ begin
  insert into public.reviews (order_id, reviewee_id, rating) values ('44444444-0000-0000-0000-000000000003', '66666666-0000-0000-0000-000000000002', 5);
  raise exception 'open order reviewed';
exception when insufficient_privilege then null;
end $$;
select ok(true, 'orders that are not complete cannot be reviewed');

do $$ begin
  insert into public.reviews (order_id, reviewee_id, rating) values ('44444444-0000-0000-0000-000000000004', '66666666-0000-0000-0000-000000000003', 5);
  raise exception 'wrong reviewee accepted';
exception when insufficient_privilege then null;
end $$;
select ok(true, 'a review must be about the other person in the order');

do $$ begin
  insert into public.reviews (order_id, reviewee_id, rating) values ('44444444-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 6);
  raise exception 'rating 6 accepted';
exception when check_violation then null;
end $$;
select ok(true, 'ratings must be 1 to 5');

select set_config('request.jwt.claim.sub', '66666666-0000-0000-0000-000000000003', true);
do $$ begin
  insert into public.reviews (order_id, reviewee_id, rating) values ('44444444-0000-0000-0000-000000000001', '66666666-0000-0000-0000-000000000002', 1);
  raise exception 'stranger reviewed';
exception when insufficient_privilege then null;
end $$;
select ok(true, 'strangers cannot review an order');
reset role;

set local role anon;
select ok((select average = 5.0 and review_count = 1 from public.rating_summary('66666666-0000-0000-0000-000000000002')), 'visitors can read a rating summary');
select ok((select count(*) = 1 from public.reviews), 'reviews are public');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '66666666-0000-0000-0000-000000000001', true);
select public.set_profile_photo('https://abc.supabase.co/storage/v1/object/public/avatars/66666666-0000-0000-0000-000000000001/me.webp');
select ok((select photo_url like '%/66666666-0000-0000-0000-000000000001/me.webp' from public.users where id = '66666666-0000-0000-0000-000000000001'), 'a person can set a photo from their own folder');
do $$ begin
  perform public.set_profile_photo('https://evil.example/tracker.png');
  raise exception 'foreign url accepted';
exception when others then
  if sqlerrm <> 'invalid_photo' then raise; end if;
end $$;
select ok(true, 'profile photos must come from the avatars bucket');
reset role;

select * from finish();
rollback;
