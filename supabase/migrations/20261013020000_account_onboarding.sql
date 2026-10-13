create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, phone, handle, display_name)
  values (
    new.id,
    new.phone,
    'user_' || left(replace(new.id::text, '-', ''), 15),
    'New member'
  )
  on conflict (id) do update set phone = excluded.phone;

  return new;
end;
$$;

revoke all on function public.handle_auth_user_created() from public, anon, authenticated;

create trigger rehang_create_profile_after_signup
after insert on auth.users
for each row execute function public.handle_auth_user_created();

create or replace function public.complete_profile(
  p_handle text,
  p_display_name text,
  p_town_id integer,
  p_bio text,
  p_terms_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_id uuid := (select auth.uid());
begin
  if current_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if p_handle is null or p_handle !~ '^[a-z0-9_]{3,20}$' then
    raise exception using errcode = '22023', message = 'handle must be 3 to 20 lowercase letters, numbers, or underscores';
  end if;

  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 40 then
    raise exception using errcode = '22023', message = 'display name must be 2 to 40 characters';
  end if;

  if p_bio is not null and char_length(p_bio) > 160 then
    raise exception using errcode = '22023', message = 'bio must be 160 characters or fewer';
  end if;

  if p_terms_version is null or char_length(p_terms_version) not between 1 and 40 then
    raise exception using errcode = '22023', message = 'terms version is required';
  end if;

  if not exists (select 1 from public.towns where id = p_town_id and is_live) then
    raise exception using errcode = '22023', message = 'choose a town where Rehang is available';
  end if;

  update public.users
  set handle = p_handle,
      display_name = btrim(p_display_name),
      town_id = p_town_id,
      bio = nullif(btrim(coalesce(p_bio, '')), ''),
      terms_accepted_at = now(),
      terms_version = p_terms_version
  where id = current_id and status = 'active';

  if not found then
    raise exception using errcode = '42501', message = 'active profile not found';
  end if;
end;
$$;

revoke all on function public.complete_profile(text, text, integer, text, text) from public, anon;
grant execute on function public.complete_profile(text, text, integer, text, text) to authenticated;
