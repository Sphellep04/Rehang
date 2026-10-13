grant execute on function public.users_blocked_pair(uuid, uuid) to anon;

 drop policy items_read_public_or_owner on public.items;

create policy items_read_public_or_owner
on public.items for select to anon, authenticated
using (
  seller_id = (select auth.uid())
  or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role)
  or (
    status in ('active'::public.item_status, 'reserved'::public.item_status, 'sold'::public.item_status)
    and not (select public.users_blocked_pair((select auth.uid()), seller_id))
  )
);
