create type public.verification_type as enum ('email', 'id_document');
create type public.item_photo_kind as enum ('front', 'back', 'label', 'flaw', 'tags', 'other');
create type public.strike_reason as enum ('no_show', 'seller_cancel', 'off_platform', 'deposit_request', 'other');
create type public.waitlist_role as enum ('buyer', 'seller', 'both');
create type public.bundle_status as enum ('open', 'accepted', 'declined', 'expired', 'withdrawn');
create type public.payment_transaction_kind as enum ('authorization', 'capture', 'release', 'refund', 'fee', 'payout');
create type public.payment_transaction_status as enum ('pending', 'succeeded', 'failed', 'reversed');
create type public.payout_status as enum ('pending', 'processing', 'paid', 'failed', 'reversed');
create type public.fulfilment_point_kind as enum ('dropoff_shop', 'pickup_locker');
create type public.donation_status as enum ('offered', 'accepted', 'collected', 'declined', 'cancelled');
create type public.promotion_status as enum ('scheduled', 'active', 'ended', 'cancelled');

create table public.verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type public.verification_type not null,
  status public.verification_status not null default 'pending',
  document_path text,
  selfie_path text,
  rejection_reason text,
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  delete_images_after timestamptz,
  created_at timestamptz not null default now()
);

create table public.categories (
  id integer generated always as identity primary key,
  parent_id integer references public.categories (id),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  position smallint not null default 0,
  allowed boolean not null default true,
  check (parent_id is null or parent_id <> id)
);

create table public.size_groups (
  id integer generated always as identity primary key,
  kind text not null check (kind in ('clothing', 'shoes', 'kids', 'one_size')),
  label text not null,
  position smallint not null default 0,
  unique (kind, label)
);

create table public.sizes (
  id integer generated always as identity primary key,
  system text not null,
  value text not null,
  size_group_id integer not null references public.size_groups (id),
  unique (system, value)
);

create table public.brands (
  id integer generated always as identity primary key,
  name text not null unique,
  slug text not null unique,
  is_verified_brand boolean not null default false
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null default auth.uid() references public.users (id),
  title text not null check (char_length(title) between 10 and 60),
  description text check (description is null or char_length(description) <= 500),
  category_id integer not null references public.categories (id),
  size_id integer not null references public.sizes (id),
  condition public.item_condition not null,
  brand_id integer references public.brands (id),
  brand_text text,
  colours text[] not null check (cardinality(colours) between 1 and 2),
  price_cents bigint not null check (price_cents between 2000 and 2000000 and price_cents % 100 = 0),
  town_id integer not null references public.towns (id),
  status public.item_status not null default 'draft',
  measurements jsonb,
  photos_reviewed boolean not null default false,
  search tsvector generated always as (
    to_tsvector('simple'::regconfig, coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(brand_text, ''))
  ) stored,
  published_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (brand_id is null or brand_text is null)
);

create table public.item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id) on delete cascade,
  position smallint not null check (position between 1 and 8),
  kind public.item_photo_kind not null,
  path_thumb text not null,
  path_card text not null,
  path_full text not null,
  phash text,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  unique (item_id, position)
);

create table public.favourites (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.follows (
  follower_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  seller_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, seller_id),
  check (follower_id <> seller_id)
);

create table public.blocks (
  blocker_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id),
  buyer_id uuid not null default auth.uid() references public.users (id),
  seller_id uuid not null references public.users (id),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_id, buyer_id),
  check (buyer_id <> seller_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.users (id),
  body text not null check (char_length(body) between 1 and 1000),
  flagged_contact boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id),
  buyer_id uuid not null default auth.uid() references public.users (id),
  amount_cents bigint not null check (amount_cents > 0),
  status public.offer_status not null default 'open',
  parent_offer_id uuid references public.offers (id),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);

create table public.meetup_spots (
  id integer generated always as identity primary key,
  town_id integer not null references public.towns (id),
  name text not null,
  address text not null,
  opens time not null default '08:00',
  closes time not null default '18:00',
  active boolean not null default false,
  check (opens < closes)
);

