-- Run with psql against the disposable local Supabase database after migrations.
-- Synthetic fixtures are rolled back; never run against production.
begin;

select
  set_config(
    'test.notice_admin_a',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.notice_admin_b',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.notice_requester',
    gen_random_uuid()::text,
    true
  );

select
  set_config('test.notice_unit', gen_random_uuid()::text, true);

select
  set_config(
    'test.notice_category',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.notice_priority',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.notice_priority_new',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.notice_ticket',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.notice_reopened_ticket',
    gen_random_uuid()::text,
    true
  );

insert into
  auth.users (id)
values
  (current_setting('test.notice_admin_a')::uuid),
  (current_setting('test.notice_admin_b')::uuid),
  (current_setting('test.notice_requester')::uuid);

insert into
  public.units (id, name, code)
values
  (
    current_setting('test.notice_unit')::uuid,
    'Notification test unit',
    'NOTICE-TEST'
  );

insert into
  public.ticket_categories (id, name)
values
  (
    current_setting('test.notice_category')::uuid,
    'Notification test category'
  );

insert into
  public.ticket_priorities (id, slug, name, level, color)
values
  (
    current_setting('test.notice_priority')::uuid,
    'notice-test',
    'Notice test',
    200,
    'blue'
  ),
  (
    current_setting('test.notice_priority_new')::uuid,
    'notice-test-new',
    'Notice test new',
    201,
    'red'
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
values
  (
    current_setting('test.notice_admin_a')::uuid,
    'notice-admin-a',
    'Admin A',
    '000',
    'admin',
    current_setting('test.notice_unit')::uuid,
    false
  ),
  (
    current_setting('test.notice_admin_b')::uuid,
    'notice-admin-b',
    'Admin B',
    '000',
    'admin',
    current_setting('test.notice_unit')::uuid,
    false
  ),
  (
    current_setting('test.notice_requester')::uuid,
    'notice-requester',
    'Requester',
    '000',
    'solicitante',
    current_setting('test.notice_unit')::uuid,
    false
  );

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_requester'),
    true
  );

set
  local role authenticated;

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
    current_setting('test.notice_ticket')::uuid,
    'Notification matrix ticket',
    'Synthetic ticket for notification recipient tests.',
    current_setting('test.notice_unit')::uuid,
    current_setting('test.notice_category')::uuid,
    current_setting('test.notice_priority')::uuid,
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    auth.uid (),
    'Requester',
    '000'
  );

reset role;

do $$
declare
  v_ticket_id uuid := current_setting('test.notice_ticket')::uuid;
  admin_a uuid := current_setting('test.notice_admin_a')::uuid;
  admin_b uuid := current_setting('test.notice_admin_b')::uuid;
  requester uuid := current_setting('test.notice_requester')::uuid;
  new_ticket_notification_count integer;
  active_admin_count integer;
begin
  select count(*) into new_ticket_notification_count
  from public.notifications
  where ticket_id = v_ticket_id and title = 'Novo chamado aberto';
  select count(*) into active_admin_count
  from public.profiles
  where is_active and role::text = 'admin';
  if new_ticket_notification_count <> active_admin_count then
    raise exception 'A new ticket should notify both active admins (notifications %, active admins %)',
      new_ticket_notification_count, active_admin_count;
  end if;
  if exists (select 1 from public.notifications where ticket_id = v_ticket_id and user_id = requester and title = 'Novo chamado aberto') then
    raise exception 'The requester should not receive their own new-ticket notification';
  end if;
end;
$$;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_admin_a'),
    true
  );

set
  local role authenticated;

update public.tickets
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'em_andamento'
  ),
  assigned_to = auth.uid ()
where
  id = current_setting('test.notice_ticket')::uuid;

reset role;

do $$
declare
  v_ticket_id uuid := current_setting('test.notice_ticket')::uuid;
  admin_a uuid := current_setting('test.notice_admin_a')::uuid;
  admin_b uuid := current_setting('test.notice_admin_b')::uuid;
  requester uuid := current_setting('test.notice_requester')::uuid;
begin
  if not exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = requester and title = 'Chamado assumido'
  ) then
    raise exception 'Assuming a ticket should notify its requester';
  end if;
  if exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id in (admin_a, admin_b) and title = 'Chamado assumido'
  ) then
    raise exception 'Assuming a ticket must not notify an admin who did not receive the action';
  end if;
