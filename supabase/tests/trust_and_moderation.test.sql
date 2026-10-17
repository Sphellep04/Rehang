begin;
select plan(25);

insert into auth.users (id, phone) values
  ('dddddddd-0000-0000-0000-000000000001', '+264810000021'),
  ('dddddddd-0000-0000-0000-000000000002', '+264810000022'),
  ('dddddddd-0000-0000-0000-000000000003', '+264810000023'),
  ('dddddddd-0000-0000-0000-000000000004', '+264810000024');
update public.users set handle = 'mod_one', display_name = 'Mod', status = 'active', role = 'moderator'
where id = 'dddddddd-0000-0000-0000-000000000001';
update public.users set handle = 'seller_two', display_name = 'Seller', status = 'active'
where id = 'dddddddd-0000-0000-0000-000000000002';
update public.users set handle = 'buyer_three', display_name = 'Buyer', status = 'active'
where id = 'dddddddd-0000-0000-0000-000000000003';
update public.users set handle = 'other_four', display_name = 'Other', status = 'active'
where id = 'dddddddd-0000-0000-0000-000000000004';

insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
values ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002', 'Reportable coat',
  (select c.id from public.categories c where c.slug = 'women-dresses'),
  (select s.id from public.sizes s order by s.id limit 1),
  'good', array['black'], 20000, (select t.id from public.towns t where t.name = 'Windhoek'), 'active', now());

-- Buyer files reports.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000003', true);

select ok((select public.file_report('item', 'eeeeeeee-0000-0000-0000-000000000001', 'scam', 'Asks for a deposit') is not null), 'a signed-in person can report an item');
select set_config('test.report_id', (select id::text from public.reports limit 1), true);

do $$ begin
  perform public.file_report('item', 'eeeeeeee-0000-0000-0000-000000000001', 'scam');
  raise exception 'duplicate accepted';
exception when others then
  if sqlerrm <> 'already_reported' then raise; end if;
end $$;
select ok(true, 'the same open report cannot be filed twice');

do $$ begin
  perform public.file_report('user', 'dddddddd-0000-0000-0000-000000000003', 'scam');
  raise exception 'self report accepted';
exception when others then
  if sqlerrm <> 'cannot_report_yourself' then raise; end if;
end $$;
select ok(true, 'people cannot report themselves');

do $$ begin
  perform public.file_report('user', 'dddddddd-0000-0000-0000-000000000004', 'made_up_reason');
  raise exception 'bad reason accepted';
exception when others then
  if sqlerrm <> 'invalid_reason' then raise; end if;
end $$;
select ok(true, 'unknown report reasons are refused');

do $$ begin
  perform public.file_report('item', '99999999-0000-0000-0000-000000000009', 'scam');
  raise exception 'missing target accepted';
exception when others then
  if sqlerrm <> 'report_target_not_found' then raise; end if;
end $$;
select ok(true, 'reports on things that do not exist are refused');

do $$ begin
  insert into public.reports (target_type, target_id, reason) values ('user', 'dddddddd-0000-0000-0000-000000000004', 'scam');
  raise exception 'direct insert accepted';
exception when insufficient_privilege then null;
end $$;
select ok(true, 'reports cannot be inserted directly, only through file_report');

-- Other members cannot see someone else's report or the action log.
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', true);
select ok((select count(*) = 0 from public.reports), 'members cannot read other people''s reports');
select ok((select count(*) = 0 from public.moderator_actions), 'members cannot read the moderator action log');

-- Members cannot moderate or review.
do $$ begin
  perform public.moderate_report(current_setting('test.report_id')::uuid, 'dismiss');
  raise exception 'member moderated';
exception when others then
  if sqlerrm <> 'not_allowed' then raise; end if;
end $$;
select ok(true, 'members cannot resolve reports');

do $$ begin
  update public.users set verification_level = 'level2' where id = 'dddddddd-0000-0000-0000-000000000004';
  if (select verification_level from public.users where id = 'dddddddd-0000-0000-0000-000000000004') = 'level2' then
    raise exception 'self-promoted';
  end if;
exception when insufficient_privilege then null;
end $$;
select ok(true, 'members cannot raise their own verification level');

