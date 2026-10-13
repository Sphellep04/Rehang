begin;
select plan(13);

insert into auth.users (id, email, email_confirmed_at) values
  ('77777777-0000-0000-0000-000000000001', 'a@example.com', now()),
  ('77777777-0000-0000-0000-000000000002', 'b@example.com', now()),
  ('77777777-0000-0000-0000-000000000003', 'm@example.com', now());
update public.users set handle = 'person_a', display_name = 'A', status = 'active', terms_accepted_at = now() where id = '77777777-0000-0000-0000-000000000001';
update public.users set handle = 'person_b', display_name = 'B', status = 'active', terms_accepted_at = now() where id = '77777777-0000-0000-0000-000000000002';
update public.users set handle = 'mod_c', display_name = 'M', status = 'active', terms_accepted_at = now(), role = 'moderator' where id = '77777777-0000-0000-0000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-0000-0000-0000-000000000001', true);

do $$ begin
  perform public.submit_id_verification('77777777-0000-0000-0000-000000000001/i.jpg', '77777777-0000-0000-0000-000000000001/s.jpg', 'not-a-hash', 'Anna Example');
  raise exception 'bad hash accepted';
exception when others then
  if sqlerrm <> 'invalid_id_number' then raise; end if;
end $$;
select ok(true, 'only a proper hash is accepted, never a raw ID number');

do $$ begin
  perform public.submit_id_verification('77777777-0000-0000-0000-000000000001/i.jpg', '77777777-0000-0000-0000-000000000001/s.jpg', repeat('a', 64), 'A');
  raise exception 'short name accepted';
exception when others then
  if sqlerrm <> 'invalid_legal_name' then raise; end if;
end $$;
select ok(true, 'a legal name is required');

select ok(public.submit_id_verification('77777777-0000-0000-0000-000000000001/i.jpg', '77777777-0000-0000-0000-000000000001/s.jpg', repeat('a', 64), '  Anna   Example ') is not null, 'a complete submission is accepted');
select ok((select legal_name = 'Anna Example' from public.verifications limit 1), 'the legal name is tidied up');

-- Someone else cannot reuse the same ID while it is waiting.
select set_config('request.jwt.claim.sub', '77777777-0000-0000-0000-000000000002', true);
do $$ begin
  perform public.submit_id_verification('77777777-0000-0000-0000-000000000002/i.jpg', '77777777-0000-0000-0000-000000000002/s.jpg', repeat('a', 64), 'Bob Example');
  raise exception 'duplicate accepted';
exception when others then
  if sqlerrm <> 'id_already_used' then raise; end if;
end $$;
select ok(true, 'the same ID cannot back a second account');

-- Approval copies name and hash.
select set_config('request.jwt.claim.sub', '77777777-0000-0000-0000-000000000003', true);
select public.review_verification((select id from public.verifications limit 1), 'approve');
reset role;
select ok((select legal_name = 'Anna Example' and id_number_hash = repeat('a', 64) and verification_level = 'level2' from public.users where id = '77777777-0000-0000-0000-000000000001'), 'approval stores the name and hash on the account');

set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-0000-0000-0000-000000000002', true);
do $$ begin
  perform public.submit_id_verification('77777777-0000-0000-0000-000000000002/i.jpg', '77777777-0000-0000-0000-000000000002/s.jpg', repeat('a', 64), 'Bob Example');
  raise exception 'duplicate accepted after approval';
exception when others then
  if sqlerrm <> 'id_already_used' then raise; end if;
end $$;
select ok(true, 'an approved ID stays blocked for other accounts');
reset role;

-- Clean-up queue.
select ok(not has_function_privilege('authenticated', 'public.id_images_due_for_deletion()', 'execute'), 'members cannot see the deletion queue');
select ok(has_function_privilege('service_role', 'public.id_images_due_for_deletion()', 'execute'), 'the service role can read the deletion queue');
select ok((select count(*) = 0 from public.id_images_due_for_deletion()), 'images are kept until 7 days after review');

update public.verifications set delete_images_after = now() - interval '1 minute';
select ok((select count(*) = 1 from public.id_images_due_for_deletion()), 'images become due after the retention period');
select ok(public.mark_id_images_deleted(array(select id from public.verifications)) = 1, 'marking images deleted reports how many rows changed');
select ok((select document_path is null and selfie_path is null and images_deleted_at is not null from public.verifications limit 1) and (select count(*) = 0 from public.id_images_due_for_deletion()), 'deleted images leave the queue and no paths remain');

select * from finish();
rollback;
