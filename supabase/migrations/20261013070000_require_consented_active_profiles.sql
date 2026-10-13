drop policy items_create_draft on public.items;
create policy items_create_draft on public.items for insert to authenticated
with check (
  seller_id = (select auth.uid())
  and status = 'draft'::public.item_status
  and exists (
    select 1
    from public.users as u
    where u.id = (select auth.uid())
      and u.status = 'active'
      and u.terms_accepted_at is not null
      and (u.restricted_until is null or u.restricted_until <= now())
  )
);

drop policy items_update_owner on public.items;
create policy items_update_owner on public.items for update to authenticated
using (
  seller_id = (select auth.uid())
  and status in ('draft'::public.item_status, 'awaiting_verification'::public.item_status, 'active'::public.item_status)
  and exists (
    select 1
    from public.users as u
    where u.id = (select auth.uid())
      and u.status = 'active'
      and u.terms_accepted_at is not null
      and (u.restricted_until is null or u.restricted_until <= now())
  )
)
with check (
  seller_id = (select auth.uid())
  and status in ('draft'::public.item_status, 'awaiting_verification'::public.item_status, 'active'::public.item_status)
  and exists (
    select 1
    from public.users as u
    where u.id = (select auth.uid())
      and u.status = 'active'
      and u.terms_accepted_at is not null
      and (u.restricted_until is null or u.restricted_until <= now())
  )
);
