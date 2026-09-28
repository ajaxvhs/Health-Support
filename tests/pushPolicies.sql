-- Run with psql against a disposable Supabase database after all migrations.
-- All fixtures are synthetic and rolled back. Never run against production.
begin;

create temporary table push_dispatch_test_calls (called_at timestamptz not null default now()) on
commit
drop;

create or replace function public.dispatch_push_queue () returns void language plpgsql security definer
set
  search_path = '' as $$
begin
  insert into pg_temp.push_dispatch_test_calls default values;
end;
$$;

select
  set_config('test.push_user_a', gen_random_uuid()::text, true);

select
  set_config('test.push_user_b', gen_random_uuid()::text, true);

select
  set_config('test.push_user_c', gen_random_uuid()::text, true);

select
  set_config('test.push_unit', gen_random_uuid()::text, true);

select
  set_config('test.push_ticket', gen_random_uuid()::text, true);

insert into
  auth.users (id)
values
  (current_setting('test.push_user_a')::uuid),
  (current_setting('test.push_user_b')::uuid),
  (current_setting('test.push_user_c')::uuid);

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
    role,
    default_unit_id,
    must_change_password
  )
select
  id,
  id::text,
  'Synthetic test account',
  '00000000000',
  case
    when id = current_setting('test.push_user_b')::uuid then 'admin'::public.app_role
    else 'solicitante'::public.app_role
  end,
  current_setting('test.push_unit')::uuid,
  false
from
  auth.users
where
  id in (
    current_setting('test.push_user_a')::uuid,
    current_setting('test.push_user_b')::uuid,
    current_setting('test.push_user_c')::uuid
  );

alter table public.tickets disable trigger ticket_created_notification;

insert into
  public.tickets (
    id,
    title,
    description,
    unit_id,
    category_id,
    priority_id,
    status_id,
    created_by,
    assigned_to,
    requester_name_snapshot,
    requester_phone_snapshot
  )
select
  current_setting('test.push_ticket')::uuid,
  'Synthetic push ticket',
  'Synthetic description for push tests',
  current_setting('test.push_unit')::uuid,
  (
    select
      id
    from
      public.ticket_categories
    order by
      created_at
    limit
      1
  ),
  (
    select
      id
    from
      public.ticket_priorities
    order by
      level
    limit
      1
  ),
  (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'aberto'
  ),
  current_setting('test.push_user_a')::uuid,
  null,
  'Synthetic test account',
  '00000000000';

alter table public.tickets enable trigger ticket_created_notification;

select
  set_config(
    'test.push_notification_without_devices',
    gen_random_uuid()::text,
    true
  );

insert into
  public.notifications (id, user_id, ticket_id, title, message)
values
  (
    current_setting('test.push_notification_without_devices')::uuid,
    current_setting('test.push_user_c')::uuid,
    current_setting('test.push_ticket')::uuid,
    'No subscribers',
    'Synthetic message'
  );

do $$
begin
  if exists (
    select 1 from public.push_queue
    where notification_id = current_setting('test.push_notification_without_devices')::uuid
  ) then
    raise exception 'Notification without devices unexpectedly queued a push job';
  end if;
  if exists (select 1 from pg_temp.push_dispatch_test_calls) then
    raise exception 'Dispatch should not be invoked for a notification without push jobs';
  end if;
end;
$$;

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

reset role;

insert into
  public.push_subscriptions (user_id, endpoint, p256dh, auth)
values
  (
    current_setting('test.push_user_a')::uuid,
    'https://example.invalid/test-device-2',
    'test-key-2',
    'test-auth-2'
  );

insert into
  public.push_subscriptions (user_id, endpoint, p256dh, auth)
values
  (
    current_setting('test.push_user_a')::uuid,
    'https://example.invalid/test-device-3',
    'test-key-3',
    'test-auth-3'
  );

insert into
  public.push_subscriptions (user_id, endpoint, p256dh, auth)
values
  (
    current_setting('test.push_user_b')::uuid,
    'https://example.invalid/test-device-b',
    'test-key-b',
    'test-auth-b'
  );

