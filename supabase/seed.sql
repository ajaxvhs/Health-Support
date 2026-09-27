-- Local-only fixture accounts and tickets. Never include this seed in production.
-- Usernames: vpulici, solicitante.local
-- Shared local test password: senha1234
begin;

insert into
  auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change,
    email_change_token_new,
    email_change_token_current,
    reauthentication_token,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
  )
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'vpulici@health-support.test',
    extensions.crypt ('senha1234', extensions.gen_salt ('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"username":"vpulici","full_name":"Vicenzo Pulici"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'solicitante.local@health-support.test',
    extensions.crypt ('senha1234', extensions.gen_salt ('bf')),
    now(),
    '',
    '',
    '',
    '',
    '',
    '',
    '{"provider":"email","providers":["email"]}',
    '{"username":"solicitante.local","full_name":"Solicitante Local"}',
    now(),
    now()
  )
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  confirmation_token = excluded.confirmation_token,
  recovery_token = excluded.recovery_token,
  email_change = excluded.email_change,
  email_change_token_new = excluded.email_change_token_new,
  email_change_token_current = excluded.email_change_token_current,
  reauthentication_token = excluded.reauthentication_token,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = now();

insert into
  public.profiles (
    id,
    username,
    full_name,
    phone,
    role,
    default_unit_id,
    is_active,
    must_change_password
  )
values
  (
    '10000000-0000-4000-8000-000000000001',
    'vpulici',
    'Vicenzo Pulici',
    '0000000000',
    'admin',
    (
      select
        id
      from
        public.units
      where
        code = 'ESC'
    ),
    true,
    false
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'solicitante.local',
    'Solicitante Local',
    '0000000000',
    'solicitante',
    (
      select
        id
      from
        public.units
      where
        code = 'ESC'
    ),
    true,
    false
  )
on conflict (id) do update
set
  username = excluded.username,
  full_name = excluded.full_name,
  phone = excluded.phone,
  role = excluded.role,
  default_unit_id = excluded.default_unit_id,
  is_active = true,
  must_change_password = false,
  updated_at = now();

select
  set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000002',
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
values
  (
    '20000000-0000-4000-8000-000000000001',
    'Teste local: chamado na fila',
    'Chamado de exemplo aberto, pronto para ser assumido por um administrador.',
    (
      select
        id
      from
        public.units
      where
        code = 'ESC'
    ),
    (
      select
        id
      from
        public.ticket_categories
      where
        name = 'Computadores'
    ),
    (
      select
        id
      from
        public.ticket_priorities
      where
        slug = 'media'
    ),
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    '10000000-0000-4000-8000-000000000002',
    'Solicitante Local',
    '0000000000'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'Teste local: chamado em atendimento',
    'Exemplo de chamado assumido por um administrador.',
    (
      select
        id
      from
        public.units
      where
        code = 'ESC'
    ),
    (
      select
        id
      from
        public.ticket_categories
      where
        name = 'Internet'
    ),
    (
      select
        id
      from
        public.ticket_priorities
      where
        slug = 'alta'
    ),
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    '10000000-0000-4000-8000-000000000002',
    'Solicitante Local',
    '0000000000'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'Teste local: chamado resolvido',
    'Exemplo de chamado com solução registrada.',
    (
      select
        id
      from
        public.units
      where
        code = 'ESC'
    ),
    (
      select
        id
      from
        public.ticket_categories
      where
        name = 'Computadores'
    ),
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
    '10000000-0000-4000-8000-000000000002',
    'Solicitante Local',
    '0000000000'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    'Teste local: fechado sem solução',
    'Exemplo de chamado fechado sem solução registrada.',
    (
      select
        id
      from
        public.units
      where
        code = 'ESC'
    ),
    (
      select
        id
      from
        public.ticket_categories
      where
        name = 'Telefonia'
    ),
    (
      select
        id
      from
        public.ticket_priorities
      where
        slug = 'media'
    ),
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    '10000000-0000-4000-8000-000000000002',
    'Solicitante Local',
    '0000000000'
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    'Teste local: chamado reaberto',
    'Exemplo de chamado reaberto e devolvido para a fila.',
    (
      select
        id
      from
        public.units
      where
        code = 'ESC'
    ),
    (
      select
        id
      from
        public.ticket_categories
      where
        name = 'Internet'
    ),
    (
      select
        id
      from
        public.ticket_priorities
      where
        slug = 'alta'
    ),
    (
      select
        id
      from
        public.ticket_statuses
      where
        slug = 'aberto'
    ),
    '10000000-0000-4000-8000-000000000002',
    'Solicitante Local',
    '0000000000'
  )
on conflict (id) do nothing;

select
  set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000001',
    false
  );

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
  assigned_to = '10000000-0000-4000-8000-000000000001'
