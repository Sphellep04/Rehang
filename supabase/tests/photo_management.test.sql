begin;
select plan(12);

insert into auth.users (id, email, email_confirmed_at) values
  ('15151515-0000-0000-0000-000000000001', 'ps@example.com', now()),
  ('15151515-0000-0000-0000-000000000002', 'po@example.com', now());
update public.users set handle = 'ph_seller', display_name = 'S', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '15151515-0000-0000-0000-000000000001';
update public.users set handle = 'ph_other', display_name = 'O', status = 'active', terms_accepted_at = now(), verification_level = 'level2' where id = '15151515-0000-0000-0000-000000000002';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
select t.id, t.seller, 'Photo item number ' || t.n,
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  t.cond::public.item_condition, array['blue'], 20000, (select tw.id from public.towns tw where tw.name = 'Windhoek'), t.st::public.item_status, now()
from (values
  (1, '16161616-0000-0000-0000-000000000001'::uuid, '15151515-0000-0000-0000-000000000001'::uuid, 'very_good', 'active'),
  (2, '16161616-0000-0000-0000-000000000002'::uuid, '15151515-0000-0000-0000-000000000002'::uuid, 'very_good', 'active'),
  (3, '16161616-0000-0000-0000-000000000003'::uuid, '15151515-0000-0000-0000-000000000001'::uuid, 'good', 'active')
) as t(n, id, seller, cond, st);

-- Another seller already has a photo with this fingerprint.
insert into public.item_photos (item_id, position, kind, path_thumb, path_card, path_full, phash, width, height)
values ('16161616-0000-0000-0000-000000000002', 1, 'front', 'x/t', 'x/c', 'x/f', 'ffff0000ffff0000', 800, 800);

select ok(public.phash_distance('0000000000000000', '000000000000000f') = 4, 'phash distance counts differing bits');

create temp table sets (label text, doc jsonb);
grant all on sets to authenticated;
insert into sets values
 ('ok', '[{"kind":"front","path_thumb":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/a-thumb.webp","path_card":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/a-card.webp","path_full":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/a-full.webp","width":900,"height":1200,"phash":"ffff0000ffff0001"},
          {"kind":"back","path_thumb":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/b-thumb.webp","path_card":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/b-card.webp","path_full":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/b-full.webp","width":900,"height":1200,"phash":"1234123412341234"},
          {"kind":"label","path_thumb":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/c-thumb.webp","path_card":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/c-card.webp","path_full":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/c-full.webp","width":900,"height":1200,"phash":null}]'),
 ('foreign', '[{"kind":"front","path_thumb":"15151515-0000-0000-0000-000000000002/x/t","path_card":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/a","path_full":"15151515-0000-0000-0000-000000000001/16161616-0000-0000-0000-000000000001/a","width":900,"height":1200},{"kind":"back","path_thumb":"a","path_card":"a","path_full":"a","width":1,"height":1},{"kind":"label","path_thumb":"a","path_card":"a","path_full":"a","width":1,"height":1}]');

set local role authenticated;
select set_config('request.jwt.claim.sub', '15151515-0000-0000-0000-000000000001', true);

select ok((select public.set_item_photos('16161616-0000-0000-0000-000000000001', doc) = '{}' from sets where label = 'ok'), 'a seller can set photos; nothing old to delete the first time');
select ok((select count(*) = 3 and min(position) = 1 and max(position) = 3 from public.item_photos where item_id = '16161616-0000-0000-0000-000000000001'), 'photos are stored in order');

do $$ begin
  perform public.set_item_photos('16161616-0000-0000-0000-000000000001', (select doc from sets where label = 'foreign'));
  raise exception 'foreign paths accepted';
exception when others then
  if sqlerrm <> 'invalid_photo' then raise; end if;
end $$;
select ok(true, 'paths outside my own folder for this listing are refused');

do $$ begin
  perform public.set_item_photos('16161616-0000-0000-0000-000000000001', '[]'::jsonb);
  raise exception 'empty accepted';
exception when others then
  if sqlerrm <> 'photo_count_invalid' then raise; end if;
end $$;
select ok(true, 'fewer than 3 photos are refused');

do $$ begin
  perform public.set_item_photos('16161616-0000-0000-0000-000000000003', (select doc from sets where label = 'ok'));
  raise exception 'wrong item accepted';
exception when others then
  if sqlerrm <> 'invalid_photo' then raise; end if;
end $$;
select ok(true, 'photos for a different listing folder are refused');

do $$ begin
  perform public.set_item_photos('16161616-0000-0000-0000-000000000002', (select doc from sets where label = 'ok'));
  raise exception 'not my item accepted';
exception when others then
  if sqlerrm <> 'item_not_found' then raise; end if;
end $$;
select ok(true, 'someone else''s listing cannot be changed');

reset role;
select ok((select count(*) = 1 from public.item_flags where item_id = '16161616-0000-0000-0000-000000000001' and reason = 'duplicate_photo'), 'a near copy of another seller''s photo is flagged');
select ok((select (detail->>'distance')::int = 1 from public.item_flags limit 1), 'the flag records how close the match was');

set local role authenticated;
select set_config('request.jwt.claim.sub', '15151515-0000-0000-0000-000000000001', true);
-- Replacing again returns the old files for deletion.
update sets set doc = replace(doc::text, '/a-', '/z-')::jsonb where label = 'ok';
select ok((select array_length(public.set_item_photos('16161616-0000-0000-0000-000000000001', doc), 1) = 3 from sets where label = 'ok'), 'replacing a photo returns the replaced files');

select ok((select count(*) = 0 from public.item_flags), 'sellers cannot read photo flags');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '15151515-0000-0000-0000-000000000002', true);
do $$ begin
  perform public.resolve_item_flag(gen_random_uuid());
  raise exception 'non moderator resolved';
exception when others then
  if sqlerrm <> 'not_allowed' then raise; end if;
end $$;
select ok(true, 'only moderators can resolve flags');

select * from finish();
rollback;
