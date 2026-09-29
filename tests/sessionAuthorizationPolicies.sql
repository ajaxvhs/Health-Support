-- Run with psql against a disposable Supabase database after schema.sql and migrations.
-- Fixtures are synthetic and rolled back. Never run against production.
begin;

select
  set_config(
    'test.session_active',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.session_inactive',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.session_pending',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.session_unit',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.session_category',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.session_priority',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.session_status',
    (
      select
        id::text
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    true
  );

select
  set_config(
    'test.session_ticket',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.session_message',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.session_notification',
    gen_random_uuid()::text,
    true
  );

insert into
  auth.users (id)
values
  (current_setting('test.session_active')::uuid),
  (current_setting('test.session_inactive')::uuid),
  (current_setting('test.session_pending')::uuid);

insert into
  public.units (id, name, code)
values
  (
    current_setting('test.session_unit')::uuid,
    'Session test unit',
    'SESSION-TEST'
  );

insert into
  public.ticket_categories (id, name)
values
  (
    current_setting('test.session_category')::uuid,
    'Session test category'
  );

insert into
  public.ticket_priorities (id, slug, name, level, color)
values
  (
    current_setting('test.session_priority')::uuid,
    'session-test',
    'Session test',
    9001,
    '#123456'
  );

insert into
  public.profiles (
    id,
    username,
    full_name,
    phone,
    default_unit_id,
    role,
    is_active,
    must_change_password
  )
values
  (
    current_setting('test.session_active')::uuid,
    'session-active',
    'Active',
    '111',
    current_setting('test.session_unit')::uuid,
    'solicitante',
    true,
    false
  ),
  (
    current_setting('test.session_inactive')::uuid,
    'session-inactive',
    'Inactive',
    '222',
    current_setting('test.session_unit')::uuid,
    'solicitante',
    false,
    false
  ),
  (
    current_setting('test.session_pending')::uuid,
    'session-pending',
    'Pending',
    '333',
    current_setting('test.session_unit')::uuid,
    'admin',
    true,
    true
  );

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
    requester_name_snapshot,
    requester_phone_snapshot
  )
values
  (
    current_setting('test.session_ticket')::uuid,
    'Session authorization test',
    'Synthetic ticket for session authorization tests.',
    current_setting('test.session_unit')::uuid,
    current_setting('test.session_category')::uuid,
    current_setting('test.session_priority')::uuid,
    current_setting('test.session_status')::uuid,
    current_setting('test.session_active')::uuid,
    'Active',
    '111'
  );

insert into
  public.ticket_messages (id, ticket_id, sender_id, message, is_internal)
values
  (
    current_setting('test.session_message')::uuid,
    current_setting('test.session_ticket')::uuid,
    current_setting('test.session_active')::uuid,
    'Synthetic public message',
    false
  );

insert into
  public.notifications (id, user_id, title, message)
values
  (
    current_setting('test.session_notification')::uuid,
    current_setting('test.session_active')::uuid,
    'Synthetic notification',
    'Session test'
  );

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.session_active'),
    true
  );

set
  local role authenticated;

do $$
begin
  if (select count(*) from public.tickets where id = current_setting('test.session_ticket')::uuid) <> 1 then
    raise exception 'An active requester must still read their own ticket';
  end if;
  if (select count(*) from public.ticket_messages where ticket_id = current_setting('test.session_ticket')::uuid) <> 1 then
    raise exception 'An active requester must still read their public message';
  end if;
  if (select count(*) from public.profiles where id = auth.uid()) <> 1 then
    raise exception 'An active requester must read their own profile';
  end if;
end;
$$;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.session_pending'),
    true
  );

set
  local role authenticated;

do $$
begin
  if (select count(*) from public.profiles where id = auth.uid()) <> 1 then
    raise exception 'A password-pending user must read their own gate profile';
  end if;
  if (select count(*) from public.tickets) <> 0 then
    raise exception 'A password-pending user must not read tickets';
  end if;
  if (select count(*) from public.ticket_messages) <> 0 then
    raise exception 'A password-pending user must not read messages';
  end if;
  if (select count(*) from public.ticket_events) <> 0 then
    raise exception 'A password-pending user must not read events';
  end if;
  if (select count(*) from public.notifications) <> 0 then
    raise exception 'A password-pending user must not read notifications';
  end if;
  if (select count(*) from public.units) <> 0 then
    raise exception 'A password-pending user must not read catalogs';
  end if;
  if (select count(*) from public.push_public_config) <> 0 then
    raise exception 'A password-pending user must not read push configuration';
  end if;
  if public.is_admin() or public.is_staff() then
    raise exception 'A password-pending admin must not retain administrative access';
  end if;
  if (select visible_open_count from public.get_ticket_navigation_counts()) <> 0 then
    raise exception 'A password-pending user must not receive ticket counts';
  end if;
  if (
    select total_count
    from public.get_ticket_page('all', false, 'todos', array[]::text[], null, null, null, '', null, 'newest', 0, 10)
  ) <> 0 then
    raise exception 'A password-pending user must not receive ticket pages';
  end if;
  if exists (select 1 from public.get_ticket_participants()) then
    raise exception 'A password-pending user must not read ticket participants';
  end if;
  if to_regprocedure('public.mark_password_changed()') is not null then
    raise exception 'The client-callable password flag reset RPC must be removed';
  end if;
  begin
    perform public.update_own_profile('Pending', '333');
    raise exception 'A password-pending user must not update profile data';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.tickets (
      title, description, unit_id, category_id, priority_id, status_id,
      created_by, requester_name_snapshot, requester_phone_snapshot
    ) values (
      'Blocked pending ticket', 'This write is intentionally denied.',
      current_setting('test.session_unit')::uuid,
      current_setting('test.session_category')::uuid,
      current_setting('test.session_priority')::uuid,
      current_setting('test.session_status')::uuid,
      auth.uid(), 'Pending', '333'
    );
    raise exception 'A password-pending user must not create tickets';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.session_inactive'),
    true
  );

set
  local role authenticated;

do $$
begin
  if (select count(*) from public.profiles where id = auth.uid()) <> 0 then
    raise exception 'An inactive user must not read their profile';
  end if;
  if (select count(*) from public.tickets) <> 0 then
    raise exception 'An inactive user must not read tickets';
  end if;
  if (select count(*) from public.ticket_messages) <> 0 then
    raise exception 'An inactive user must not read messages';
  end if;
  if (select count(*) from public.ticket_events) <> 0 then
    raise exception 'An inactive user must not read events';
  end if;
  if (select count(*) from public.notifications) <> 0 then
    raise exception 'An inactive user must not read notifications';
  end if;
  if (select count(*) from public.units) <> 0 then
    raise exception 'An inactive user must not read catalogs';
  end if;
end;
$$;

reset role;

update auth.users
set
  encrypted_password = 'synthetic-hash-before',
  raw_app_meta_data = '{"force_password_change":true}'::jsonb
where
  id = current_setting('test.session_pending')::uuid;

do $$
begin
  if not (select must_change_password from public.profiles where id = current_setting('test.session_pending')::uuid) then
    raise exception 'An Auth password reset marked as forced must keep the profile gated';
  end if;
end;
$$;

update auth.users
set
  encrypted_password = 'synthetic-hash-after',
  raw_app_meta_data = '{"force_password_change":false}'::jsonb
where
  id = current_setting('test.session_pending')::uuid;

do $$
begin
  if (select must_change_password from public.profiles where id = current_setting('test.session_pending')::uuid) then
    raise exception 'A confirmed Auth password change must clear the profile gate atomically';
  end if;
end;
$$;

rollback;
