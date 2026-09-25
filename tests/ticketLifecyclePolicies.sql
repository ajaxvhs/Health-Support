-- Run with psql against a disposable Supabase database after schema.sql and all migrations.
-- Fixtures are synthetic and rolled back. Never run against production.
begin;

select
  set_config(
    'test.lifecycle_requester',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.lifecycle_staff_a',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.lifecycle_staff_b',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.lifecycle_admin',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.lifecycle_unit',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.lifecycle_category',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.lifecycle_priority',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.lifecycle_priority_alt',
    gen_random_uuid()::text,
    true
  );

insert into
  auth.users (id)
values
  (current_setting('test.lifecycle_requester')::uuid),
  (current_setting('test.lifecycle_staff_a')::uuid),
  (current_setting('test.lifecycle_staff_b')::uuid),
  (current_setting('test.lifecycle_admin')::uuid);

insert into
  public.units (id, name, code)
values
  (
    current_setting('test.lifecycle_unit')::uuid,
    'Lifecycle test unit',
    'LIFECYCLE'
  );

insert into
  public.ticket_categories (id, name)
values
  (
    current_setting('test.lifecycle_category')::uuid,
    'Lifecycle test category'
  );

insert into
  public.ticket_priorities (id, slug, name, level, color)
values
  (
    current_setting('test.lifecycle_priority')::uuid,
    'lifecycle-test',
    'Lifecycle test',
    100,
    'blue'
  );

insert into
  public.ticket_priorities (id, slug, name, level, color)
values
  (
    current_setting('test.lifecycle_priority_alt')::uuid,
    'lifecycle-test-alt',
    'Lifecycle alternate priority',
    101,
    'green'
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
    current_setting('test.lifecycle_requester')::uuid,
    'lifecycle-requester',
    'Synthetic requester',
    '000',
    'solicitante',
    current_setting('test.lifecycle_unit')::uuid,
    false
  ),
  (
    current_setting('test.lifecycle_staff_a')::uuid,
    'lifecycle-staff-a',
    'Synthetic staff A',
    '000',
    'atendente',
    current_setting('test.lifecycle_unit')::uuid,
    false
  ),
  (
    current_setting('test.lifecycle_staff_b')::uuid,
    'lifecycle-staff-b',
    'Synthetic staff B',
    '000',
    'atendente',
    current_setting('test.lifecycle_unit')::uuid,
    false
  ),
  (
    current_setting('test.lifecycle_admin')::uuid,
    'lifecycle-admin',
    'Synthetic administrator',
    '000',
    'admin',
    current_setting('test.lifecycle_unit')::uuid,
    false
  );

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_requester'),
    true
  );

set
  local role authenticated;

insert into
  public.tickets (
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
    'Lifecycle test ticket',
    'Synthetic lifecycle test description',
    current_setting('test.lifecycle_unit')::uuid,
    current_setting('test.lifecycle_category')::uuid,
    current_setting('test.lifecycle_priority')::uuid,
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    auth.uid (),
    'Synthetic requester',
    '000'
  );

do $$
begin
  if not exists (
    select 1 from public.ticket_events
    where ticket_id = (select id from public.tickets where title = 'Lifecycle test ticket')
      and event_type = 'created'
      and actor_id = auth.uid()
  ) then
    raise exception 'Ticket creation was not written to history';
  end if;
end;
$$;

do $$
begin
  begin
    insert into public.ticket_messages(ticket_id, sender_id, message, is_internal)
    select id, auth.uid(), 'forbidden internal note', true
    from public.tickets where title = 'Lifecycle test ticket';
    raise exception 'Requester inserted an internal note';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_staff_a'),
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
  title = 'Lifecycle test ticket';

do $$
begin
  if not exists (
    select 1 from public.ticket_events
    where ticket_id = (select id from public.tickets where title = 'Lifecycle test ticket')
      and event_type = 'claimed'
      and actor_id = auth.uid()
      and from_assigned_to is null
      and to_assigned_to = auth.uid()
      and metadata->>'from_status_slug' = 'aberto'
      and metadata->>'to_status_slug' = 'em_andamento'
      and metadata->>'detail' = 'Assumiu o chamado'
  ) then
    raise exception 'Assuming a ticket did not create a complete claim event';
  end if;
