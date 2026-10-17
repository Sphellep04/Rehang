begin;
select plan(4);

insert into auth.users (id, phone) values
  ('cccccccc-0000-0000-0000-000000000001', '+264810000011'),
  ('cccccccc-0000-0000-0000-000000000002', '+264810000012');
insert into public.notifications (user_id, kind) values
  ('cccccccc-0000-0000-0000-000000000001', 'order_created'),
  ('cccccccc-0000-0000-0000-000000000002', 'order_created');

select ok(not has_function_privilege('anon', 'public.mark_notifications_read()', 'execute'), 'anonymous visitors cannot mark notifications');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000001', true);
select public.mark_notifications_read();
select ok((select count(*) = 0 from public.notifications where read_at is null), 'own notifications are marked as read');
select ok((select count(*) = 1 from public.notifications), 'a person only sees their own notifications');
reset role;

select ok((select read_at is null from public.notifications where user_id = 'cccccccc-0000-0000-0000-000000000002'), 'other people''s notifications stay unread');

select * from finish();
rollback;
