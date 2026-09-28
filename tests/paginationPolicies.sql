-- Run against the disposable local Supabase database after migrations.
-- All test rows are synthetic and rolled back; never run against production.
begin;

select
  set_config('test.page_admin', gen_random_uuid()::text, true);

select
  set_config(
    'test.page_requester',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.page_other_requester',
    gen_random_uuid()::text,
    true
  );

select
  set_config('test.page_unit', gen_random_uuid()::text, true);

select
  set_config(
    'test.page_ticket_one',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.page_ticket_two',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.page_ticket_other',
    gen_random_uuid()::text,
    true
  );

insert into
  auth.users (id)
values
  (current_setting('test.page_admin')::uuid),
  (current_setting('test.page_requester')::uuid),
  (
    current_setting('test.page_other_requester')::uuid
  );

insert into
  public.units (id, name, code)
values
  (
    current_setting('test.page_unit')::uuid,
    'Pagination test unit',
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
values
  (
    current_setting('test.page_admin')::uuid,
    'page-admin',
    'Pagination Admin',
    '000',
    'admin',
    current_setting('test.page_unit')::uuid,
    false
  ),
  (
    current_setting('test.page_requester')::uuid,
    'page-requester',
    'Pagination Requester',
    '000',
    'solicitante',
    current_setting('test.page_unit')::uuid,
    false
  ),
  (
    current_setting('test.page_other_requester')::uuid,
    'page-other-requester',
    'Other Requester',
    '000',
    'solicitante',
    current_setting('test.page_unit')::uuid,
    false
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
select
  current_setting('test.page_ticket_one')::uuid,
  'Alpha printer problem',
  'Synthetic description for the first pagination ticket',
  current_setting('test.page_unit')::uuid,
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
  current_setting('test.page_requester')::uuid,
  'Pagination Requester',
  '000'
union all
select
  current_setting('test.page_ticket_two')::uuid,
  'Beta network problem',
  'Synthetic description for the second pagination ticket',
  current_setting('test.page_unit')::uuid,
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
  current_setting('test.page_requester')::uuid,
  'Pagination Requester',
  '000'
union all
select
  current_setting('test.page_ticket_other')::uuid,
  'Gamma other requester problem',
  'Synthetic description for another requester ticket',
  current_setting('test.page_unit')::uuid,
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
  current_setting('test.page_other_requester')::uuid,
  'Other Requester',
  '000';

insert into
  public.ticket_events (ticket_id, actor_id, event_type, metadata)
values
  (
    current_setting('test.page_ticket_one')::uuid,
    current_setting('test.page_admin')::uuid,
    'created',
    '{"detail":"Chamado aberto"}'
  ),
  (
    current_setting('test.page_ticket_two')::uuid,
    current_setting('test.page_admin')::uuid,
    'status_changed',
    '{"detail":"Situação alterada para Em andamento"}'
  ),
  (
    current_setting('test.page_ticket_other')::uuid,
    current_setting('test.page_admin')::uuid,
    'created',
    '{"detail":"Chamado aberto"}'
  );

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.page_requester'),
    true
  );

set
  local role authenticated;

do $$
declare
  page_result record;
  visible_count bigint;
begin
  select * into page_result
  from public.get_ticket_page(
    'all', false, 'todos', array[]::text[], null, null, null, '', null, 'newest', 0, 1
  );
  if page_result.total_count <> 2 or jsonb_array_length(page_result.tickets) <> 1 then
    raise exception 'Requester page should return one of only their two tickets';
  end if;

  select count(*) into visible_count from public.get_ticket_navigation_counts();
  if visible_count <> 1 then
    raise exception 'Navigation counts should return one RLS-scoped summary row';
  end if;
  if (select my_open_count from public.get_ticket_navigation_counts()) <> 2 then
    raise exception 'Requester navigation count should include both owned open tickets';
  end if;

  if (public.get_ticket_dashboard() ->> 'open_count')::integer <> 2 then
    raise exception 'Dashboard summary must remain scoped to requester-visible tickets';
  end if;

  select * into page_result
  from public.get_audit_events_page(null, '', null, null, '', 0, 10);
  if page_result.total_count <> 4 or jsonb_array_length(page_result.events) <> 4 then
    raise exception 'Requester should see creation/history events only for their own two tickets';
  end if;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.page_admin'),
    true
  );

set
  local role authenticated;

do $$
declare
  page_result record;
begin
  select * into page_result
  from public.get_ticket_page(
    'all', false, 'todos', array[]::text[], null, null, null, 'Alpha printer problem', null, 'newest', 0, 10
  );
  if page_result.total_count <> 1 or jsonb_array_length(page_result.tickets) <> 1 then
    raise exception 'Ticket search must be filtered before pagination';
  end if;

  select * into page_result
  from public.get_audit_events_page(null, 'created', transaction_timestamp() - interval '1 second', null, '', 0, 1);
  if page_result.total_count <> 5 or jsonb_array_length(page_result.events) <> 1 then
    raise exception 'Audit count mismatch: total %, rows %', page_result.total_count, jsonb_array_length(page_result.events);
  end if;
  if page_result.ticket_count <> 3 or page_result.actor_count <> 1 then
    raise exception 'Audit summaries should be calculated across all matching rows, not just the page';
  end if;

  select * into page_result
  from public.get_audit_events_page(
    null, '', transaction_timestamp() - interval '1 second', null,
    '#' || (select ticket_number::text from public.tickets where id = current_setting('test.page_ticket_two')::uuid),
    0, 10
  );
  if page_result.total_count <> 2 then
    raise exception 'Exact ticket-number audit search should match that ticket history';
  end if;
end;
$$;

rollback;
