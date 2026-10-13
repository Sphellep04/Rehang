-- Public rating summary for a person, and a safe way to set a profile photo.

create or replace function public.rating_summary(p_user uuid)
returns table (average numeric, review_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select round(avg(r.rating)::numeric, 1), count(*)
  from public.reviews r
  where r.reviewee_id = p_user
    and exists (select 1 from public.users u where u.id = p_user and u.status = 'active')
$$;
revoke all on function public.rating_summary(uuid) from public;
grant execute on function public.rating_summary(uuid) to anon, authenticated;

create index if not exists reviews_reviewee_created_idx on public.reviews (reviewee_id, created_at desc);

-- The photo must be a file the person uploaded to their own folder in the public avatars bucket.
create or replace function public.set_profile_photo(p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if p_url is not null and (char_length(p_url) > 500 or p_url !~ ('^https?://[^/]+/storage/v1/object/public/avatars/' || me::text || '/[A-Za-z0-9._-]+$')) then
    raise exception 'invalid_photo' using errcode = 'P0001';
  end if;
  update public.users set photo_url = p_url where id = me;
end;
$$;
revoke all on function public.set_profile_photo(text) from public, anon;
grant execute on function public.set_profile_photo(text) to authenticated;