create table public.bundle_offers (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.users (id),
  buyer_id uuid not null default auth.uid() references public.users (id),
  amount_cents bigint not null check (amount_cents > 0),
  status public.bundle_status not null default 'open',
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);

create table public.bundle_offer_items (
  bundle_offer_id uuid not null references public.bundle_offers (id) on delete cascade,
  item_id uuid not null references public.items (id),
  amount_cents bigint not null check (amount_cents > 0),
  primary key (bundle_offer_id, item_id)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  item_id uuid unique references public.items (id),
  bundle_offer_id uuid unique references public.bundle_offers (id),
  buyer_id uuid not null references public.users (id),
  seller_id uuid not null references public.users (id),
  offer_id uuid references public.offers (id),
  amount_cents bigint not null check (amount_cents > 0),
  commission_cents bigint not null default 0 check (commission_cents >= 0),
  buyer_fee_cents bigint not null default 0 check (buyer_fee_cents >= 0),
  status public.order_status not null default 'awaiting_meetup',
  delivery_method public.delivery_method not null default 'meetup',
  meetup_spot_id integer references public.meetup_spots (id),
  meetup_at timestamptz,
  fulfilment_point_id uuid,
  code_hash text,
  code_attempts smallint not null default 0 check (code_attempts between 0 and 5),
  tracking_number text,
  payment_ref text,
  confirm_by timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz not null default now(),
  check ((item_id is null) <> (bundle_offer_id is null)),
  check (buyer_id <> seller_id)
);

create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  actor_id uuid references public.users (id),
  event text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  reviewer_id uuid not null default auth.uid() references public.users (id),
  reviewee_id uuid not null references public.users (id),
  rating smallint not null check (rating between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 300),
  created_at timestamptz not null default now(),
  unique (order_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.users (id),
  target_type public.report_target not null,
  target_id uuid not null,
  reason text not null,
  details text,
  status public.moderation_status not null default 'open',
  handled_by uuid references public.users (id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  opened_by uuid not null references public.users (id),
  reason text not null,
  buyer_statement text,
  seller_statement text,
  evidence_paths text[] not null default '{}',
  decision text check (decision is null or decision in ('refund', 'partial_refund', 'release')),
  decision_note text,
  decided_by uuid references public.users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  reason public.strike_reason not null,
  order_id uuid references public.orders (id),
  issued_by uuid references public.users (id),
  created_at timestamptz not null default now()
);

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  contact text not null,
  role public.waitlist_role not null default 'both',
  town text,
  source text,
  invited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contact)
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id),
  bundle_offer_id uuid references public.bundle_offers (id),
  provider text not null,
  provider_reference text not null unique,
  kind public.payment_transaction_kind not null,
  status public.payment_transaction_status not null default 'pending',
  amount_cents bigint not null check (amount_cents >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check ((order_id is null) <> (bundle_offer_id is null))
);

create table public.payouts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id),
  seller_id uuid not null references public.users (id),
  provider text not null,
  provider_reference text unique,
  amount_cents bigint not null check (amount_cents >= 0),
  status public.payout_status not null default 'pending',
  destination_ref text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.fulfilment_points (
  id uuid primary key default gen_random_uuid(),
  town_id integer not null references public.towns (id),
  kind public.fulfilment_point_kind not null,
  name text not null,
  address text not null,
  operator text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.orders
  add constraint orders_fulfilment_point_id_fkey
  foreign key (fulfilment_point_id) references public.fulfilment_points (id);

create table public.item_promotions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id),
  seller_id uuid not null references public.users (id),
  status public.promotion_status not null default 'scheduled',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  amount_cents bigint not null check (amount_cents >= 0),
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.donation_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  town_id integer references public.towns (id),
  contact text,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items (id),
  donor_id uuid not null references public.users (id),
  partner_id uuid references public.donation_partners (id),
  status public.donation_status not null default 'offered',
  collected_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.users (id),
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  name text not null,
  description text check (description is null or char_length(description) <= 500),
  logo_url text,
  is_business boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  created_by uuid references public.users (id),
  invited_user_id uuid references public.users (id),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index items_feed_idx on public.items (status, town_id, published_at desc);
