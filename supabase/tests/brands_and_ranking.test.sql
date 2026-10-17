begin;
select plan(10);

insert into auth.users (id, email, email_confirmed_at) values ('4c4c4c4c-0000-0000-0000-000000000001', 'bs@example.com', now());
update public.users set handle = 'b_seller', display_name = 'S', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '4c4c4c4c-0000-0000-0000-000000000001';

create function pg_temp.add_item(p_n integer, p_brand text, p_price integer, p_status text) returns uuid language sql as $$
  insert into public.items (seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, brand_text, published_at)
  values ('4c4c4c4c-0000-0000-0000-000000000001', 'Brand test item number ' || p_n, (select c.id from public.categories c where c.slug = 'women-dresses'),
    (select s.id from public.sizes s order by s.id limit 1), 'very_good', array['blue'], p_price, (select tw.id from public.towns tw where tw.name = 'Windhoek'),
    p_status::public.item_status, p_brand, now())
  returning id $$;

-- Brand linking
select pg_temp.add_item(1, 'NIKE', 100000, 'active');
select pg_temp.add_item(2, 'Levi''s', 100000, 'active');
select pg_temp.add_item(3, 'Some Local Label', 100000, 'active');
select ok((select brand_id = (select id from public.brands where slug = 'nike') from public.items where title like '%number 1'), 'a known brand is linked whatever the capital letters');
select ok((select brand_id = (select id from public.brands where slug = 'levis') from public.items where title like '%number 2'), 'punctuation does not stop a brand matching');
select ok((select brand_id is null and brand_text = 'Some Local Label' from public.items where title like '%number 3'), 'an unknown brand keeps its text and has no link');
update public.items set brand_text = 'Adidas' where title like '%number 3';
select ok((select brand_id = (select id from public.brands where slug = 'adidas') from public.items where title like '%number 3'), 'editing the brand text re-links it');
update public.items set brand_text = null where title like '%number 3';
select ok((select brand_id is null from public.items where title like '%number 3'), 'clearing the brand text clears the link');

-- Trusted sellers first
select ok((select not bool_or(seller_trusted) from public.items), 'nobody is trusted at the start');
update public.users set is_trusted_seller = true where id = '4c4c4c4c-0000-0000-0000-000000000001';
select ok((select bool_and(seller_trusted) from public.items), 'becoming a trusted seller marks all their listings');
select pg_temp.add_item(4, null, 100000, 'active');
select ok((select seller_trusted from public.items where title like '%number 4'), 'a new listing from a trusted seller is marked at once');

-- Price far below normal: five comparables of N$1,000 Nike dresses are already there after these inserts
select pg_temp.add_item(5, 'Nike', 100000, 'active');
select pg_temp.add_item(6, 'Nike', 100000, 'active');
select pg_temp.add_item(7, 'Nike', 100000, 'active');
select pg_temp.add_item(8, 'Nike', 100000, 'active');
select pg_temp.add_item(9, 'Nike', 10000, 'draft');
update public.items set status = 'active' where title like '%number 9';
select ok((select count(*) = 1 from public.item_flags f join public.items i on i.id = f.item_id where f.reason = 'price_low' and i.title like '%number 9'), 'a Nike dress at a tenth of the usual price is flagged for a moderator');
select pg_temp.add_item(10, 'Nike', 90000, 'draft');
update public.items set status = 'active' where title like '%number 10';
select ok((select count(*) = 0 from public.item_flags f join public.items i on i.id = f.item_id where f.reason = 'price_low' and i.title like '%number 10'), 'a fair price is not flagged');

select * from finish();
rollback;
