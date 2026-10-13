insert into public.app_config (key, value)
values ('messages_per_hour', '60'::jsonb)
on conflict (key) do nothing;

create index messages_sender_created_idx on public.messages (sender_id, created_at desc);

create or replace function public.guard_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
  hourly_limit integer;
begin
  if new.sender_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'message sender must match the signed-in user';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.sender_id::text, 0));

  select coalesce((value::text)::integer, 60)
    into hourly_limit
  from public.app_config
  where key = 'messages_per_hour';
  hourly_limit := coalesce(hourly_limit, 60);

  select count(*)::integer
    into recent_count
  from public.messages
  where sender_id = new.sender_id
    and created_at >= now() - interval '1 hour';

  if recent_count >= hourly_limit then
    raise exception using errcode = '54000', message = 'message rate limit reached';
  end if;

  new.flagged_contact := new.body ~* '(^|[^[:alnum:]])(@[a-z0-9_.-]{2,}|(\+?264|0)[0-9][0-9() .-]{5,}[0-9])([^[:alnum:]]|$)|wa\.me|whatsapp|instagram|facebook';
  return new;
end;
$$;

revoke all on function public.guard_new_message() from public, anon, authenticated;

create trigger messages_guard_insert
before insert on public.messages
for each row execute function public.guard_new_message();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end;
$$;