create index items_seller_status_idx on public.items (seller_id, status);
create index items_search_idx on public.items using gin (search);
create index items_category_idx on public.items (category_id);
create index items_price_idx on public.items (price_cents);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
create index offers_open_expiry_idx on public.offers (expires_at) where status = 'open';
create index orders_status_confirm_by_idx on public.orders (status, confirm_by);
create index strikes_user_created_idx on public.strikes (user_id, created_at desc);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

create or replace function public.users_blocked_pair(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) in (first_user, second_user)
    and exists (
      select 1 from public.blocks as b
      where (b.blocker_id = first_user and b.blocked_id = second_user)
         or (b.blocker_id = second_user and b.blocked_id = first_user)
    )
$$;

revoke all on function public.users_blocked_pair(uuid, uuid) from public, anon;
grant execute on function public.users_blocked_pair(uuid, uuid) to authenticated;

create or replace function public.validate_item_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.categories as c
    where c.id = new.category_id
      and c.allowed
      and not exists (select 1 from public.categories as child where child.parent_id = c.id)
  ) then
    raise exception using errcode = '23514', message = 'category must be an allowed leaf category';
  end if;
  return new;
end;
$$;

create trigger items_validate_category
before insert or update of category_id on public.items
for each row execute function public.validate_item_category();

alter table public.verifications enable row level security;
alter table public.categories enable row level security;
alter table public.size_groups enable row level security;
alter table public.sizes enable row level security;
alter table public.brands enable row level security;
alter table public.items enable row level security;
alter table public.item_photos enable row level security;
alter table public.favourites enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.offers enable row level security;
alter table public.meetup_spots enable row level security;
alter table public.bundle_offers enable row level security;
alter table public.bundle_offer_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.disputes enable row level security;
alter table public.strikes enable row level security;
alter table public.waitlist enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payouts enable row level security;
alter table public.fulfilment_points enable row level security;
alter table public.item_promotions enable row level security;
alter table public.donation_partners enable row level security;
alter table public.donations enable row level security;
alter table public.shops enable row level security;
alter table public.invite_codes enable row level security;
alter table public.notifications enable row level security;

create policy verifications_read_subject_or_moderator on public.verifications
for select to authenticated using (user_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));

create policy catalog_read_categories on public.categories for select to anon, authenticated using (allowed);
create policy catalog_read_size_groups on public.size_groups for select to anon, authenticated using (true);
create policy catalog_read_sizes on public.sizes for select to anon, authenticated using (true);
create policy catalog_read_brands on public.brands for select to anon, authenticated using (true);

create policy items_read_public_or_owner on public.items for select to anon, authenticated
using (
  status in ('active'::public.item_status, 'reserved'::public.item_status, 'sold'::public.item_status)
  or seller_id = (select auth.uid())
  or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role)
);
create policy items_create_draft on public.items for insert to authenticated
with check (
  seller_id = (select auth.uid())
  and status = 'draft'::public.item_status
  and exists (select 1 from public.users u where u.id = (select auth.uid()) and u.status = 'active')
);
create policy items_update_owner on public.items for update to authenticated
using (seller_id = (select auth.uid()) and status in ('draft'::public.item_status, 'awaiting_verification'::public.item_status, 'active'::public.item_status))
with check (seller_id = (select auth.uid()) and status in ('draft'::public.item_status, 'awaiting_verification'::public.item_status, 'active'::public.item_status));

create policy item_photos_read_parent on public.item_photos for select to anon, authenticated
using (
  exists (select 1 from public.items i where i.id = item_id and (i.status in ('active'::public.item_status, 'reserved'::public.item_status, 'sold'::public.item_status) or i.seller_id = (select auth.uid())))
  or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role)
);
create policy item_photos_manage_owner on public.item_photos for all to authenticated
using (exists (select 1 from public.items i where i.id = item_id and i.seller_id = (select auth.uid()) and i.status in ('draft'::public.item_status, 'awaiting_verification'::public.item_status)))
with check (exists (select 1 from public.items i where i.id = item_id and i.seller_id = (select auth.uid()) and i.status in ('draft'::public.item_status, 'awaiting_verification'::public.item_status)));