where
  id = '20000000-0000-4000-8000-000000000001'
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'aberto'
  )
  and assigned_to is null
  and not exists (
    select
      1
    from
      public.ticket_events
    where
      ticket_id = '20000000-0000-4000-8000-000000000001'
      and event_type = 'released'
  );

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
  id = '20000000-0000-4000-8000-000000000001'
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'em_andamento'
  )
  and assigned_to = '10000000-0000-4000-8000-000000000001'
  and not exists (
    select
      1
    from
      public.ticket_events
    where
      ticket_id = '20000000-0000-4000-8000-000000000001'
      and event_type = 'released'
  );

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
  assigned_to = '10000000-0000-4000-8000-000000000001'
where
  id = '20000000-0000-4000-8000-000000000002'
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'aberto'
  )
  and assigned_to is null
  and not exists (
    select
      1
    from
      public.ticket_events
    where
      ticket_id = '20000000-0000-4000-8000-000000000002'
      and event_type = 'claimed'
  );

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
  assigned_to = '10000000-0000-4000-8000-000000000001'
where
  id = '20000000-0000-4000-8000-000000000003'
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'aberto'
  )
  and assigned_to is null
  and not exists (
    select
      1
    from
      public.ticket_events
    where
      ticket_id = '20000000-0000-4000-8000-000000000003'
      and event_type = 'resolved'
  );

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
  resolution_notes = 'Solução de exemplo registrada para facilitar os testes.'
where
  id = '20000000-0000-4000-8000-000000000003'
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'em_andamento'
  )
  and assigned_to = '10000000-0000-4000-8000-000000000001'
  and resolved_at is null
  and not exists (
    select
      1
    from
      public.ticket_events
    where
      ticket_id = '20000000-0000-4000-8000-000000000003'
      and event_type = 'resolved'
  );

select
  set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000001',
    false
  );

update public.tickets as ticket
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
  ticket.id in (
    '20000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000005'
  )
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'aberto'
  )
  and not exists (
    select
      1
    from
      public.ticket_events
    where
      ticket_id = ticket.id
      and event_type = 'closed'
  )
  and not exists (
    select
      1
    from
      public.ticket_events
    where
      ticket_id = '20000000-0000-4000-8000-000000000005'
      and event_type = 'reopened'
  );

update public.tickets
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'aberto'
  )
where
  id = '20000000-0000-4000-8000-000000000005'
  and status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'fechado'
  )
  and not exists (
    select
      1
    from
      public.ticket_events
    where
      ticket_id = '20000000-0000-4000-8000-000000000005'
      and event_type = 'reopened'
  );

update public.tickets
set
  priority_id = (
    select
      id
    from
      public.ticket_priorities
    where
      slug = 'urgente'
  )
where
  id = '20000000-0000-4000-8000-000000000001'
  and priority_id = (
    select
      id
    from
      public.ticket_priorities
    where
      slug = 'media'
  )
  and not exists (
    select
      1
    from
      public.ticket_events
    where
      ticket_id = '20000000-0000-4000-8000-000000000001'
      and event_type = 'priority_changed'
  );

insert into
  public.ticket_messages (id, ticket_id, sender_id, message, is_internal)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'Mensagem pública de exemplo para testar a conversa.',
    false
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Nota interna de exemplo para testar a visibilidade da equipe.',
    true
  )
on conflict (id) do nothing;

commit;
