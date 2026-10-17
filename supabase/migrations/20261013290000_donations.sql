-- Giving to children's homes. A member offers an item to a vetted home, the Rehang team accepts it
-- and records when it was collected. Homes have no accounts and members never get a home's address
-- or contact details, and nobody gets in touch with the children. Off until donations_enabled is true.

alter type public.item_status add value if not exists 'donated';

alter table public.donation_partners add column if not exists description text check (description is null or char_length(description) <= 400);
alter table public.donation_partners add column if not exists accepts text check (accepts is null or char_length(accepts) <= 200);
alter table public.donations add column if not exists note text check (note is null or char_length(note) <= 200);
alter table public.donations add column if not exists decision_note text check (decision_note is null or char_length(decision_note) <= 300);
alter table public.donations add column if not exists decided_by uuid references public.users (id);
alter table public.donations add column if not exists decided_at timestamptz;
create unique index if not exists donations_one_open_per_item on public.donations (item_id) where status in ('offered', 'accepted');
create index if not exists donations_status_idx on public.donations (status, created_at);

-- The public list leaves out the contact field, which only the team sees.
revoke select on public.donation_partners from anon, authenticated;
grant select (id, name, town_id, description, accepts, active, created_at) on public.donation_partners to anon, authenticated;
drop policy if exists donation_partners_read_active on public.donation_partners;
create policy donation_partners_read_active on public.donation_partners for select to anon, authenticated using (active);
drop policy if exists donation_partners_read_staff on public.donation_partners;
create policy donation_partners_read_staff on public.donation_partners for select to authenticated
  using ((select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));

