-- Run with psql against the disposable local Supabase database after migrations.
-- Synthetic fixtures are rolled back; never run against production.
begin;

select
  set_config(
    'test.priority_order_admin',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.priority_order_unit',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.priority_order_category',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.priority_order_custom',
    gen_random_uuid()::text,
    true
  );

insert into
  auth.users (id)
values
  (
    current_setting('test.priority_order_admin')::uuid
  );

insert into
  public.units (id, name, code)
values
  (
    current_setting('test.priority_order_unit')::uuid,
    'Priority order test unit',
    'PRIORITY-' || left(gen_random_uuid()::text, 8)
  );

insert into
  public.ticket_categories (id, name)
values
  (
    current_setting('test.priority_order_category')::uuid,
    'Priority order test category'
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
    current_setting('test.priority_order_admin')::uuid,
    'priority-order-' || left(current_setting('test.priority_order_admin'), 8),
    'Priority order test admin',
    '000',
    'admin',
    current_setting('test.priority_order_unit')::uuid,
    false
  );

insert into
  public.ticket_priorities (id, slug, name, level, color)
values
  (
    current_setting('test.priority_order_custom')::uuid,
    'custom-emergency',
    'Custom emergency',
    100,
    '#ef4444'
  );

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
    requester_phone_snapshot,
    created_at,
    updated_at
  )
values
  (
    'Custom priority first ticket',
    'Synthetic priority ordering fixture.',
    current_setting('test.priority_order_unit')::uuid,
    current_setting('test.priority_order_category')::uuid,
    current_setting('test.priority_order_custom')::uuid,
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    current_setting('test.priority_order_admin')::uuid,
    'Synthetic admin',
    '000',
    '2026-01-01 12:00:00+00',
    '2026-01-01 12:00:00+00'
  ),
  (
    'Custom priority second ticket',
    'Synthetic priority ordering fixture.',
    current_setting('test.priority_order_unit')::uuid,
    current_setting('test.priority_order_category')::uuid,
    current_setting('test.priority_order_custom')::uuid,
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    current_setting('test.priority_order_admin')::uuid,
    'Synthetic admin',
    '000',
    '2026-01-01 12:00:00+00',
    '2026-01-01 12:00:00+00'
  ),
  (
    'Urgent priority ticket',
    'Synthetic priority ordering fixture.',
    current_setting('test.priority_order_unit')::uuid,
    current_setting('test.priority_order_category')::uuid,
    (
      select
        id
      from
        public.ticket_priorities
      where
        slug = 'urgente'
    ),
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    current_setting('test.priority_order_admin')::uuid,
    'Synthetic admin',
    '000',
    '2026-01-01 12:00:00+00',
    '2026-01-01 12:00:00+00'
  ),
  (
    'Low priority ticket',
    'Synthetic priority ordering fixture.',
    current_setting('test.priority_order_unit')::uuid,
    current_setting('test.priority_order_category')::uuid,
    (
      select
        id
      from
        public.ticket_priorities
      where
        slug = 'baixa'
    ),
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    current_setting('test.priority_order_admin')::uuid,
    'Synthetic admin',
    '000',
    '2026-01-01 12:00:00+00',
    '2026-01-01 12:00:00+00'
  );

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.priority_order_admin'),
    true
  );

set
  local role authenticated;

do $$
declare
  priority_order text[];
  priority_first_page text[];
  priority_second_page text[];
  newest_order text[];
begin
  select array_agg(ticket->>'title' order by item.ordinality)
  into priority_order
  from public.get_ticket_page(
    'all', false, 'todos', '{}'::text[], null,
    current_setting('test.priority_order_unit')::uuid, null, '', null,
    'priority', 0, 100
  ) page
  cross join lateral jsonb_array_elements(page.tickets) with ordinality as item(ticket, ordinality);

  if priority_order is distinct from array[
    'Custom priority second ticket',
    'Custom priority first ticket',
    'Urgent priority ticket',
    'Low priority ticket'
  ]::text[] then
    raise exception 'Priority ordering mismatch: %', priority_order;
  end if;

  select array_agg(ticket->>'title' order by item.ordinality)
  into priority_first_page
  from public.get_ticket_page(
    'all', false, 'todos', '{}'::text[], null,
    current_setting('test.priority_order_unit')::uuid, null, '', null,
    'priority', 0, 2
  ) page
  cross join lateral jsonb_array_elements(page.tickets) with ordinality as item(ticket, ordinality);

  select array_agg(ticket->>'title' order by item.ordinality)
  into priority_second_page
  from public.get_ticket_page(
    'all', false, 'todos', '{}'::text[], null,
    current_setting('test.priority_order_unit')::uuid, null, '', null,
    'priority', 2, 2
  ) page
  cross join lateral jsonb_array_elements(page.tickets) with ordinality as item(ticket, ordinality);

  if priority_first_page is distinct from array[
    'Custom priority second ticket',
    'Custom priority first ticket'
  ]::text[] then
    raise exception 'First priority page mismatch: %', priority_first_page;
  end if;

  if priority_second_page is distinct from array[
    'Urgent priority ticket',
    'Low priority ticket'
  ]::text[] then
    raise exception 'Second priority page mismatch: %', priority_second_page;
  end if;

  select array_agg(ticket->>'title' order by item.ordinality)
  into newest_order
  from public.get_ticket_page(
    'all', false, 'todos', '{}'::text[], null,
    current_setting('test.priority_order_unit')::uuid, null, '', null,
    'newest', 0, 100
  ) page
  cross join lateral jsonb_array_elements(page.tickets) with ordinality as item(ticket, ordinality);

  if newest_order is distinct from array[
    'Low priority ticket',
    'Urgent priority ticket',
    'Custom priority second ticket',
    'Custom priority first ticket'
  ]::text[] then
    raise exception 'Newest ordering tie-break mismatch: %', newest_order;
  end if;
end;
$$;

rollback;
