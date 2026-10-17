-- Photo management: replace a listing's photos in one step, check them on the server,
-- and flag photos that closely match another seller's photos (a common scam sign).

create table if not exists public.item_flags (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  reason text not null check (reason in ('duplicate_photo')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.users (id) on delete set null,
  resolved_at timestamptz
);
create unique index if not exists item_flags_one_open on public.item_flags (item_id, reason) where resolved_at is null;
alter table public.item_flags enable row level security;
create policy item_flags_moderators_read on public.item_flags for select to authenticated
  using ((select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
grant select on public.item_flags to authenticated;

-- Number of bits that differ between two 16 character hex perceptual hashes.
create or replace function public.phash_distance(a text, b text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select bit_count(('x' || a)::bit(64) # ('x' || b)::bit(64))::integer
$$;

-- Replaces all photos of one of my listings. Returns the storage paths that are no longer used,
-- so the app can delete those files. Photos are 3 to 8, in the order given.
create or replace function public.set_item_photos(p_item uuid, p_photos jsonb)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
  prefix text;
  photo jsonb;
  n integer := 0;
  kinds text[] := '{}';
  old_paths text[];
  kept text[] := '{}';
  hit record;
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  select * into it from public.items where id = p_item and seller_id = me for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if it.status not in ('draft'::public.item_status, 'awaiting_verification'::public.item_status, 'active'::public.item_status) then
    raise exception 'item_not_editable' using errcode = 'P0001';
  end if;
  if public.item_has_open_order(p_item) then
    raise exception 'item_has_open_order' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.users u where u.id = me and u.status = 'active' and u.terms_accepted_at is not null) then
    raise exception 'account_not_active' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) not between 3 and 8 then
    raise exception 'photo_count_invalid' using errcode = 'P0001';
  end if;

  prefix := me::text || '/' || p_item::text || '/';
  for photo in select * from jsonb_array_elements(p_photos) loop
    if (photo->>'kind') not in ('front', 'back', 'label', 'flaw', 'tags', 'other')
       or coalesce(photo->>'path_thumb', '') not like prefix || '%'
       or coalesce(photo->>'path_card', '') not like prefix || '%'
       or coalesce(photo->>'path_full', '') not like prefix || '%'
       or coalesce((photo->>'width')::integer, 0) <= 0
       or coalesce((photo->>'height')::integer, 0) <= 0
       or (photo->>'phash' is not null and photo->>'phash' !~ '^[0-9a-f]{16}$') then
      raise exception 'invalid_photo' using errcode = 'P0001';
    end if;
    kinds := kinds || (photo->>'kind');
  end loop;

  if not (kinds @> array['front', 'back', 'label']) then
    raise exception 'photos_missing' using errcode = 'P0001';
  end if;
  if it.condition in ('good', 'fair') and not ('flaw' = any (kinds)) then
    raise exception 'flaw_photo_missing' using errcode = 'P0001';
  end if;
  if it.condition = 'new_with_tags' and not ('tags' = any (kinds)) then
    raise exception 'tags_photo_missing' using errcode = 'P0001';
  end if;
  if (select count(*) from unnest(kinds) k where k = 'other') > 3 then
    raise exception 'photo_count_invalid' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(p), '{}') into old_paths
  from public.item_photos ph, lateral unnest(array[ph.path_thumb, ph.path_card, ph.path_full]) as p
  where ph.item_id = p_item;

  delete from public.item_photos where item_id = p_item;
  for photo in select * from jsonb_array_elements(p_photos) loop
    n := n + 1;
    insert into public.item_photos (item_id, position, kind, path_thumb, path_card, path_full, phash, width, height)
    values (p_item, n, (photo->>'kind')::public.item_photo_kind, photo->>'path_thumb', photo->>'path_card', photo->>'path_full',
            photo->>'phash', (photo->>'width')::integer, (photo->>'height')::integer);
    kept := kept || array[photo->>'path_thumb', photo->>'path_card', photo->>'path_full'];
  end loop;

  -- A close match with another seller's photo is flagged for a moderator. It never blocks the listing.
  select o.item_id, min(public.phash_distance(a.phash, o.phash)) as best into hit
  from public.item_photos a
  join public.item_photos o on o.phash is not null and o.item_id <> p_item
  join public.items oi on oi.id = o.item_id and oi.seller_id <> me
  where a.item_id = p_item and a.phash is not null and public.phash_distance(a.phash, o.phash) <= 4
  group by o.item_id
  order by best
  limit 1;
  if found then
    insert into public.item_flags (item_id, reason, detail)
    values (p_item, 'duplicate_photo', jsonb_build_object('matches_item', hit.item_id, 'distance', hit.best))
    on conflict do nothing;
  end if;

  return array(select p from unnest(old_paths) p where not (p = any (kept)));
end;
$$;
revoke all on function public.set_item_photos(uuid, jsonb) from public, anon;
grant execute on function public.set_item_photos(uuid, jsonb) to authenticated;

create or replace function public.resolve_item_flag(p_flag uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
begin
  update public.item_flags set resolved_by = me, resolved_at = now() where id = p_flag and resolved_at is null;
  if not found then
    raise exception 'report_not_found' using errcode = 'P0001';
  end if;
end;
$$;
revoke all on function public.resolve_item_flag(uuid) from public, anon;
grant execute on function public.resolve_item_flag(uuid) to authenticated;