do $$
declare
  notification_a uuid := gen_random_uuid();
  notification_b uuid := gen_random_uuid();
  notification_c uuid := gen_random_uuid();
  queued integer;
begin
  insert into public.notifications (id, user_id, ticket_id, title, message)
  values
    (notification_a, current_setting('test.push_user_a')::uuid, current_setting('test.push_ticket')::uuid, 'Synthetic push A', 'Synthetic message'),
    (notification_b, current_setting('test.push_user_b')::uuid, current_setting('test.push_ticket')::uuid, 'Synthetic push B', 'Synthetic message'),
    (notification_c, current_setting('test.push_user_c')::uuid, current_setting('test.push_ticket')::uuid, 'No subscribers', 'Synthetic message');

  select count(*) into queued
  from public.push_queue
  where notification_id = notification_a;
  if queued <> 2 then
    raise exception 'Expected one push job per device, got %', queued;
  end if;

  select count(*) into queued
  from public.push_queue
  where notification_id = notification_b;
  if queued <> 1 then
    raise exception 'Expected a job for the second recipient, got %', queued;
  end if;

  if exists (select 1 from public.push_queue where notification_id = notification_c) then
    raise exception 'Notification without subscriptions created push jobs';
  end if;

  if (select count(*) from pg_temp.push_dispatch_test_calls) <> 1 then
    raise exception 'A notification batch with push jobs should invoke dispatch once';
  end if;

  perform set_config('test.push_notification_a', notification_a::text, true);
  perform set_config('test.push_notification_b', notification_b::text, true);
  perform set_config('test.push_notification_c', notification_c::text, true);
end;
$$;

insert into
  public.push_subscriptions (user_id, endpoint, p256dh, auth)
values
  (
    current_setting('test.push_user_c')::uuid,
    'https://example.invalid/test-device-c',
    'test-key-c',
    'test-auth-c'
  );

insert into
  public.push_queue (notification_id, subscription_id)
select
  current_setting('test.push_notification_c')::uuid,
  s.id
from
  public.push_subscriptions s
where
  s.user_id = current_setting('test.push_user_c')::uuid;

do $$
begin
  if not exists (
    select 1 from public.push_queue
    where notification_id = current_setting('test.push_notification_c')::uuid
  ) then
    raise exception 'Synthetic job for cascade test was not created';
  end if;

  delete from public.push_subscriptions
  where user_id = current_setting('test.push_user_c')::uuid;

  if exists (
    select 1 from public.push_queue
    where notification_id = current_setting('test.push_notification_c')::uuid
  ) then
    raise exception 'Deleting the expired subscription should cascade-delete its queued job';
  end if;
end;
$$;

set
  local role service_role;

do $$
declare claimed integer;
begin
  select count(*) into claimed from public.claim_push_jobs();
  if claimed <> 3 then
    raise exception 'Expected to claim three subscribed devices, got %', claimed;
  end if;

  select count(*) into claimed from public.claim_push_jobs();
  if claimed <> 0 then
    raise exception 'A currently leased job was claimed again';
  end if;
end;
$$;

reset role;

update public.notifications
set
  created_at = now() - interval '2 days'
where
  id = current_setting('test.push_notification_a')::uuid;

update public.push_queue
set
  available_at = now() - interval '1 second'
where
  notification_id in (
    current_setting('test.push_notification_a')::uuid,
    current_setting('test.push_notification_b')::uuid
  );

set
  local role service_role;

do $$
declare claimed integer;
begin
  select count(*) into claimed from public.claim_push_jobs();
  if claimed <> 1 then
    raise exception 'Expired notification should be skipped while the retry remains claimable, got %', claimed;
  end if;
end;
$$;

reset role;

do $$
begin
  if (select min(attempts) from public.push_queue where notification_id = current_setting('test.push_notification_b')::uuid) <> 2 then
    raise exception 'The retried push job did not increment its attempt count';
  end if;
end;
$$;

rollback;
