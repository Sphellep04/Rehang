# Data model (v1)

The full schema for the MVP. It expands the summary in README section 8, and is the blueprint for the first Supabase migration.

## Conventions

- Primary keys are `uuid`, using `gen_random_uuid()`. `users.id` equals `auth.users.id`.
- Timestamps are `timestamptz`, defaulting to `now()`.
- **Money is stored as integer cents in N$** (`*_cents bigint`). N$180.00 is stored as `18000`.
- Soft delete: listings and users use a `status` column rather than being deleted, so moderation history survives.
- Every table has Row Level Security enabled. Service-role access is used only in server code.

## Enums

```sql
create type verification_level as enum ('level0','level1','level2');
create type verification_status as enum ('pending','approved','rejected','escalated');
create type item_condition as enum ('new_with_tags','new_without_tags','very_good','good','fair');
create type item_status as enum ('draft','awaiting_verification','active','reserved','sold','removed');
create type offer_status as enum ('open','accepted','countered','declined','expired','withdrawn');
create type order_status as enum ('awaiting_payment','paid_held','awaiting_meetup','shipped','delivered',
                                  'completed','disputed','refunded','cancelled');
create type delivery_method as enum ('meetup','courier','post','dropoff');
create type report_target as enum ('item','user','message');
create type moderation_status as enum ('open','actioned','dismissed');
create type user_role as enum ('member','moderator','admin');
```

In Phase 1, meet-up orders go `awaiting_meetup → completed`, or `cancelled`. The payment states are used from Phase 2. The full state diagram is in README section 7.

## Tables

### `users` (public profile, 1:1 with `auth.users`)

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | = auth.users.id |
| phone | text unique | E.164 format, e.g. `+26481…`. Only visible to the user and moderators |
| handle | text unique | Shop URL slug, 3–20 characters, `[a-z0-9_]` |
| display_name | text | |
| legal_name | text | Set at verification. Only visible to the user and moderators |
| email | text | Level 1 |
| photo_url | text | |
| bio | text | Up to 160 characters |
| town_id | int FK → towns | |
| verification_level | verification_level | Default `level0` |
| is_trusted_seller | boolean | Kept up to date by a scheduled job |
| is_founding_seller | boolean | |
| role | user_role | Default `member` |
| status | text | `active`, `restricted`, `suspended`, `banned` |
| restricted_until | timestamptz | For strike cooldowns |
| over_18 | boolean | Confirmed at verification |
| id_number_hash | text unique | SHA-256 plus a secret salt. Never the raw number |
| terms_accepted_at | timestamptz | Plus `terms_version text` |
| created_at | timestamptz | |

### `towns`
`id`, `name`, `region`, `is_live boolean`. Seeded with Windhoek (live), Swakopmund, Walvis Bay, Oshakati, Ongwediva and others.

### `verifications`
`id`, `user_id FK`, `type` (`email`, `id_document`), `status verification_status`, `document_path text` (private bucket path, set to null when deleted), `selfie_path text`, `rejection_reason text`, `reviewed_by FK users`, `reviewed_at`, `delete_images_after timestamptz`, `created_at`.

