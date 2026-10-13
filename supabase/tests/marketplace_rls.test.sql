begin;

select plan(27);

select ok((select relrowsecurity from pg_class where oid = 'public.categories'::regclass), 'RLS is enabled on categories');
select ok((select relrowsecurity from pg_class where oid = 'public.items'::regclass), 'RLS is enabled on items');
select ok((select relrowsecurity from pg_class where oid = 'public.item_photos'::regclass), 'RLS is enabled on item photos');
select ok((select relrowsecurity from pg_class where oid = 'public.conversations'::regclass), 'RLS is enabled on conversations');
select ok((select relrowsecurity from pg_class where oid = 'public.messages'::regclass), 'RLS is enabled on messages');
select ok((select relrowsecurity from pg_class where oid = 'public.orders'::regclass), 'RLS is enabled on orders');
select ok((select relrowsecurity from pg_class where oid = 'public.payment_transactions'::regclass), 'RLS is enabled on payment transactions');
select ok((select relrowsecurity from pg_class where oid = 'public.payouts'::regclass), 'RLS is enabled on payouts');

select ok(not has_table_privilege('anon', 'public.messages', 'select'), 'anonymous users cannot read messages');
select ok(not has_table_privilege('anon', 'public.orders', 'select'), 'anonymous users cannot read orders');
select ok(not has_table_privilege('anon', 'public.payment_transactions', 'select'), 'anonymous users cannot read payment references');
select ok(not has_table_privilege('anon', 'public.payouts', 'select'), 'anonymous users cannot read payouts');
select ok(not has_table_privilege('authenticated', 'public.orders', 'insert'), 'clients cannot create orders directly');
select ok(not has_table_privilege('authenticated', 'public.order_events', 'insert'), 'clients cannot write the order audit log');
select ok(not has_table_privilege('authenticated', 'public.payment_transactions', 'insert'), 'clients cannot record payment events');
select ok(not has_table_privilege('authenticated', 'public.payouts', 'insert'), 'clients cannot create payouts');
select ok(not has_table_privilege('authenticated', 'public.disputes', 'insert'), 'clients cannot decide or directly create disputes');
select ok(not has_table_privilege('authenticated', 'public.users', 'update'), 'clients cannot change protected profile fields');
select ok(not has_column_privilege('authenticated', 'public.items', 'status', 'update'), 'clients cannot publish listings directly');
select ok(has_function_privilege('anon', 'public.users_blocked_pair(uuid, uuid)', 'execute'), 'block checks are callable in public item policies');
select ok(not public.users_blocked_pair('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'), 'anonymous block checks reveal no relationship');
select ok(not has_function_privilege('anon', 'public.complete_profile(text, text, integer, text, text)', 'execute'), 'anonymous users cannot complete profiles');
select ok(not exists (select 1 from public.app_config where key = 'ai_listing_assist_enabled'), 'retired AI listing flag is absent');

select ok(has_table_privilege('anon', 'public.categories', 'select'), 'catalog categories are readable');
select ok(has_table_privilege('anon', 'public.items', 'select'), 'public item reads are available through RLS');
select ok((select count(*) > 40 from public.categories), 'category seed includes the documented catalog');
select ok(
  exists (
    select 1 from public.categories parent
    join public.categories child on child.parent_id = parent.id
    where parent.slug = 'women' and child.slug = 'women-dresses' and child.allowed
  ),
  'women dresses is present as an allowed leaf category'
);

select * from finish();
rollback;
