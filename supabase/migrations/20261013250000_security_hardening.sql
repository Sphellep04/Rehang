-- Security hardening pass.
-- 1. Settings: visitors only need the public ones. Limits that tune abuse checks (message caps, order limits) are for staff.
-- 2. Photos: published photos can no longer be overwritten in place, and each person has an upload ceiling so one account cannot fill storage.

drop policy if exists app_config_read on public.app_config;
create policy app_config_read_public on public.app_config for select to anon, authenticated
  using (key in ('minimum_offer_percent', 'buyer_fee_cents', 'commission_bps', 'signup_requires_invite',
                 'boosts_enabled', 'bundles_enabled', 'courier_enabled', 'donations_enabled', 'dropoff_points_enabled',
                 'payments_enabled', 'payouts_enabled'));
create policy app_config_read_staff on public.app_config for select to authenticated
  using ((select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));

-- Photo files are immutable once uploaded. A seller replaces a photo by uploading a new file and removing the old one.
drop policy if exists item_photos_owner_update on storage.objects;

-- Upload ceilings per person (counted by the folder named after their id).
create or replace function public.storage_under_limit(p_bucket text, p_name text, p_limit integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from storage.objects o
          where o.bucket_id = p_bucket and split_part(o.name, '/', 1) = split_part(p_name, '/', 1)) < p_limit
$$;
revoke all on function public.storage_under_limit(text, text, integer) from public, anon;
grant execute on function public.storage_under_limit(text, text, integer) to authenticated;

drop policy if exists item_photos_owner_insert on storage.objects;
create policy item_photos_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'item-photos' and split_part(name, '/', 1) = (select auth.uid())::text and public.storage_under_limit('item-photos', name, 1500));

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text and public.storage_under_limit('avatars', name, 20));

drop policy if exists id_documents_owner_insert on storage.objects;
create policy id_documents_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'id-documents' and split_part(name, '/', 1) = (select auth.uid())::text and public.storage_under_limit('id-documents', name, 12));