end;
$$;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_admin_b'),
    true
  );

set
  local role authenticated;

update public.tickets
set
  priority_id = current_setting('test.notice_priority_new')::uuid
where
  id = current_setting('test.notice_ticket')::uuid;

reset role;

do $$
declare
  v_ticket_id uuid := current_setting('test.notice_ticket')::uuid;
  admin_a uuid := current_setting('test.notice_admin_a')::uuid;
  admin_b uuid := current_setting('test.notice_admin_b')::uuid;
  requester uuid := current_setting('test.notice_requester')::uuid;
begin
  if not exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = admin_a and title = 'Prioridade do chamado alterada'
  ) or not exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = requester and title = 'Prioridade do chamado alterada'
  ) then
    raise exception 'Priority changes should notify the responsible admin and requester';
  end if;
  if exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = admin_b and title = 'Prioridade do chamado alterada'
  ) then
    raise exception 'The actor should not receive their own priority notification';
  end if;
end;
$$;

select
  set_config(
    'test.notice_events_before_messages',
    (
      select
        count(*)::text
      from
        public.ticket_events
      where
        ticket_id = current_setting('test.notice_ticket')::uuid
    ),
    true
  );

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_requester'),
    true
  );

set
  local role authenticated;

insert into
  public.ticket_messages (ticket_id, sender_id, message, is_internal)
values
  (
    current_setting('test.notice_ticket')::uuid,
    auth.uid (),
    'Public requester response.',
    false
  );

reset role;

do $$
declare
  v_ticket_id uuid := current_setting('test.notice_ticket')::uuid;
  admin_a uuid := current_setting('test.notice_admin_a')::uuid;
  admin_b uuid := current_setting('test.notice_admin_b')::uuid;
  requester uuid := current_setting('test.notice_requester')::uuid;
begin
  if not exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = admin_a
      and title like 'Nova resposta da equipe%'
  ) then
    raise exception 'A public requester message should notify the current responsible';
  end if;
  if exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id in (admin_b, requester)
      and title like 'Nova resposta da equipe%'
  ) then
    raise exception 'A public requester message should only notify its counterpart';
  end if;
end;
$$;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_admin_a'),
    true
  );

set
  local role authenticated;

insert into
  public.ticket_messages (ticket_id, sender_id, message, is_internal)
values
  (
    current_setting('test.notice_ticket')::uuid,
    auth.uid (),
    'Public admin response.',
    false
  );

insert into
  public.ticket_messages (ticket_id, sender_id, message, is_internal)
values
  (
    current_setting('test.notice_ticket')::uuid,
    auth.uid (),
    'Internal admin note.',
    true
  );

reset role;

do $$
declare
  v_ticket_id uuid := current_setting('test.notice_ticket')::uuid;
  admin_a uuid := current_setting('test.notice_admin_a')::uuid;
  admin_b uuid := current_setting('test.notice_admin_b')::uuid;
  requester uuid := current_setting('test.notice_requester')::uuid;
  event_count_before integer;
  event_count_after integer;
begin
  if not exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = requester
      and title like '%respondeu no chamado%'
  ) then
    raise exception 'A public admin message should notify the requester';
  end if;
  if not exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = admin_b
      and title like 'Nova nota interna%'
  ) then
    raise exception 'An internal note should notify other admins';
  end if;
  if exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = requester and title like 'Nova nota interna%'
  ) then
    raise exception 'An internal note must never notify the requester';
  end if;
  if exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = admin_a and title like 'Nova nota interna%'
  ) then
    raise exception 'An admin must not receive their own internal-note notification';
  end if;

  event_count_before := current_setting('test.notice_events_before_messages')::integer;
  select count(*) into event_count_after from public.ticket_events where ticket_id = v_ticket_id;
  if event_count_after <> event_count_before then
    raise exception 'Messages must not create audit events';
  end if;
end;
$$;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_requester'),
    true
  );

set
  local role authenticated;