-- Verification submit.
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', true);
do $$ begin
  perform public.submit_id_verification('dddddddd-0000-0000-0000-000000000003/id.jpg', 'dddddddd-0000-0000-0000-000000000004/selfie.jpg', '8146836981468369814683698146836981468369814683698146836981468369', 'Test Person');
  raise exception 'foreign path accepted';
exception when others then
  if sqlerrm <> 'invalid_upload' then raise; end if;
end $$;
select ok(true, 'ID uploads must live in the person''s own folder');

select ok((select public.submit_id_verification('dddddddd-0000-0000-0000-000000000004/id.jpg', 'dddddddd-0000-0000-0000-000000000004/selfie.jpg', '0732549007325490073254900732549007325490073254900732549007325490', 'Test Person') is not null), 'a person can submit ID and selfie');
select set_config('test.ver_id', (select id::text from public.verifications limit 1), true);

do $$ begin
  perform public.submit_id_verification('dddddddd-0000-0000-0000-000000000004/id2.jpg', 'dddddddd-0000-0000-0000-000000000004/selfie2.jpg', '2644769726447697264476972644769726447697264476972644769726447697', 'Test Person');
  raise exception 'second pending accepted';
exception when others then
  if sqlerrm <> 'verification_already_pending' then raise; end if;
end $$;
select ok(true, 'only one verification can be pending at a time');

do $$ begin
  perform public.review_verification(current_setting('test.ver_id')::uuid, 'approve');
  raise exception 'member approved';
exception when others then
  if sqlerrm <> 'not_allowed' then raise; end if;
end $$;
select ok(true, 'members cannot approve verifications');

-- Moderator work.
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000001', true);
select ok((select count(*) = 1 from public.reports), 'moderators can read reports');

do $$ begin
  perform public.review_verification(current_setting('test.ver_id')::uuid, 'reject');
  raise exception 'reject without reason';
exception when others then
  if sqlerrm <> 'reason_required' then raise; end if;
end $$;
select ok(true, 'rejections need a reason');

select public.review_verification(current_setting('test.ver_id')::uuid, 'approve');
select ok((select verification_level = 'level2' from public.users where id = 'dddddddd-0000-0000-0000-000000000004'), 'approval raises the person to level 2');
select ok((select delete_images_after is not null from public.verifications where id = current_setting('test.ver_id')::uuid), 'approved images are scheduled for deletion');

do $$ begin
  perform public.review_verification(current_setting('test.ver_id')::uuid, 'approve');
  raise exception 'reviewed twice';
exception when others then
  if sqlerrm <> 'already_reviewed' then raise; end if;
end $$;
select ok(true, 'a verification cannot be reviewed twice');

select public.moderate_report(current_setting('test.report_id')::uuid, 'remove_item', 'Deposit request');
select ok((select status = 'removed' from public.items where id = 'eeeeeeee-0000-0000-0000-000000000001'), 'removing an item takes it off sale');
select ok((select status = 'actioned' and handled_by is not null from public.reports where id = current_setting('test.report_id')::uuid), 'the report is marked as actioned');
select ok((select count(*) = 2 from public.moderator_actions), 'every decision lands in the action log');

do $$ begin
  perform public.moderate_report(current_setting('test.report_id')::uuid, 'dismiss');
  raise exception 'handled twice';
exception when others then
  if sqlerrm <> 'report_already_handled' then raise; end if;
end $$;
select ok(true, 'a handled report cannot be handled again');

-- Moderators cannot act against staff, and suspensions block trading.
reset role;
insert into public.reports (id, reporter_id, target_type, target_id, reason)
values ('ffffffff-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003', 'user', 'dddddddd-0000-0000-0000-000000000001', 'scam'),
       ('ffffffff-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000003', 'user', 'dddddddd-0000-0000-0000-000000000002', 'scam');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000001', true);
do $$ begin
  perform public.moderate_report('ffffffff-0000-0000-0000-000000000001', 'suspend_user');
  raise exception 'staff suspended';
exception when others then
  if sqlerrm not in ('cannot_act_on_staff', 'invalid_action') then raise; end if;
end $$;
select ok(true, 'moderators cannot suspend staff accounts');

select public.moderate_report('ffffffff-0000-0000-0000-000000000002', 'suspend_user');
select ok((select status = 'suspended' from public.users where id = 'dddddddd-0000-0000-0000-000000000002'), 'suspending a report subject updates their account');

select * from finish();
rollback;
