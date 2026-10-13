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
    'user_' || right(replace(new.id::text, '-', ''), 12),
    'New member'
  )
  on conflict (id) do update set phone = excluded.phone;

  return new;
end;
$$;