### `categories`
`id`, `parent_id` (self FK), `name`, `slug`, `position`, `allowed boolean`. Seeded from the [category tree](../product/listing-standards.md#category-tree-v1).

### `size_groups` and `sizes`
- `size_groups`: `id`, `kind` (`clothing`, `shoes`, `kids`, `one_size`), `label` (e.g. `M`), `position`.
- `sizes`: `id`, `system` (e.g. `uk_sa_women`), `value` (e.g. `12`), `size_group_id FK`.

### `brands`
`id`, `name`, `slug`, `is_verified_brand boolean`. Custom brands are stored as text on the item and promoted to this table when popular.

### `items`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| seller_id | uuid FK → users | |
| title | text | 10–60 characters |
| description | text | Up to 500 characters |
| category_id | int FK | Must be a leaf category |
| size_id | int FK → sizes | |
| condition | item_condition | |
| brand_id | int FK, nullable | |
| brand_text | text, nullable | Custom brand |
| colours | text[] | 1–2 values |
| price_cents | bigint | 2,000 to 2,000,000 |
| town_id | int FK | |
| status | item_status | |
| measurements | jsonb | Optional |
| photos_reviewed | boolean | Brand check passed |
| search | tsvector | Generated from title, brand and category. GIN index |
| published_at | timestamptz | |
| sold_at | timestamptz | |
| created_at / updated_at | timestamptz | |

Indexes: `(status, town_id, published_at desc)`, `(seller_id, status)`, GIN on `search`, `(category_id)`, `(price_cents)`.

### `item_photos`
`id`, `item_id FK`, `position smallint`, `kind` (`front`, `back`, `label`, `flaw`, `tags`, `other`), `path_thumb`, `path_card`, `path_full`, `phash text` (perceptual hash for duplicate detection), `width`, `height`.

### `favourites`
`user_id`, `item_id`, `created_at`. PK (user_id, item_id).

### `follows`
`follower_id`, `seller_id`, `created_at`. PK (follower_id, seller_id).

### `blocks`
`blocker_id`, `blocked_id`, `created_at`. PK (blocker_id, blocked_id). Blocked users can't message each other or see each other's listings.

### `conversations`
`id`, `item_id FK`, `buyer_id FK`, `seller_id FK`, `last_message_at`, `created_at`. Unique (item_id, buyer_id).

### `messages`
`id`, `conversation_id FK`, `sender_id FK`, `body text` (up to 1,000 characters), `flagged_contact boolean` (a phone number or handle was detected), `created_at`, `read_at`.

### `offers`
`id`, `item_id FK`, `buyer_id FK`, `amount_cents`, `status offer_status`, `parent_offer_id` (for counter-offers), `expires_at`, `created_at`.

### `meetup_spots`
`id`, `town_id FK`, `name`, `address`, `opens`, `closes`, `active boolean`.

### `orders`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| item_id | uuid FK, unique | One order per item |
| buyer_id / seller_id | uuid FK | |
| offer_id | uuid FK, nullable | |
| amount_cents | bigint | Agreed price |
| commission_cents | bigint | 0 in Phase 1, and 0 for founding sellers during their free period |
| buyer_fee_cents | bigint | Buyer protection fee (Phase 2) |
| status | order_status | |
| delivery_method | delivery_method | |
| meetup_spot_id | int FK, nullable | |
| meetup_at | timestamptz, nullable | |
| code_hash | text | Meet-up code, hashed |
| code_attempts | smallint | Locks after 5 |
| tracking_number | text, nullable | Phase 2 |
| payment_ref | text, nullable | Gateway reference (Phase 2) |
| confirm_by | timestamptz | Next deadline, used by timers |
| completed_at / cancelled_at | timestamptz | |
| cancel_reason | text | |
| created_at | timestamptz | |

### `order_events`
An append-only audit log: `id`, `order_id`, `actor_id`, `event` (e.g. `created`, `seller_confirmed`, `code_entered`, `no_show_reported`), `data jsonb`, `created_at`. Used for dispute decisions.

### `reviews`
`id`, `order_id FK`, `reviewer_id`, `reviewee_id`, `rating smallint` (1–5), `comment` (up to 300 characters), `created_at`. Unique (order_id, reviewer_id).

### `reports`
`id`, `reporter_id`, `target_type report_target`, `target_id uuid`, `reason`, `details`, `status moderation_status`, `handled_by`, `handled_at`, `created_at`.

### `disputes`
`id`, `order_id FK unique`, `opened_by`, `reason`, `buyer_statement`, `seller_statement`, `evidence_paths text[]`, `decision` (`refund`, `partial_refund`, `release`), `decision_note`, `decided_by`, `decided_at`, `created_at`.

### `strikes`
`id`, `user_id`, `reason` (`no_show`, `seller_cancel`, `off_platform`, `deposit_request`, `other`), `order_id` nullable, `issued_by` (null if automatic), `created_at`. The count in the last 90 days drives the [strike ladder](../product/orders-meetups-and-delivery.md#strikes).

### `app_config`
`key text PK`, `value jsonb`. Holds limits, fees, timers and feature flags, so they can change without a release. Examples: `level1_order_limit_cents`, `commission_bps`, `buyer_fee_cents`, `payments_enabled`.

### `waitlist`
`id`, `contact`, `role` (`buyer`, `seller`, `both`), `town`, `source`, `invited_at`, `created_at`.

## Row Level Security summary

| Table | Read | Write |
|---|---|---|
| users | Public columns: everyone. Private columns (phone, legal_name, email): the user themselves and moderators. Served through a `public_profiles` view | The user themselves (limited columns). Moderators |
| items | `active`, `reserved` and `sold`: everyone. Other statuses: the seller and moderators | The seller, only if Level 2 and not restricted |
| item_photos | Same as the parent item | The seller of the parent item |
| favourites, follows, blocks | The owner | The owner |
| conversations, messages | Participants and moderators | Participants who aren't blocked. Rate-limited |
| offers | The buyer, and the seller of the item | The buyer creates. The seller updates the status |
| orders, order_events | Buyer, seller, moderators | Only through server actions or RPCs, never directly from the client |
| reviews | Everyone | The order participant, once, after completion |
| reports | The reporter and moderators | Any user creates. Moderators update |
| verifications, disputes, strikes | The user concerned (limited) and moderators | Server or moderators only |
| app_config | Everyone (non-secret keys) | Admins only |

## Storage buckets

| Bucket | Access | Content |
|---|---|---|
| `item-photos` | Public read. Only the owner can write | WebP images in three sizes |
| `avatars` | Public read. Only the owner can write | Profile photos |
| `id-documents` | **Private.** Moderators read through signed URLs valid for 5 minutes | ID images and selfies. Deleted by a scheduled job after `delete_images_after` |
| `dispute-evidence` | Private. Participants and moderators | Phase 2 |
