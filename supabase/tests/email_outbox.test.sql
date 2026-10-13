begin;
select plan(14);

insert into auth.users (id, email, email_confirmed_at) values
  ('15151515-0000-0000-0000-000000000001', 'sel@example.com', now()),
  ('15151515-0000-0000-0000-000000000002', 'fol@example.com', now()),
  ('15151515-0000-0000-0000-000000000003', 'opt@example.com', now());
update public.users set handle = 'eo_seller', display_name = 'Seller', status = 'active', terms_accepted_at = now() where id = '15151515-0000-0000-0000-000000000001';
update public.users set handle = 'eo_follower', display_name = 'Follower', status = 'active', terms_accepted_at = now() where id = '15151515-0000-0000-0000-000000000002';
update public.users set handle = 'eo_optout', display_name = 'Opt', status = 'active', terms_accepted_at = now(), email_alerts = false, email_digest = false where id = '15151515-0000-0000-0000-000000000003';

insert into public.follows (follower_id, seller_id) values
  ('15151515-0000-0000-0000-000000000002', '15151515-0000-0000-0000-000000000001'),
  ('15151515-0000-0000-0000-000000000003', '15151515-0000-0000-0000-000000000001');
insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
values ('16161616-0000-0000-0000-000000000001', '15151515-0000-0000-0000-000000000001', 'Fresh digest item',
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['blue'], 12000, (select t.id from public.towns t where t.name = 'Windhoek'), 'active', now() - interval '1 hour');

select ok(not has_function_privilege('authenticated', 'public.emails_due(integer)', 'execute'), 'members cannot read the email queue');
select ok(has_function_privilege('service_role', 'public.emails_due(integer)', 'execute'), 'the server job can read the email queue');

select public.notify_user('15151515-0000-0000-0000-000000000002', 'offer_received', '{}'::jsonb);
select public.notify_user('15151515-0000-0000-0000-000000000003', 'offer_received', '{}'::jsonb);

select ok((select count(*) = 1 from public.emails_due(50) where email = 'fol@example.com'), 'a notification becomes one email');
select ok((select count(*) = 0 from public.emails_due(50) where email = 'opt@example.com'), 'opted-out people are never emailed');
select ok((select emailed_at is not null from public.notifications where user_id = '15151515-0000-0000-0000-000000000003'), 'opted-out notifications are closed so they do not pile up');

select ok(public.mark_emailed(array(select notification_id from public.emails_due(50))) = 1, 'sent emails are marked');
select ok((select count(*) = 0 from public.emails_due(50)), 'a sent email is not sent twice');

update public.notifications set emailed_at = null, created_at = now() - interval '3 days' where user_id = '15151515-0000-0000-0000-000000000002';
select ok((select count(*) = 0 from public.emails_due(50)), 'stale notifications are dropped instead of emailed late');

select ok((select count(*) = 1 and item_count = 1 and email = 'fol@example.com' from public.digest_candidates() group by email, item_count), 'the digest lists new items from followed sellers');
select ok((select count(*) = 0 from public.digest_candidates() where email = 'opt@example.com'), 'the digest respects the opt-out');
select public.mark_digest_sent(array['15151515-0000-0000-0000-000000000002'::uuid]);
select ok((select count(*) = 0 from public.digest_candidates()), 'one digest per day');

-- Meet-up reminders
insert into public.items (id, seller_id, title, category_id, size_id, condition, colours, price_cents, town_id, status, published_at)
values ('16161616-0000-0000-0000-000000000002', '15151515-0000-0000-0000-000000000001', 'Reminder item here',
  (select c.id from public.categories c where c.slug = 'women-dresses'), (select s.id from public.sizes s order by s.id limit 1),
  'good', array['blue'], 12000, (select t.id from public.towns t where t.name = 'Windhoek'), 'reserved', now());
insert into public.orders (id, item_id, buyer_id, seller_id, amount_cents, status, meetup_at, meetup_confirmed_at)
values ('17171717-0000-0000-0000-000000000001', '16161616-0000-0000-0000-000000000002', '15151515-0000-0000-0000-000000000002', '15151515-0000-0000-0000-000000000001', 12000, 'awaiting_meetup', now() + interval '2 hours', now());
select ok(public.queue_meetup_reminders() = 1, 'a confirmed meet-up in 2 hours gets a reminder');
select ok((select count(*) = 2 from public.notifications where kind = 'meetup_reminder'), 'both people are reminded');
select ok(public.queue_meetup_reminders() = 0, 'reminders are queued only once');

select * from finish();
rollback;
