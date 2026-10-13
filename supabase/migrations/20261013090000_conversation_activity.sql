create or replace function public.update_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

revoke all on function public.update_conversation_activity() from public, anon, authenticated;

create trigger messages_update_conversation_activity
after insert on public.messages
for each row execute function public.update_conversation_activity();
