-- Account deletion. Personal details are erased, but order records and other people's reviews
-- stay, because the other party in a trade still needs them. Sign-in is closed by the app, which
-- also removes the auth account (see deleteAccount in app/account/actions.ts).

alter table public.users drop constraint if exists users_status_check;
alter table public.users add constraint users_status_check
  check (status in ('active', 'restricted', 'suspended', 'banned', 'deleted'));

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  who public.users%rowtype;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select * into who from public.users where id = me for update;
  if not found or who.status = 'deleted' then
    raise exception 'account_not_active' using errcode = 'P0001';
  end if;
  if who.role in ('moderator'::public.user_role, 'admin'::public.user_role) then
    raise exception 'staff_cannot_self_delete' using errcode = 'P0001';
  end if;
  -- Finish or cancel trades first, so nobody is left waiting at a meet-up.
  if exists (select 1 from public.orders o where o.status = 'awaiting_meetup' and me in (o.buyer_id, o.seller_id)) then
    raise exception 'open_orders' using errcode = 'P0001';
  end if;

  update public.offers set status = 'withdrawn'
  where status = 'open' and (buyer_id = me or item_id in (select i.id from public.items i where i.seller_id = me));

  update public.items set status = 'removed'
  where seller_id = me and status in ('draft', 'awaiting_verification', 'active', 'reserved');

  delete from public.favourites where user_id = me;
  delete from public.follows where follower_id = me or seller_id = me;
  delete from public.blocks where blocker_id = me or blocked_id = me;
  delete from public.notifications where user_id = me;
  update public.messages set body = '[message deleted]', flagged_contact = false where sender_id = me;

  -- ID photos are queued for deletion straight away, and the ID number hash is released.
  update public.verifications
  set delete_images_after = least(coalesce(delete_images_after, now()), now()), id_number_hash = null, legal_name = null
  where user_id = me;

  update public.users
  set status = 'deleted',
      handle = 'deleted_' || right(replace(me::text, '-', ''), 12),
      display_name = 'Deleted member',
      legal_name = null, email = null, phone = null, photo_url = null, bio = null,
      id_number_hash = null, town_id = null,
      is_trusted_seller = false, is_founding_seller = false
  where id = me;
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
