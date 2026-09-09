create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_priorities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text unique not null,
  level integer unique not null,
  color text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_statuses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text unique not null,
  is_terminal boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  create type public.app_role as enum ('admin', 'atendente', 'solicitante');
exception
  when duplicate_object then null;
end $$;

create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  full_name text not null,
  phone text not null,
  role public.app_role not null default 'solicitante',
  default_unit_id uuid not null references units (id),
  is_active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_idx on profiles (lower(username));

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_number bigint generated always as identity unique,
  title text not null check (char_length(title) between 5 and 180),
  description text not null check (char_length(description) between 10 and 5000),
  unit_id uuid not null references units (id),
  category_id uuid not null references ticket_categories (id),
  priority_id uuid not null references ticket_priorities (id),
  status_id uuid not null references ticket_statuses (id),
  created_by uuid not null references profiles (id),
  assigned_to uuid references profiles (id),
  requester_name_snapshot text not null,
  requester_phone_snapshot text not null,
  resolution_notes text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets (id) on delete cascade,
  sender_id uuid not null references profiles (id),
  message text not null check (char_length(message) between 1 and 5000),
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references tickets (id) on delete cascade,
  actor_id uuid references profiles (id),
  event_type text not null,
  from_status_id uuid references ticket_statuses (id),
  to_status_id uuid references ticket_statuses (id),
  from_assigned_to uuid references profiles (id),
  to_assigned_to uuid references profiles (id),
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  ticket_id uuid references tickets (id) on delete cascade,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on notifications (user_id, created_at desc);

insert into
  units (id, name, code)
values
  (gen_random_uuid(), 'ESF Silvio Camargo', 'ESC'),
  (gen_random_uuid(), 'ESF Antonieta', 'EAN'),
  (gen_random_uuid(), 'ESF Centro de Saúde', 'ECS'),
  (gen_random_uuid(), 'ESF Caic', 'ECA'),
  (gen_random_uuid(), 'Pronto Atendimento', 'PA'),
  (gen_random_uuid(), 'Vigilância Sanitária', 'VS'),
  (
    gen_random_uuid(),
    'Centro de Atenção Psicossocial',
    'CAPS'
  ),
  (gen_random_uuid(), 'ESF São Marcos', 'ESM'),
  (gen_random_uuid(), 'EMAD', 'EMAD'),
  (gen_random_uuid(), 'Regulação', 'REG'),
  (gen_random_uuid(), 'Farmácia Central', 'FC'),
  (
    gen_random_uuid(),
    'Centro de Especialidades',
    'CE'
  ),
  (gen_random_uuid(), 'Odonto Central', 'OC'),
  (gen_random_uuid(), 'Fisioterapia', 'FIS')
on conflict (code) do nothing;

insert into
  ticket_categories (id, name, description)
values
  (
    gen_random_uuid(),
    'Telefonia',
    'Ramais, aparelhos e linhas'
  ),
  (
    gen_random_uuid(),
    'Internet',
    'Conectividade e rede'
  ),
  (
    gen_random_uuid(),
    'Computadores',
    'Computadores e periféricos'
  )
on conflict (name) do nothing;

insert into
  ticket_priorities (id, slug, name, level, color)
values
  (gen_random_uuid(), 'baixa', 'Baixa', 1, '#94a3b8'),
  (gen_random_uuid(), 'media', 'Média', 2, '#3b82f6'),
  (gen_random_uuid(), 'alta', 'Alta', 3, '#f97316'),
  (
    gen_random_uuid(),
    'urgente',
    'Urgente',
    4,
    '#ef4444'
  )
on conflict (slug) do nothing;

insert into
  ticket_statuses (id, slug, name, is_terminal)
values
  (gen_random_uuid(), 'aberto', 'Aberto', false),
  (
    gen_random_uuid(),
    'em_andamento',
    'Em andamento',
    false
  ),
  (
    gen_random_uuid(),
    'resolvido',
    'Resolvido',
    false
  ),
  (gen_random_uuid(), 'fechado', 'Fechado', true)
on conflict (slug) do nothing;

create index if not exists tickets_status_priority_idx on tickets (status_id, priority_id);

create index if not exists tickets_assigned_status_idx on tickets (assigned_to, status_id);

create index if not exists tickets_created_by_idx on tickets (created_by, created_at desc);

create index if not exists tickets_unit_idx on tickets (unit_id, created_at desc);

create index if not exists messages_ticket_idx on ticket_messages (ticket_id, created_at);

create index if not exists events_ticket_idx on ticket_events (ticket_id, created_at);

