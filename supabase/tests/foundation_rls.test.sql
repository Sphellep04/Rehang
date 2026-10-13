begin;

select plan(13);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.users'::regclass),
  'RLS is enabled on users'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.towns'::regclass),
  'RLS is enabled on towns'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.app_config'::regclass),
  'RLS is enabled on app_config'
);
select ok(
  not has_table_privilege('anon', 'public.users', 'select'),
  'anonymous users cannot read the private users table'
);
select ok(
  has_table_privilege('anon', 'public.public_profiles', 'select'),
  'anonymous users can read the public profile view'
);
select ok(
  has_table_privilege('authenticated', 'public.users', 'select'),
  'signed-in users can read rows allowed by users RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.users', 'insert'),
  'client-side profile inserts remain disabled before the OTP flow exists'
);
select ok(
  not has_table_privilege('authenticated', 'public.users', 'update'),
  'client-side profile updates remain disabled before the OTP flow exists'
);
select ok(
  has_table_privilege('anon', 'public.towns', 'select'),
  'anonymous users can read live towns'
);
select ok(
  has_table_privilege('anon', 'public.app_config', 'select'),
  'anonymous users can read public configuration'
);
select ok(
  not has_table_privilege('anon', 'public.app_config', 'update'),
  'anonymous users cannot update configuration'
);
select ok(
  not has_function_privilege('anon', 'public.current_user_role()', 'execute'),
  'anonymous users cannot execute the role helper'
);
select ok(
  has_function_privilege('authenticated', 'public.current_user_role()', 'execute'),
  'signed-in users can execute the role helper used by RLS'
);

select * from finish();
rollback;