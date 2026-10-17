-- Lets a signed-in person mark their own notifications as read. Clients have select-only access
-- to the table, so this is a narrow security-definer function rather than an update grant.
create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
  set read_at = now()
  where user_id = (select auth.uid()) and read_at is null
$$;

revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;