-- Staff need the contact column too. Column grants are per role, so staff read it through this function.
create or replace function public.donation_partner_contacts()
returns table (id uuid, name text, contact text, active boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_moderator();
  return query select p.id, p.name, p.contact, p.active from public.donation_partners p order by p.name;
end;
$$;

-- Admins add or change a home. Check the home yourself before setting active.
create or replace function public.save_donation_partner(
  p_id uuid, p_name text, p_town integer, p_contact text, p_description text, p_accepts text, p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  result uuid;
begin
  if (select public.current_user_role()) <> 'admin'::public.user_role then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 3 then
    raise exception 'name_required' using errcode = 'P0001';
  end if;
  if p_id is null then
    insert into public.donation_partners (name, town_id, contact, description, accepts, active)
    values (btrim(p_name), p_town, nullif(btrim(p_contact), ''), nullif(btrim(p_description), ''), nullif(btrim(p_accepts), ''), coalesce(p_active, false))
    returning id into result;
  else
    update public.donation_partners
      set name = btrim(p_name), town_id = p_town, contact = nullif(btrim(p_contact), ''), description = nullif(btrim(p_description), ''),
          accepts = nullif(btrim(p_accepts), ''), active = coalesce(p_active, false)
      where id = p_id returning id into result;
    if result is null then
      raise exception 'partner_not_found' using errcode = 'P0001';
    end if;
  end if;
  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, 'save_donation_partner', 'donation_partner', result, left(btrim(p_name), 100));
  return result;
end;
$$;

-- A member offers one of their own items. The item is taken off sale while the offer is open.
create or replace function public.offer_donation(p_item uuid, p_partner uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  it public.items%rowtype;
  new_id uuid;
  note_in text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if me is null then
    raise exception 'not_signed_in' using errcode = 'P0001';
  end if;
  if not public.config_flag('donations_enabled') then
    raise exception 'donations_off' using errcode = 'P0001';
  end if;
  perform public.assert_active_member(me);
  if note_in is not null and char_length(note_in) > 200 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.donation_partners where id = p_partner and active) then
    raise exception 'partner_not_found' using errcode = 'P0001';
  end if;
  select * into it from public.items where id = p_item for update;
  if not found or it.seller_id <> me or it.status not in ('draft', 'active') then
    raise exception 'item_unavailable' using errcode = 'P0001';
  end if;
  if (select count(*) from public.donations d where d.donor_id = me and d.status in ('offered', 'accepted')) >= 5 then
    raise exception 'too_many_donations' using errcode = 'P0001';
  end if;

  update public.items set status = 'reserved' where id = p_item;
  insert into public.donations (item_id, donor_id, partner_id, note) values (p_item, me, p_partner, note_in) returning id into new_id;
  update public.offers set status = 'declined', responded_at = now() where item_id = p_item and status = 'open';
  insert into public.notifications (user_id, kind, payload)
  select u.id, 'donation_offered', jsonb_build_object('donation_id', new_id)
  from public.users u where u.role in ('moderator', 'admin') and u.status = 'active';
  return new_id;
end;
$$;

-- The donor changes their mind before it is collected.
create or replace function public.cancel_donation(p_donation uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  d public.donations%rowtype;
begin
  select * into d from public.donations where id = p_donation for update;
  if not found or me is null or d.donor_id <> me then
    raise exception 'donation_not_found' using errcode = 'P0001';
  end if;
  if d.status not in ('offered', 'accepted') then
    raise exception 'donation_not_open' using errcode = 'P0001';
  end if;
  update public.donations set status = 'cancelled' where id = p_donation;
  update public.items set status = 'active' where id = d.item_id and status = 'reserved';
end;
$$;

-- The team's decision: accept, decline, or collected.
create or replace function public.decide_donation(p_donation uuid, p_action text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.assert_moderator();
  d public.donations%rowtype;
  note_in text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_action not in ('accept', 'decline', 'collected') then
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;
  if note_in is not null and char_length(note_in) > 300 then
    raise exception 'note_too_long' using errcode = 'P0001';
  end if;
  select * into d from public.donations where id = p_donation for update;
  if not found then
    raise exception 'donation_not_found' using errcode = 'P0001';
  end if;
  if me = d.donor_id then
    raise exception 'cannot_review_own' using errcode = 'P0001';
  end if;
  if (p_action in ('accept', 'decline') and d.status <> 'offered') or (p_action = 'collected' and d.status <> 'accepted') then
    raise exception 'donation_not_open' using errcode = 'P0001';
  end if;
  if p_action = 'decline' and note_in is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  update public.donations
    set status = case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'collected' end::public.donation_status,
        decision_note = note_in, decided_by = me, decided_at = now(),
        collected_at = case when p_action = 'collected' then now() end
    where id = p_donation;
  if p_action = 'decline' then
    update public.items set status = 'active' where id = d.item_id and status = 'reserved';
  elsif p_action = 'collected' then
    update public.items set status = 'donated' where id = d.item_id;
  end if;
  insert into public.moderator_actions (actor_id, action, target_type, target_id, note)
  values (me, 'donation_' || p_action, 'donation', p_donation, coalesce(note_in, p_action));
  perform public.notify_user(d.donor_id, 'donation_' || case p_action when 'accept' then 'accepted' when 'decline' then 'declined' else 'collected' end,
    jsonb_build_object('donation_id', p_donation));
end;
$$;

-- Public counts for the Give page. No names, no items.
create or replace function public.donation_totals()
returns table (items_given bigint, homes_helped bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*), count(distinct partner_id) from public.donations where status = 'collected'
$$;

revoke all on function public.donation_partner_contacts(), public.save_donation_partner(uuid, text, integer, text, text, text, boolean),
  public.decide_donation(uuid, text, text) from public, anon;
grant execute on function public.donation_partner_contacts(), public.save_donation_partner(uuid, text, integer, text, text, text, boolean),
  public.decide_donation(uuid, text, text) to authenticated;
revoke all on function public.offer_donation(uuid, uuid, text), public.cancel_donation(uuid) from public, anon;
grant execute on function public.offer_donation(uuid, uuid, text), public.cancel_donation(uuid) to authenticated;
revoke all on function public.donation_totals() from public;
grant execute on function public.donation_totals() to anon, authenticated;