alter table profiles enable row level security;

alter table units enable row level security;

alter table ticket_categories enable row level security;

alter table ticket_priorities enable row level security;

alter table ticket_statuses enable row level security;

alter table tickets enable row level security;

alter table ticket_messages enable row level security;

alter table ticket_events enable row level security;

alter table notifications enable row level security;

create or replace function is_staff () returns boolean language sql stable security definer
set
  search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active and role::text in ('admin', 'atendente'));
$$;

create or replace function is_admin () returns boolean language sql stable security definer
set
  search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active and role::text = 'admin');
$$;

create or replace function is_active_user () returns boolean language sql stable security definer
set
  search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active);
$$;

create or replace function mark_password_changed () returns void language plpgsql security definer
set
  search_path = public as $$
begin
  update profiles
  set must_change_password = false
  where id = auth.uid();
end;
$$;

revoke all on function mark_password_changed ()
from
  public;

grant
execute on function mark_password_changed () to authenticated;

-- Supabase Auth still authenticates with an e-mail internally. The app only
-- exposes username and resolves it through this restricted function first.
create or replace function auth_email_for_username (login_username text) returns text language sql stable security definer
set
  search_path = public as $$
  select users.email from auth.users users
  join profiles on profiles.id = users.id
  where lower(profiles.username) = lower(trim(login_username)) and profiles.is_active
  limit 1;
$$;

revoke all on function auth_email_for_username (text)
from
  public;

grant
execute on function auth_email_for_username (text) to anon,
authenticated;

create policy active_catalog_read on units for
select
  to authenticated using (
    is_active
    or is_admin ()
  );

create policy active_category_read on ticket_categories for
select
  to authenticated using (
    is_active
    or is_admin ()
  );

create policy active_priority_read on ticket_priorities for
select
  to authenticated using (
    is_active
    or is_admin ()
  );

create policy active_status_read on ticket_statuses for
select
  to authenticated using (
    is_active
    or is_admin ()
  );

create policy units_admin_insert on units for insert to authenticated
with
  check (is_admin ());

create policy units_admin_update on units
for update
  to authenticated using (is_admin ())
with
  check (is_admin ());

create policy units_admin_delete on units for delete to authenticated using (is_admin ());

create policy categories_admin_insert on ticket_categories for insert to authenticated
with
  check (is_admin ());

create policy categories_admin_update on ticket_categories
for update
  to authenticated using (is_admin ())
with
  check (is_admin ());

create policy categories_admin_delete on ticket_categories for delete to authenticated using (is_admin ());

create policy priorities_admin_insert on ticket_priorities for insert to authenticated
with
  check (is_admin ());

create policy priorities_admin_update on ticket_priorities
for update
  to authenticated using (is_admin ())
with
  check (is_admin ());

create policy priorities_admin_delete on ticket_priorities for delete to authenticated using (is_admin ());

create policy statuses_admin_insert on ticket_statuses for insert to authenticated
with
  check (is_admin ());

create policy statuses_admin_update on ticket_statuses
for update
  to authenticated using (is_admin ())
with
  check (is_admin ());

create policy statuses_admin_delete on ticket_statuses for delete to authenticated using (is_admin ());

create policy profile_read on profiles for
select
  to authenticated using (
    id = auth.uid ()
    or is_staff ()
  );

create policy profile_admin_insert on profiles for insert to authenticated
with
  check (is_admin ());

create policy profile_admin_update on profiles
for update
  to authenticated using (is_admin ())
with
  check (is_admin ());

create policy profile_admin_delete on profiles for delete to authenticated using (is_admin ());

create policy ticket_read on tickets for
select
  to authenticated using (
    created_by = auth.uid ()
    or is_staff ()
  );

create policy ticket_requester_insert on tickets for insert to authenticated
with
  check (
    created_by = auth.uid ()
    and is_active_user ()
  );

create policy ticket_staff_update on tickets
for update
  to authenticated using (
    (
      is_staff ()
      and (
        is_admin ()
        or assigned_to = auth.uid ()
        or assigned_to is null
      )
    )
    or created_by = auth.uid ()
  )
with
  check (
    (
      is_staff ()
      and (
        is_admin ()
        or assigned_to = auth.uid ()
      )
    )
    or created_by = auth.uid ()
  );

create policy message_read on ticket_messages for
select
  to authenticated using (
    is_staff ()
    or (
      not is_internal
      and exists (
        select
          1
        from
          tickets
        where
          tickets.id = ticket_messages.ticket_id
          and tickets.created_by = auth.uid ()
      )
    )
  );