create policy favourites_owner on public.favourites for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy follows_owner on public.follows for all to authenticated
using (follower_id = (select auth.uid())) with check (follower_id = (select auth.uid()));
create policy blocks_owner on public.blocks for all to authenticated
using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

create policy conversations_read_participant on public.conversations for select to authenticated
using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy conversations_create_buyer on public.conversations for insert to authenticated
with check (
  buyer_id = (select auth.uid())
  and exists (select 1 from public.items i where i.id = item_id and i.seller_id = seller_id and i.status = 'active')
  and not (select public.users_blocked_pair(buyer_id, seller_id))
);
create policy messages_read_participant on public.messages for select to authenticated
using (exists (select 1 from public.conversations c where c.id = conversation_id and (c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid()))) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy messages_create_participant on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.buyer_id = (select auth.uid()) or c.seller_id = (select auth.uid()))
      and not (select public.users_blocked_pair(c.buyer_id, c.seller_id))
  )
);

create policy offers_read_participant on public.offers for select to authenticated
using (buyer_id = (select auth.uid()) or exists (select 1 from public.items i where i.id = item_id and i.seller_id = (select auth.uid())) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy meetup_spots_read_active on public.meetup_spots for select to anon, authenticated using (active);
create policy bundle_offers_read_participant on public.bundle_offers for select to authenticated
using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy bundle_offer_items_read_participant on public.bundle_offer_items for select to authenticated
using (exists (select 1 from public.bundle_offers b where b.id = bundle_offer_id and (b.buyer_id = (select auth.uid()) or b.seller_id = (select auth.uid()))) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy orders_read_participant on public.orders for select to authenticated
using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy order_events_read_participant on public.order_events for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()))) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy reviews_read_public on public.reviews for select to anon, authenticated using (true);
create policy reviews_create_completed_participant on public.reviews for insert to authenticated
with check (
  reviewer_id = (select auth.uid())
  and exists (
    select 1 from public.orders o
    where o.id = order_id and o.status = 'completed'
      and ((o.buyer_id = (select auth.uid()) and o.seller_id = reviewee_id) or (o.seller_id = (select auth.uid()) and o.buyer_id = reviewee_id))
  )
);
create policy reports_read_reporter_or_moderator on public.reports for select to authenticated
using (reporter_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy reports_create_authenticated on public.reports for insert to authenticated
with check (reporter_id = (select auth.uid()) and status = 'open'::public.moderation_status);
create policy disputes_read_participant_or_moderator on public.disputes for select to authenticated
using (opened_by = (select auth.uid()) or exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()))) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy strikes_read_subject_or_moderator on public.strikes for select to authenticated
using (user_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy waitlist_read_moderator on public.waitlist for select to authenticated
using ((select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));

create policy payment_transactions_read_participant on public.payment_transactions for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()))) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy payouts_read_seller_or_admin on public.payouts for select to authenticated
using (seller_id = (select auth.uid()) or (select public.current_user_role()) in ('admin'::public.user_role));
create policy fulfilment_points_read_active on public.fulfilment_points for select to anon, authenticated using (active);
create policy item_promotions_read_active_or_seller on public.item_promotions for select to anon, authenticated
using ((status = 'active' and now() between starts_at and ends_at) or seller_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy donation_partners_read_active on public.donation_partners for select to anon, authenticated using (active);
create policy donations_read_donor_or_moderator on public.donations for select to authenticated
using (donor_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy shops_read_active_or_owner on public.shops for select to anon, authenticated
using (active or owner_id = (select auth.uid()) or (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy invite_codes_read_moderator on public.invite_codes for select to authenticated
using ((select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role) or invited_user_id = (select auth.uid()));
create policy notifications_read_owner on public.notifications for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.verifications, public.categories, public.size_groups, public.sizes, public.brands,
  public.items, public.item_photos, public.favourites, public.follows, public.blocks,
  public.conversations, public.messages, public.offers, public.meetup_spots,
  public.bundle_offers, public.bundle_offer_items, public.orders, public.order_events,
  public.reviews, public.reports, public.disputes, public.strikes, public.waitlist,
  public.payment_transactions, public.payouts, public.fulfilment_points, public.item_promotions,
  public.donation_partners, public.donations, public.shops, public.invite_codes, public.notifications
from anon, authenticated;

grant usage on type public.verification_type, public.item_photo_kind, public.strike_reason, public.waitlist_role,
  public.bundle_status, public.payment_transaction_kind, public.payment_transaction_status,
  public.payout_status, public.fulfilment_point_kind, public.donation_status, public.promotion_status
 to authenticated;
grant usage on type public.item_condition, public.item_status to anon, authenticated;

grant select on public.categories, public.size_groups, public.sizes, public.brands, public.items, public.item_photos,
  public.meetup_spots, public.reviews, public.fulfilment_points, public.item_promotions,
  public.donation_partners, public.shops to anon, authenticated;
grant select on public.verifications, public.favourites, public.follows, public.blocks,
  public.conversations, public.messages, public.offers, public.bundle_offers, public.bundle_offer_items,
  public.orders, public.order_events, public.reports, public.disputes, public.strikes,
  public.payment_transactions, public.payouts, public.donations, public.invite_codes,
  public.notifications to authenticated;

grant insert (title, description, category_id, size_id, condition, brand_id, brand_text, colours, price_cents, town_id, measurements)
  on public.items to authenticated;
grant update (title, description, category_id, size_id, condition, brand_id, brand_text, colours, price_cents, town_id, measurements)
  on public.items to authenticated;
grant select, insert, update, delete on public.item_photos to authenticated;
grant select, insert, delete on public.favourites, public.follows, public.blocks to authenticated;
grant insert (item_id, seller_id) on public.conversations to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;
grant insert (target_type, target_id, reason, details) on public.reports to authenticated;
grant insert (order_id, reviewee_id, rating, comment) on public.reviews to authenticated;

grant usage on schema storage to anon, authenticated;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('item-photos', 'item-photos', true, 3145728, array['image/webp']),
  ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/jpeg', 'image/png']),
  ('id-documents', 'id-documents', false, 10485760, array['image/jpeg', 'image/png', 'application/pdf']),
  ('dispute-evidence', 'dispute-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy item_photos_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'item-photos');
create policy item_photos_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'item-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy item_photos_owner_update on storage.objects for update to authenticated
using (bucket_id = 'item-photos' and split_part(name, '/', 1) = (select auth.uid())::text)
with check (bucket_id = 'item-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy item_photos_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'item-photos' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy avatars_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'avatars');
create policy avatars_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy avatars_owner_update on storage.objects for update to authenticated
using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text)
with check (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy avatars_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy id_documents_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'id-documents' and split_part(name, '/', 1) = (select auth.uid())::text);
create policy id_documents_moderator_read on storage.objects for select to authenticated
using (bucket_id = 'id-documents' and (select public.current_user_role()) in ('moderator'::public.user_role, 'admin'::public.user_role));
create policy dispute_evidence_participant_read on storage.objects for select to authenticated
using (
  bucket_id = 'dispute-evidence'
  and exists (
    select 1 from public.disputes d join public.orders o on o.id = d.order_id
    where split_part(name, '/', 1) = d.id::text
      and (o.buyer_id = (select auth.uid()) or o.seller_id = (select auth.uid()))
  )
);

insert into public.app_config (key, value) values
  ('courier_enabled', 'false'::jsonb),
  ('payouts_enabled', 'false'::jsonb),
  ('bundles_enabled', 'false'::jsonb),
  ('boosts_enabled', 'false'::jsonb),
  ('donations_enabled', 'false'::jsonb),
  ('dropoff_points_enabled', 'false'::jsonb),
  ('ai_listing_assist_enabled', 'false'::jsonb)
on conflict (key) do nothing;