end;
$$;

update public.tickets
set
  priority_id = current_setting('test.lifecycle_priority_alt')::uuid
where
  title = 'Lifecycle test ticket';

do $$
declare event_count integer;
begin
  select count(*) into event_count
  from public.ticket_events
  where ticket_id = (select id from public.tickets where title = 'Lifecycle test ticket')
    and event_type = 'priority_changed'
    and actor_id = auth.uid();
  if event_count <> 1 then
    raise exception 'Priority change was not recorded as its own event';
  end if;
  if not exists (
    select 1 from public.ticket_events
    where ticket_id = (select id from public.tickets where title = 'Lifecycle test ticket')
      and event_type = 'priority_changed'
      and metadata->>'detail' = 'Prioridade alterada de Lifecycle test para Lifecycle alternate priority'
  ) then
    raise exception 'Priority history does not identify its old and new values';
  end if;
end;
$$;

do $$
declare before_count integer; after_count integer;
begin
  select count(*) into before_count
  from public.ticket_events
  where ticket_id = (select id from public.tickets where title = 'Lifecycle test ticket');
  update public.tickets set description = description
  where title = 'Lifecycle test ticket';
  select count(*) into after_count
  from public.ticket_events
  where ticket_id = (select id from public.tickets where title = 'Lifecycle test ticket');
  if after_count <> before_count then
    raise exception 'A no-op ticket update generated a duplicate history event';
  end if;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_staff_b'),
    true
  );

set
  local role authenticated;

do $$
declare affected integer;
begin
  update public.tickets set priority_id = current_setting('test.lifecycle_priority')::uuid
  where title = 'Lifecycle test ticket';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'An unrelated attendant modified an assigned ticket'; end if;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_staff_a'),
    true
  );

set
  local role authenticated;

do $$
begin
  begin
    update public.tickets
    set status_id = (select id from public.ticket_statuses where slug = 'resolvido'),
        resolution_notes = '   '
    where title = 'Lifecycle test ticket';
    raise exception 'Ticket resolved without a non-empty solution';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

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
  resolution_notes = 'Synthetic verified solution'
where
  title = 'Lifecycle test ticket';

do $$
begin
  if not exists (select 1 from public.tickets where title = 'Lifecycle test ticket' and resolved_at is not null) then
    raise exception 'Resolution timestamp was not generated by the server';
  end if;
  begin
    insert into public.ticket_messages(ticket_id, sender_id, message, is_internal)
    select id, auth.uid(), 'forbidden terminal note', true
    from public.tickets where title = 'Lifecycle test ticket';
    raise exception 'Staff inserted a terminal-state note';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_requester'),
    true
  );

set
  local role authenticated;

do $$
begin
  begin
    update public.tickets
    set status_id = (select id from public.ticket_statuses where slug = 'fechado')
    where title = 'Lifecycle test ticket';
    raise exception 'Resolved ticket was incorrectly transitioned to closed';
  exception when check_violation then null;
  end;
end;
$$;

do $$
begin
  begin
    update public.tickets
    set status_id = (select id from public.ticket_statuses where slug = 'aberto'),
        assigned_to = null
    where title = 'Lifecycle test ticket';
    raise exception 'Requester reopened a resolved ticket without administrator approval';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_admin'),
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
  title = 'Lifecycle test ticket';

do $$
begin
  if not exists (select 1 from public.tickets where title = 'Lifecycle test ticket'
    and assigned_to is null and resolved_at is null and closed_at is null and resolution_notes is null) then
    raise exception 'Reopening did not clear assignment and resolution metadata';
  end if;
  if not exists (select 1 from public.ticket_events
    where event_type = 'reopened' and ticket_id = (select id from public.tickets where title = 'Lifecycle test ticket')) then
    raise exception 'Reopening event was not recorded';
  end if;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_admin'),
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
  title = 'Lifecycle test ticket';