create policy message_insert on ticket_messages for insert to authenticated
with
  check (
    sender_id = auth.uid ()
    and is_active_user ()
    and (
      (
        not is_internal
        and exists (
          select
            1
          from
            tickets
            join ticket_statuses on ticket_statuses.id = tickets.status_id
          where
            tickets.id = ticket_messages.ticket_id
            and (
              is_staff ()
              or (
                tickets.created_by = auth.uid ()
                and ticket_statuses.slug <> 'fechado'
              )
            )
        )
      )
      or (
        is_internal
        and is_staff ()
      )
    )
  );

create policy event_read on ticket_events for
select
  to authenticated using (
    is_admin ()
    or exists (
      select
        1
      from
        tickets
      where
        tickets.id = ticket_events.ticket_id
        and (
          tickets.created_by = auth.uid ()
          or is_staff ()
        )
    )
  );

create policy notifications_owner_read on notifications for
select
  to authenticated using (user_id = auth.uid ());

create policy notifications_owner_update on notifications
for update
  to authenticated using (user_id = auth.uid ())
with
  check (user_id = auth.uid ());

create policy notifications_owner_delete on notifications for delete to authenticated using (user_id = auth.uid ());

create or replace function append_ticket_event (
  event_ticket_id uuid,
  event_type text,
  event_detail text
) returns void language plpgsql security definer
set
  search_path = public as $$
begin
  if not is_staff() then raise exception 'Acesso restrito a equipe.'; end if;
  insert into ticket_events (ticket_id, actor_id, event_type, metadata)
  values (event_ticket_id, auth.uid(), event_type, jsonb_build_object('detail', event_detail));
end;
$$;

revoke all on function append_ticket_event (uuid, text, text)
from
  public;

grant
execute on function append_ticket_event (uuid, text, text) to authenticated;

create or replace function audit_ticket_change () returns trigger language plpgsql security definer
set
  search_path = public as $$
begin
  insert into ticket_events (ticket_id, actor_id, event_type, metadata)
  values (new.id, auth.uid(), case when tg_op = 'INSERT' then 'created' else 'updated' end,
    jsonb_build_object('detail', case when tg_op = 'INSERT' then 'Chamado aberto' else 'Chamado atualizado' end));
  return new;
end;
$$;

drop trigger if exists tickets_audit on tickets;

create trigger tickets_audit
after insert or update on tickets for each row
execute function audit_ticket_change ();

create or replace function audit_catalog_change () returns trigger language plpgsql security definer
set
  search_path = public as $$
declare
  item_name text;
  event_type text;
  event_detail text;