do $$
begin
  if exists (
    select 1 from public.ticket_messages
    where ticket_id = current_setting('test.notice_ticket')::uuid and is_internal
  ) then
    raise exception 'The requester can read an internal note';
  end if;
  if exists (
    select 1 from public.notifications
    where user_id <> auth.uid()
  ) then
    raise exception 'A user can read another account’s notifications';
  end if;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_admin_a'),
    true
  );

set
  local role authenticated;

update public.tickets
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'aberto'
  ),
  assigned_to = null
where
  id = current_setting('test.notice_ticket')::uuid;

reset role;

do $$
declare
  v_ticket_id uuid := current_setting('test.notice_ticket')::uuid;
  admin_a uuid := current_setting('test.notice_admin_a')::uuid;
  admin_b uuid := current_setting('test.notice_admin_b')::uuid;
  requester uuid := current_setting('test.notice_requester')::uuid;
begin
  if not exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = admin_b
      and title = 'Chamado liberado para a fila'
  ) then
    raise exception 'Releasing a ticket should notify the admin queue';
  end if;
  if exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = admin_a
      and title = 'Chamado liberado para a fila'
  ) then
    raise exception 'The actor must not receive their own release notification';
  end if;
  if exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = requester
      and title = 'Chamado liberado para a fila'
  ) then
    raise exception 'Releasing to the queue should not notify the requester';
  end if;
end;
$$;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_requester'),
    true
  );

set
  local role authenticated;

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
    current_setting('test.notice_reopened_ticket')::uuid,
    'Notification matrix close ticket',
    'Synthetic ticket for close notification tests.',
    current_setting('test.notice_unit')::uuid,
    current_setting('test.notice_category')::uuid,
    current_setting('test.notice_priority')::uuid,
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    auth.uid (),
    'Requester',
    '000'
  );

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_admin_a'),
    true
  );

set
  local role authenticated;

update public.tickets
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'fechado'
  )
where
  id = current_setting('test.notice_reopened_ticket')::uuid;

update public.tickets
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'em_andamento'
  ),
  assigned_to = auth.uid ()
where
  id = current_setting('test.notice_ticket')::uuid
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'aberto'
  )
  and assigned_to is null;

update public.tickets
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'resolvido'
  ),
  resolution_notes = 'Synthetic notification test solution'
where
  id = current_setting('test.notice_ticket')::uuid
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'em_andamento'
  );

reset role;

do $$
declare
  v_ticket_id uuid := current_setting('test.notice_ticket')::uuid;
  v_closed_ticket_id uuid := current_setting('test.notice_reopened_ticket')::uuid;
  v_requester uuid := current_setting('test.notice_requester')::uuid;
begin
  if not exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and user_id = v_requester and title = 'Chamado resolvido'
  ) then
    raise exception 'Resolving a ticket should notify the requester';
  end if;
  if not exists (
    select 1 from public.notifications
    where ticket_id = v_closed_ticket_id and user_id = v_requester and title = 'Chamado encerrado'
  ) then
    raise exception 'Closing a ticket should notify the requester';
  end if;
end;
$$;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.notice_admin_a'),
    true
  );

set
  local role authenticated;

update public.tickets
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'aberto'
  ),
  assigned_to = null
where
  id = current_setting('test.notice_ticket')::uuid
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'resolvido'
  );

reset role;

do $$
declare
  v_ticket_id uuid := current_setting('test.notice_ticket')::uuid;
  v_admin_a uuid := current_setting('test.notice_admin_a')::uuid;
  v_requester uuid := current_setting('test.notice_requester')::uuid;
  expected_recipients integer;
begin
  select count(*) - 1 into expected_recipients
  from public.profiles
  where is_active and role::text = 'admin';
  expected_recipients := expected_recipients + 1;

  if (
    select count(*) from public.notifications
    where ticket_id = v_ticket_id and title = 'Chamado reaberto'
  ) <> expected_recipients then
    raise exception 'Reopening should notify all other admins and the requester';
  end if;
  if exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and title = 'Chamado reaberto' and user_id = v_admin_a
  ) then
    raise exception 'The admin who reopened a ticket must not receive their own notification';
  end if;
  if not exists (
    select 1 from public.notifications
    where ticket_id = v_ticket_id and title = 'Chamado reaberto' and user_id = v_requester
  ) then
    raise exception 'Reopening should notify the original requester';
  end if;
end;
$$;

rollback;