do $$
begin
  if not exists (
    select 1 from public.tickets
    where title = 'Lifecycle test ticket'
      and closed_at is not null
      and resolved_at is null
      and resolution_notes is null
      and assigned_to is null
  ) then
    raise exception 'Administrator could not close an open ticket without resolution';
  end if;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_requester'),
    true
  );

set
  local role authenticated;

do $$
begin
  begin
    update public.tickets
    set status_id = (select id from public.ticket_statuses where slug = 'aberto'),
        assigned_to = null
    where title = 'Lifecycle test ticket';
    raise exception 'Requester reopened a closed ticket without administrator approval';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_admin'),
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
  title = 'Lifecycle test ticket';

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
  title = 'Lifecycle test ticket';

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
  title = 'Lifecycle test ticket';

do $$
begin
  if not exists (select 1 from public.tickets where title = 'Lifecycle test ticket'
    and status_id = (select id from public.ticket_statuses where slug = 'aberto') and assigned_to is null) then
    raise exception 'Administrator could not release the ticket atomically';
  end if;
  if not exists (
    select 1 from public.ticket_events
    where ticket_id = (select id from public.tickets where title = 'Lifecycle test ticket')
      and event_type = 'released'
      and actor_id = auth.uid()
      and from_assigned_to = auth.uid()
      and to_assigned_to is null
      and metadata->>'from_status_slug' = 'em_andamento'
      and metadata->>'to_status_slug' = 'aberto'
      and metadata->>'detail' = 'Liberou o chamado para a fila'
  ) then
    raise exception 'Releasing a ticket did not create a complete release event';
  end if;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_staff_b'),
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
  title = 'Lifecycle test ticket'
  and assigned_to is null;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_staff_a'),
    true
  );

set
  local role authenticated;

do $$
declare affected integer;
begin
  update public.tickets
  set status_id = (select id from public.ticket_statuses where slug = 'em_andamento'),
      assigned_to = auth.uid()
  where title = 'Lifecycle test ticket' and assigned_to is null;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'A second attendant claimed an already assigned ticket'; end if;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_staff_b'),
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
  title = 'Lifecycle test ticket';

do $$
begin
  if not exists (
    select 1 from public.tickets
    where title = 'Lifecycle test ticket'
      and closed_at is not null
      and resolved_at is null
      and resolution_notes is null
      and assigned_to = current_setting('test.lifecycle_staff_b')::uuid
  ) then
    raise exception 'Responsible attendant could not close directly without resolution';
  end if;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_requester'),
    true
  );

set
  local role authenticated;

do $$
begin
  begin
    update public.tickets
    set status_id = (select id from public.ticket_statuses where slug = 'aberto'),
        assigned_to = null
    where title = 'Lifecycle test ticket';
    raise exception 'Requester reopened a closed ticket without administrator approval';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_admin'),
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
  title = 'Lifecycle test ticket';

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.lifecycle_staff_b'),
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
  title = 'Lifecycle test ticket'
  and assigned_to is null;

do $$
begin
  if not exists (
    select 1
    from public.tickets t
    join public.ticket_statuses s on s.id = t.status_id
    where t.title = 'Lifecycle test ticket'
      and s.slug = 'em_andamento'
      and t.assigned_to = auth.uid()
  ) then
    raise exception 'Ticket is not in progress and assigned to the acting attendant before second resolution';
  end if;
  if (select p.role::text from public.profiles p where p.id = auth.uid()) <> 'atendente' then
    raise exception 'Second resolution actor is not an active attendant';
  end if;
end;
$$;

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
  resolution_notes = 'Synthetic solution after reopening'
where
  title = 'Lifecycle test ticket';

do $$
begin
  if not exists (
    select 1 from public.tickets
    where title = 'Lifecycle test ticket' and resolved_at is not null and closed_at is null
  ) then
    raise exception 'Ticket was not successfully resolved again';
  end if;
  if (
    select count(*) from public.ticket_events
    where ticket_id = (select id from public.tickets where title = 'Lifecycle test ticket')
      and event_type = 'resolved'
  ) <> 2 then
    raise exception 'Both confirmed resolutions were not recorded';
  end if;
end;
$$;

rollback;
