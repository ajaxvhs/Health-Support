-- Run with psql against a disposable Supabase database after all migrations.
-- All fixtures are synthetic and rolled back. Never run against production.
begin;

select
  set_config('test.push_user_a', gen_random_uuid()::text, true);

select
  set_config('test.push_user_b', gen_random_uuid()::text, true);

select
  set_config('test.push_unit', gen_random_uuid()::text, true);

insert into
  auth.users (id)
values
  (current_setting('test.push_user_a')::uuid),
  (current_setting('test.push_user_b')::uuid);

insert into
  public.units (id, name, code)
values
  (
    current_setting('test.push_unit')::uuid,
    'Push test unit',
    gen_random_uuid()::text
  );

insert into
  public.profiles (
    id,
    username,
    full_name,
    phone,
    default_unit_id,
    must_change_password
  )
select
  id,
  id::text,
  'Synthetic test account',
  '00000000000',
  current_setting('test.push_unit')::uuid,
  false
from
  auth.users
where
  id in (
    current_setting('test.push_user_a')::uuid,
    current_setting('test.push_user_b')::uuid
  );

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.push_user_a'),
    true
  );

set
  local role authenticated;

insert into
  public.push_subscriptions (user_id, endpoint, p256dh, auth)
values
  (
    auth.uid (),
    'https://example.invalid/test-device',
    'test-key',
    'test-auth'
  );

do $$
begin
  if (select count(*) from public.push_subscriptions) <> 1 then
    raise exception 'Owner must see its own subscription';
  end if;
  begin
    insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
    values (current_setting('test.push_user_b')::uuid, 'https://example.invalid/forbidden', 'key', 'auth');
    raise exception 'Cross-user insert unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.claim_push_jobs();
    raise exception 'Authenticated client claimed queue';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.push_queue;
    raise exception 'Authenticated client read queue';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.push_user_b'),
    true
  );

do $$
declare affected integer;
begin
  if exists (select 1 from public.push_subscriptions) then
    raise exception 'Other account can read subscription';
  end if;
  delete from public.push_subscriptions where endpoint = 'https://example.invalid/test-device';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other account can delete subscription'; end if;
end;
$$;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.push_user_a'),
    true
  );

delete from public.push_subscriptions
where
  endpoint = 'https://example.invalid/test-device';

do $$
begin
  if exists (select 1 from public.push_subscriptions) then
    raise exception 'Owner cannot delete its subscription';
  end if;
end;
$$;

rollback;
