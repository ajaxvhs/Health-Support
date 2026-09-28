-- One-off synthetic volume fixture. Run only against the disposable local Supabase database.
begin;

do $$
begin
  if exists (
    select 1 from public.tickets where title like 'VOLUME TESTE LOCAL - Chamado %'
  ) then
    raise exception 'The local volume fixture already exists; refusing to duplicate it.';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = '10000000-0000-4000-8000-000000000001'::uuid
      and role::text = 'admin' and is_active
  ) or not exists (
    select 1 from public.profiles
    where id = '10000000-0000-4000-8000-000000000002'::uuid
      and role::text = 'solicitante' and is_active
  ) then
    raise exception 'Synthetic local fixture accounts are missing; no rows were generated.';
  end if;
  if (select count(*) from public.units where is_active) < 1
    or (select count(*) from public.ticket_categories where is_active) < 1
    or (select count(*) from public.ticket_priorities where is_active) < 4 then
    raise exception 'Required active local catalogs are missing; no rows were generated.';
  end if;
end;
$$;

alter table public.tickets disable trigger ticket_created_notification;

alter table public.tickets disable trigger ticket_status_change_notification;

alter table public.tickets disable trigger ticket_priority_change_notification;

create temporary table generated_volume_tickets (
  fixture_number integer primary key,
  ticket_id uuid not null
) on
commit
drop;

select
  set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000002',
    true
  );

with
  fixtures as (
    select
      n::integer as fixture_number,
      'VOLUME TESTE LOCAL - Chamado ' || lpad(n::text, 3, '0') as title,
      'Registro ' || lpad(n::text, 3, '0') || ' criado para validar páginas, filtros e busca no ambiente local.' as description
    from
      generate_series(1, 80) as generated (n)
  ),
  catalogs as (
    select
      array(
        select
          id
        from
          public.units
        where
          is_active
        order by
          code
      ) as unit_ids,
      array(
        select
          id
        from
          public.ticket_categories
        where
          is_active
        order by
          name
      ) as category_ids,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'urgente'
          and is_active
      ) as urgent_id,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'alta'
          and is_active
      ) as high_id,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'media'
          and is_active
      ) as medium_id,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'baixa'
          and is_active
      ) as low_id,
      (
        select
          id
        from
          public.ticket_statuses
        where
          slug = 'aberto'
          and is_active
      ) as open_id,
      (
        select
          full_name
        from
          public.profiles
        where
          id = '10000000-0000-4000-8000-000000000002'::uuid
      ) as requester_name,
      (
        select
          phone
        from
          public.profiles
        where
          id = '10000000-0000-4000-8000-000000000002'::uuid
      ) as requester_phone
  ),
  inserted as (
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
        created_at
      )
    select
      f.title,
      f.description,
      c.unit_ids[
        ((f.fixture_number - 1) % cardinality(c.unit_ids)) + 1
      ],
      c.category_ids[
        (
          (f.fixture_number - 1) % cardinality(c.category_ids)
        ) + 1
      ],
      case (f.fixture_number - 1) % 4
        when 0 then c.urgent_id
        when 1 then c.high_id
        when 2 then c.medium_id
        else c.low_id
      end,
      c.open_id,
      '10000000-0000-4000-8000-000000000002'::uuid,
      c.requester_name,
      c.requester_phone,
      now() - make_interval(days => (f.fixture_number - 1) % 45)
    from
      fixtures f
      cross join catalogs c
    returning
      id,
      title
  )
insert into
  generated_volume_tickets (fixture_number, ticket_id)
select
  substring(
    title
    from
      '([0-9]{3})$'
  )::integer,
  id
from
  inserted;

select
  set_config(
    'request.jwt.claim.sub',
    '10000000-0000-4000-8000-000000000001',
    true
  );

update public.tickets t
set
  priority_id = case current_priority.slug
    when 'urgente' then next_priority.high_id
    when 'alta' then next_priority.medium_id
    when 'media' then next_priority.low_id
    else next_priority.urgent_id
  end
from
  generated_volume_tickets fixture
  join public.ticket_priorities current_priority on true
  cross join lateral (
    select
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'urgente'
      ) as urgent_id,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'alta'
      ) as high_id,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'media'
      ) as medium_id,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'baixa'
      ) as low_id
  ) next_priority
where
  t.id = fixture.ticket_id
  and current_priority.id = t.priority_id;

update public.tickets t
set
  priority_id = case current_priority.slug
    when 'urgente' then next_priority.high_id
    when 'alta' then next_priority.medium_id
    when 'media' then next_priority.low_id
    else next_priority.urgent_id
  end
from
  generated_volume_tickets fixture
  join public.ticket_priorities current_priority on true
  cross join lateral (
    select
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'urgente'
      ) as urgent_id,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'alta'
      ) as high_id,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'media'
      ) as medium_id,
      (
        select
          id
        from
          public.ticket_priorities
        where
          slug = 'baixa'
      ) as low_id
  ) next_priority
where
  t.id = fixture.ticket_id
  and current_priority.id = t.priority_id;

update public.tickets t
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'em_andamento'
  ),
  assigned_to = '10000000-0000-4000-8000-000000000001'::uuid
from
  generated_volume_tickets fixture
where
  t.id = fixture.ticket_id
  and fixture.fixture_number <= 60;

update public.tickets t
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'resolvido'
  ),
  resolution_notes = 'Solução sintética registrada para teste local.'
from
  generated_volume_tickets fixture
where
  t.id = fixture.ticket_id
  and fixture.fixture_number between 9 and 20;

update public.tickets t
set
  status_id = (
    select
      id
    from
      public.ticket_statuses
    where
      slug = 'fechado'
  )
from
  generated_volume_tickets fixture
where
  t.id = fixture.ticket_id
  and fixture.fixture_number between 1 and 8;

alter table public.tickets enable trigger ticket_created_notification;

alter table public.tickets enable trigger ticket_status_change_notification;

alter table public.tickets enable trigger ticket_priority_change_notification;

do $$
declare
  generated_tickets integer;
  generated_events integer;
begin
  select count(*) into generated_tickets from generated_volume_tickets;
  select count(*) into generated_events
  from public.ticket_events e
  join generated_volume_tickets fixture on fixture.ticket_id = e.ticket_id;
  if generated_tickets <> 80 or generated_events < 300 then
    raise exception 'Fixture validation failed: tickets %, events %', generated_tickets, generated_events;
  end if;
end;
$$;

commit;