begin
  item_name := coalesce(to_jsonb(new)->>'name', to_jsonb(old)->>'name');
  if tg_op = 'INSERT' then
    event_type := 'catalog_created';
    event_detail := format('Item de catálogo "%s" criado', item_name);
  elsif tg_op = 'DELETE' then
    event_type := 'catalog_deleted';
    event_detail := format('Item de catálogo "%s" excluído', item_name);
  elsif (to_jsonb(new)->>'is_active') is distinct from (to_jsonb(old)->>'is_active') then
    event_type := case when (to_jsonb(new)->>'is_active')::boolean
      then 'catalog_activated' else 'catalog_deactivated' end;
    event_detail := format(
      'Item de catálogo "%s" %s',
      item_name,
      case when (to_jsonb(new)->>'is_active')::boolean then 'ativado' else 'desativado' end
    );
  else
    event_type := 'catalog_renamed';
    event_detail := format('Item de catálogo "%s" atualizado', item_name);
  end if;

  insert into ticket_events (ticket_id, actor_id, event_type, metadata)
  values (
    null,
    auth.uid(),
    event_type,
    jsonb_build_object('detail', event_detail, 'catalog', tg_table_name, 'item', item_name)
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists units_audit on units;

create trigger units_audit
after insert or update or delete on units for each row
execute function audit_catalog_change ();

drop trigger if exists categories_audit on ticket_categories;

create trigger categories_audit
after insert or update or delete on ticket_categories for each row
execute function audit_catalog_change ();

drop trigger if exists priorities_audit on ticket_priorities;

create trigger priorities_audit
after insert or update or delete on ticket_priorities for each row
execute function audit_catalog_change ();

drop trigger if exists statuses_audit on ticket_statuses;

create trigger statuses_audit
after insert or update or delete on ticket_statuses for each row
execute function audit_catalog_change ();

create or replace function notify_ticket_message () returns trigger language plpgsql security definer
set
  search_path = public as $$
declare recipient uuid;
begin
  for recipient in select distinct p.id from profiles p join tickets t on t.id = new.ticket_id
    where p.is_active and p.id <> new.sender_id and (p.id = t.created_by or p.id = t.assigned_to or (t.assigned_to is null and p.role::text <> 'solicitante'))
    and (not new.is_internal or p.role::text <> 'solicitante') loop
    insert into notifications (user_id, ticket_id, title, message)
    values (recipient, new.ticket_id, case when new.is_internal then 'Nova nota interna' else 'Nova resposta no chamado' end, 'Há uma nova atualização no chamado.');
  end loop;
  return new;
end;
$$;

drop trigger if exists ticket_messages_notification on ticket_messages;

create trigger ticket_messages_notification
after insert on ticket_messages for each row
execute function notify_ticket_message ();

-- Mutations belong in authenticated server actions/RPCs, preserving an append-only audit trail.
comment on table ticket_events is 'Append-only audit history. Insert through controlled RPC or trigger only.';

create or replace function set_updated_at () returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['units', 'ticket_categories', 'ticket_priorities', 'ticket_statuses', 'profiles', 'tickets'] loop
    if not exists (
      select 1 from pg_trigger where tgname = table_name || '_updated_at'
    ) then
      execute format(
        'create trigger %I before update on %I for each row execute function set_updated_at()',
        table_name || '_updated_at', table_name
      );
    end if;
  end loop;
end;
$$;

create or replace function prevent_ticket_event_mutation () returns trigger language plpgsql as $$
begin
  raise exception 'ticket_events is append-only';
end;
$$;

create or replace function enforce_ticket_update () returns trigger language plpgsql security definer
set
  search_path = public as $$
declare
  old_status text;
  new_status text;
begin
  select slug into old_status from ticket_statuses where id = old.status_id;
  select slug into new_status from ticket_statuses where id = new.status_id;

  if new.id is distinct from old.id
    or new.ticket_number is distinct from old.ticket_number
    or new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.unit_id is distinct from old.unit_id
    or new.category_id is distinct from old.category_id
    or new.created_by is distinct from old.created_by
    or new.requester_name_snapshot is distinct from old.requester_name_snapshot
    or new.requester_phone_snapshot is distinct from old.requester_phone_snapshot
    or new.created_at is distinct from old.created_at then
    raise exception 'Campos imutáveis do chamado não podem ser alterados.';
  end if;

  if not is_staff () then
    if old.created_by <> auth.uid ()
      or old_status <> 'resolvido'
      or new_status not in ('fechado', 'em_andamento')
      or new.assigned_to is distinct from old.assigned_to
      or new.priority_id is distinct from old.priority_id
      or new.resolved_at is distinct from old.resolved_at
      or (
        new_status = 'fechado'
        and new.resolution_notes is distinct from old.resolution_notes
      )
      or (
        new_status = 'em_andamento'
        and new.closed_at is distinct from old.closed_at
      ) then
      raise exception 'Esta transição não está disponível.';
    end if;
  elsif not is_admin () then
    if old.assigned_to is null then
      if new.assigned_to is distinct from auth.uid ()
        or old_status <> 'aberto'
        or new_status <> 'em_andamento'
        or new.priority_id is distinct from old.priority_id
        or new.resolution_notes is distinct from old.resolution_notes
        or new.resolved_at is distinct from old.resolved_at
        or new.closed_at is distinct from old.closed_at then
        raise exception 'Assuma o chamado antes de atualizá-lo.';
      end if;
    elsif old.assigned_to <> auth.uid () or new.assigned_to is distinct from old.assigned_to then
      raise exception 'Assuma o chamado antes de atualizá-lo.';
    elsif new_status is distinct from old_status
      and not (
        (old_status = 'aberto' and new_status = 'em_andamento')
        or (old_status = 'em_andamento' and new_status = 'resolvido')
        or (old_status = 'resolvido' and new_status in ('fechado', 'em_andamento'))
      ) then
      raise exception 'Esta transição não está disponível.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists tickets_enforce_update on tickets;

create trigger tickets_enforce_update
before update on tickets for each row
execute function enforce_ticket_update ();

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'ticket_events_no_update') then
    create trigger ticket_events_no_update before update on ticket_events
      for each row execute function prevent_ticket_event_mutation();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'ticket_events_no_delete') then
    create trigger ticket_events_no_delete before delete on ticket_events
      for each row execute function prevent_ticket_event_mutation();
  end if;
end;
$$;
