-- Remove the obsolete attendant role and all of its ticket-owned fixtures/data.
-- Ticketless audit records keep their history but no longer identify a deleted profile.
do $$
declare
  removed_user_ids uuid[];
begin
  select array_agg(p.id)
  into removed_user_ids
  from public.profiles p
  where p.role::text = 'atendente';

  if array_length(removed_user_ids, 1) is not null then
    execute 'alter table public.ticket_events disable trigger ticket_events_no_update';
    execute 'alter table public.ticket_events disable trigger ticket_events_no_delete';

    delete from public.tickets t
    where t.created_by = any (removed_user_ids)
      or t.assigned_to = any (removed_user_ids)
      or exists (
        select 1 from public.ticket_messages m
        where m.ticket_id = t.id and m.sender_id = any (removed_user_ids)
      )
      or exists (
        select 1 from public.ticket_events e
        where e.ticket_id = t.id and e.actor_id = any (removed_user_ids)
      );

    update public.ticket_events e
    set actor_id = null
    where e.ticket_id is null and e.actor_id = any (removed_user_ids);

    execute 'alter table public.ticket_events enable trigger ticket_events_no_update';
    execute 'alter table public.ticket_events enable trigger ticket_events_no_delete';

    delete from auth.sessions s where s.user_id = any (removed_user_ids);
    delete from auth.users u where u.id = any (removed_user_ids);
  end if;
end;
$$;

alter table public.profiles
alter column role
drop default;

create type public.app_role_without_attendant as enum('admin', 'solicitante');

alter table public.profiles
alter column role type public.app_role_without_attendant using role::text::public.app_role_without_attendant;

alter table public.profiles
alter column role
set default 'solicitante'::public.app_role_without_attendant;

drop type public.app_role;

alter type public.app_role_without_attendant
rename to app_role;

create or replace function public.is_staff () returns boolean language sql stable security definer
set
  search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active
      and p.role::text = 'admin'
  );
$$;

revoke all on function public.is_staff ()
from
  public,
  anon;

grant
execute on function public.is_staff () to authenticated;

create or replace function public.enforce_ticket_lifecycle () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  old_status text;
  new_status text;
  assignee_is_eligible boolean;
begin
  if actor_id is not null then
    select p.role::text
    into actor_role
    from public.profiles p
    where p.id = actor_id and p.is_active;
    if actor_role is null then
      raise exception using errcode = '42501', message = 'Conta inativa ou sessão inválida.';
    end if;
  end if;

  select s.slug
  into new_status
  from public.ticket_statuses s
  where s.id = new.status_id and s.is_active;
  if new_status is null then
    raise exception using errcode = '23514', message = 'O status selecionado não está disponível.';
  end if;

  if tg_op = 'INSERT' then
    if new_status <> 'aberto' or new.assigned_to is not null then
      raise exception using errcode = '23514', message = 'Um chamado novo deve iniciar aberto e sem responsável.';
    end if;
    if actor_id is not null and (actor_role <> 'solicitante' or new.created_by <> actor_id) then
      raise exception using errcode = '42501', message = 'Somente o próprio solicitante pode abrir um chamado.';
    end if;
    if not exists (select 1 from public.profiles p where p.id = new.created_by and p.is_active)
      or not exists (select 1 from public.units u where u.id = new.unit_id and u.is_active)
      or not exists (select 1 from public.ticket_categories c where c.id = new.category_id and c.is_active)
      or not exists (select 1 from public.ticket_priorities p where p.id = new.priority_id and p.is_active) then
      raise exception using errcode = '23514', message = 'Solicitante ou catálogo indisponível.';
    end if;
    select p.full_name, p.phone
    into new.requester_name_snapshot, new.requester_phone_snapshot
    from public.profiles p
    where p.id = new.created_by and p.is_active;
    new.resolution_notes := null;
    new.resolved_at := null;
    new.closed_at := null;
    return new;
  end if;

  select s.slug
  into old_status
  from public.ticket_statuses s
  where s.id = old.status_id;

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
    raise exception using errcode = '23514', message = 'Campos imutáveis do chamado não podem ser alterados.';
  end if;

  if (new.unit_id is distinct from old.unit_id and not exists (
        select 1 from public.units u where u.id = new.unit_id and u.is_active
      ))
    or (new.category_id is distinct from old.category_id and not exists (
        select 1 from public.ticket_categories c where c.id = new.category_id and c.is_active
      ))
    or (new.priority_id is distinct from old.priority_id and not exists (
        select 1 from public.ticket_priorities p where p.id = new.priority_id and p.is_active
      )) then
    raise exception using errcode = '23514', message = 'Não é possível atribuir um catálogo inativo ao chamado.';
  end if;

  if new.assigned_to is not null then
    select p.is_active and p.role::text = 'admin'
    into assignee_is_eligible
    from public.profiles p
    where p.id = new.assigned_to;
    if coalesce(assignee_is_eligible, false) is false then
      raise exception using errcode = '23514', message = 'O responsável deve ser um administrador ativo.';
    end if;
  end if;

  if new_status = old_status then
    if (new.assigned_to is distinct from old.assigned_to and not (
          coalesce(actor_role = 'admin', false)
          and old_status = 'em_andamento'
          and new.assigned_to is not null
        ))
      or new.resolution_notes is distinct from old.resolution_notes
      or new.resolved_at is distinct from old.resolved_at
      or new.closed_at is distinct from old.closed_at then
      raise exception using errcode = '23514', message = 'Atribuição e solução exigem uma transição válida de status.';
    end if;
    if actor_role = 'solicitante' and (
      new.priority_id is distinct from old.priority_id
      or new.unit_id is distinct from old.unit_id
      or new.category_id is distinct from old.category_id
    ) then
      raise exception using errcode = '42501', message = 'Solicitantes não podem editar os detalhes do chamado.';
    end if;
    if old_status in ('resolvido', 'fechado') and (
      new.priority_id is distinct from old.priority_id
      or new.unit_id is distinct from old.unit_id
      or new.category_id is distinct from old.category_id
    ) and actor_role <> 'admin' then
      raise exception using errcode = '42501', message = 'Somente um administrador pode editar os detalhes de um chamado encerrado.';
    end if;
    new.resolved_at := old.resolved_at;
    new.closed_at := old.closed_at;
    return new;
  end if;

  if old_status = 'aberto' and new_status = 'em_andamento' then
    if old.assigned_to is not null or new.assigned_to is null then
      raise exception using errcode = '23514', message = 'Assumir um chamado exige atribuir um administrador ativo.';
    end if;
    if actor_id is not null and actor_role <> 'admin' then
      raise exception using errcode = '42501', message = 'Somente administradores podem assumir chamados.';
    end if;
    new.resolution_notes := null;
    new.resolved_at := null;
    new.closed_at := null;
  elsif old_status = 'em_andamento' and new_status = 'aberto' then
    if old.assigned_to is null or new.assigned_to is not null then
      raise exception using errcode = '23514', message = 'Liberar um chamado deve removê-lo da atribuição e devolvê-lo à fila aberta.';
    end if;
    if actor_id is not null and actor_role <> 'admin' then
      raise exception using errcode = '42501', message = 'Somente administradores podem liberar o chamado.';
    end if;
    new.resolution_notes := null;
    new.resolved_at := null;
    new.closed_at := null;
  elsif old_status = 'em_andamento' and new_status = 'resolvido' then
    if old.assigned_to is null or new.assigned_to is distinct from old.assigned_to then
      raise exception using errcode = '23514', message = 'O chamado deve permanecer com o responsável ao ser resolvido.';
    end if;
    if new.resolution_notes is null or pg_catalog.btrim(new.resolution_notes) = '' then
      raise exception using errcode = '22023', message = 'Informe a solução antes de resolver o chamado.';
    end if;
    if actor_id is not null and actor_role <> 'admin' then
      raise exception using errcode = '42501', message = 'Somente administradores podem resolver chamados.';
    end if;
    new.resolved_at := pg_catalog.now();
    new.closed_at := null;
  elsif new_status = 'fechado' and old_status in ('aberto', 'em_andamento') then
    if new.assigned_to is distinct from old.assigned_to then
      raise exception using errcode = '23514', message = 'O fechamento sem resolução deve preservar a atribuição atual.';
    end if;
    if actor_id is not null and actor_role <> 'admin' then
      raise exception using errcode = '42501', message = 'Somente administradores podem fechar sem resolução.';
    end if;
    new.resolution_notes := null;
    new.resolved_at := null;
    new.closed_at := pg_catalog.now();
  elsif old_status in ('resolvido', 'fechado') and new_status = 'aberto' then
    if new.assigned_to is not null then
      raise exception using errcode = '23514', message = 'A reabertura deve devolver o chamado à fila sem responsável.';
    end if;
    if actor_id is not null and actor_role <> 'admin' then
      raise exception using errcode = '42501', message = 'Somente administradores podem reabrir chamados.';
    end if;
    new.resolution_notes := null;
    new.resolved_at := null;
    new.closed_at := null;
  else
    raise exception using errcode = '23514', message = 'Transição de status não permitida.';
  end if;

  return new;
end;
$$;

create or replace function public.notify_new_ticket () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  insert into public.notifications (user_id, ticket_id, title, message)
  select
    p.id,
    new.id,
    'Novo chamado aberto',
    format('%s abriu o chamado #%s e aguarda atendimento.',
      coalesce(new.requester_name_snapshot, 'Um usuário'), new.ticket_number)
  from public.profiles p
  where p.is_active
    and p.role::text = 'admin'
    and p.id <> new.created_by;
  return new;
end;
$$;

revoke all on function public.notify_new_ticket ()
from
  public,
  anon,
  authenticated;

create or replace function public.notify_ticket_status_change () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  old_status text;
  new_status text;
  action_type text;
  notification_title text;
  notification_message text;
  recipient uuid;
begin
  if new.status_id is not distinct from old.status_id then
    return new;
  end if;

  select s.slug into old_status
  from public.ticket_statuses s where s.id = old.status_id;
  select s.slug into new_status
  from public.ticket_statuses s where s.id = new.status_id;

  action_type := case
    when old_status in ('resolvido', 'fechado') and new_status = 'aberto' then 'reopened'
    when old_status = 'em_andamento' and new_status = 'aberto'
      and old.assigned_to is not null and new.assigned_to is null then 'released'
    when old_status = 'aberto' and new_status = 'em_andamento'
      and old.assigned_to is null and new.assigned_to = auth.uid() then 'claimed'
    when old_status = 'aberto' and new_status = 'em_andamento' then 'assigned'
    when new_status = 'resolvido' then 'resolved'
    when new_status = 'fechado' then 'closed'
    else 'status_changed'
  end;

  notification_title := case action_type
    when 'reopened' then 'Chamado reaberto'
    when 'released' then 'Chamado liberado para a fila'
    when 'claimed' then 'Chamado assumido'
    when 'assigned' then 'Chamado atribuído'
    when 'resolved' then 'Chamado resolvido'
    when 'closed' then 'Chamado encerrado'
    else 'Status do chamado atualizado'
  end;
  notification_message := case action_type
    when 'reopened' then format('O chamado #%s foi reaberto e voltou para a fila.', new.ticket_number)
    when 'released' then format('O chamado #%s foi liberado para a fila.', new.ticket_number)
    when 'claimed' then format('O chamado #%s foi assumido e está em atendimento.', new.ticket_number)
    when 'assigned' then format('O chamado #%s foi atribuído para atendimento.', new.ticket_number)
    when 'resolved' then format('O chamado #%s foi resolvido.', new.ticket_number)
    when 'closed' then format('O chamado #%s foi encerrado.', new.ticket_number)
    else format('O status do chamado #%s foi atualizado.', new.ticket_number)
  end;

  for recipient in
    select distinct p.id
    from public.profiles p
    where p.is_active
      and (auth.uid() is null or p.id <> auth.uid())
      and (
        p.id = new.assigned_to
        or (
          p.id = new.created_by
          and (new_status in ('em_andamento', 'resolvido', 'fechado') or action_type = 'reopened')
        )
        or (action_type in ('reopened', 'released') and p.role::text = 'admin')
      )
  loop
    insert into public.notifications (user_id, ticket_id, title, message)
    values (recipient, new.id, notification_title, notification_message);
  end loop;
  return new;
end;
$$;

revoke all on function public.notify_ticket_status_change ()
from
  public,
  anon,
  authenticated;

create or replace function public.notify_ticket_priority_change () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  old_priority text;
  new_priority text;
  recipient uuid;
begin
  if new.priority_id is not distinct from old.priority_id then
    return new;
  end if;

  select p.name into old_priority
  from public.ticket_priorities p where p.id = old.priority_id;
  select p.name into new_priority
  from public.ticket_priorities p where p.id = new.priority_id;

  for recipient in
    select distinct p.id
    from public.profiles p
    where p.is_active
      and (auth.uid() is null or p.id <> auth.uid())
      and (p.id = new.assigned_to or p.id = new.created_by)
  loop
    insert into public.notifications (user_id, ticket_id, title, message)
    values (
      recipient,
      new.id,
      'Prioridade do chamado alterada',
      format('A prioridade do chamado #%s mudou de %s para %s.',
        new.ticket_number, coalesce(old_priority, 'indisponível'), coalesce(new_priority, 'indisponível'))
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.notify_ticket_priority_change ()
from
  public,
  anon,
  authenticated;

drop trigger if exists ticket_priority_change_notification on public.tickets;

create trigger ticket_priority_change_notification
after update of priority_id on public.tickets for each row
execute function public.notify_ticket_priority_change ();

create or replace function public.notify_ticket_message () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  actor_name text;
  ticket_number bigint;
  ticket_creator uuid;
  ticket_assignee uuid;
  recipient uuid;
  notification_title text;
  notification_message text;
begin
  select p.full_name, t.ticket_number, t.created_by, t.assigned_to
  into actor_name, ticket_number, ticket_creator, ticket_assignee
  from public.profiles p
  join public.tickets t on t.id = new.ticket_id
  where p.id = new.sender_id;
  actor_name := coalesce(actor_name, 'Um usuário');

  notification_title := case
    when new.is_internal then format('Nova nota interna no chamado #%s', ticket_number)
    when new.sender_id = ticket_creator then format('Nova resposta da equipe no chamado #%s', ticket_number)
    else format('%s respondeu no chamado #%s', actor_name, ticket_number)
  end;
  notification_message := case
    when new.is_internal then format('%s adicionou uma nota interna ao chamado #%s.', actor_name, ticket_number)
    when new.sender_id = ticket_creator then format('A equipe respondeu ao chamado #%s.', ticket_number)
    else format('Há uma nova resposta de %s no chamado #%s.', actor_name, ticket_number)
  end;

  for recipient in
    select distinct p.id
    from public.profiles p
    where p.is_active
      and p.id <> new.sender_id
      and (
        (new.is_internal and p.role::text = 'admin')
        or (
          not new.is_internal
          and new.sender_id = ticket_creator
          and (
            p.id = ticket_assignee
            or (ticket_assignee is null and p.role::text = 'admin')
          )
        )
        or (not new.is_internal and new.sender_id <> ticket_creator and p.id = ticket_creator)
      )
  loop
    insert into public.notifications (user_id, ticket_id, title, message)
    values (recipient, new.ticket_id, notification_title, notification_message);
  end loop;
  return new;
end;
$$;

revoke all on function public.notify_ticket_message ()
from
  public,
  anon,
  authenticated;

create or replace function public.claim_push_jobs () returns table (
  job_id uuid,
  subscription_id uuid,
  ticket_id uuid,
  notification_title text,
  notification_message text,
  endpoint text,
  p256dh text,
  auth text
) language sql security definer
set
  search_path = '' as $$
  with candidates as (
    select q.id
    from public.push_queue q
    join public.notifications n on n.id = q.notification_id
    join public.push_subscriptions s on s.id = q.subscription_id and s.user_id = n.user_id
    join public.profiles p on p.id = s.user_id
    join public.tickets t on t.id = n.ticket_id
    where q.available_at <= now()
      and q.attempts < 5
      and p.is_active
      and not p.must_change_password
      and (p.role::text = 'admin' or t.created_by = p.id)
      and (n.title not like 'Nova nota interna%' or p.role::text = 'admin')
      and n.created_at > now() - interval '1 day'
    order by q.available_at
    limit 10
    for update of q skip locked
  ), claimed as (
    update public.push_queue q
    set attempts = q.attempts + 1,
        available_at = now() + interval '5 minutes'
    from candidates c
    where q.id = c.id
    returning q.id, q.subscription_id, q.notification_id
  )
  select c.id, s.id, n.ticket_id, n.title, n.message, s.endpoint, s.p256dh, s.auth
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.push_subscriptions s on s.id = c.subscription_id;
$$;

revoke all on function public.claim_push_jobs ()
from
  public,
  anon,
  authenticated;

grant
execute on function public.claim_push_jobs () to service_role;

create or replace function public.set_updated_at () returns trigger language plpgsql
set
  search_path = '' as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_updated_at ()
from
  public,
  anon,
  authenticated;

create or replace function public.prevent_ticket_event_mutation () returns trigger language plpgsql
set
  search_path = '' as $$
begin
  raise exception 'ticket_events is append-only';
end;
$$;

revoke all on function public.prevent_ticket_event_mutation ()
from
  public,
  anon,
  authenticated;

create or replace function public.notify_ticket_status_change () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  old_status text;
  new_status text;
  action_type text;
  notification_title text;
  notification_message text;
  recipient uuid;
begin
  if new.status_id is not distinct from old.status_id then
    return new;
  end if;

  select s.slug into old_status
  from public.ticket_statuses s where s.id = old.status_id;
  select s.slug into new_status
  from public.ticket_statuses s where s.id = new.status_id;

  action_type := case
    when old_status in ('resolvido', 'fechado') and new_status = 'aberto' then 'reopened'
    when old_status = 'em_andamento' and new_status = 'aberto'
      and old.assigned_to is not null and new.assigned_to is null then 'released'
    when old_status = 'aberto' and new_status = 'em_andamento'
      and old.assigned_to is null and new.assigned_to = auth.uid() then 'claimed'
    when old_status = 'aberto' and new_status = 'em_andamento' then 'assigned'
    when new_status = 'resolvido' then 'resolved'
    when new_status = 'fechado' then 'closed'
    else 'status_changed'
  end;

  notification_title := case action_type
    when 'reopened' then 'Chamado reaberto'
    when 'released' then 'Chamado liberado para a fila'
    when 'claimed' then 'Chamado assumido'
    when 'assigned' then 'Chamado atribuído'
    when 'resolved' then 'Chamado resolvido'
    when 'closed' then 'Chamado encerrado'
    else 'Status do chamado atualizado'
  end;
  notification_message := case action_type
    when 'reopened' then format('O chamado #%s foi reaberto e voltou para a fila.', new.ticket_number)
    when 'released' then format('O chamado #%s foi liberado para a fila.', new.ticket_number)
    when 'claimed' then format('O chamado #%s foi assumido e está em atendimento.', new.ticket_number)
    when 'assigned' then format('O chamado #%s foi atribuído para atendimento.', new.ticket_number)
    when 'resolved' then format('O chamado #%s foi resolvido.', new.ticket_number)
    when 'closed' then format('O chamado #%s foi encerrado.', new.ticket_number)
    else format('O status do chamado #%s foi atualizado.', new.ticket_number)
  end;

  for recipient in
    select distinct p.id
    from public.profiles p
    where p.is_active
      and (auth.uid() is null or p.id <> auth.uid())
      and (
        p.id = new.assigned_to
        or (
          p.id = new.created_by
          and (new_status in ('em_andamento', 'resolvido', 'fechado') or action_type = 'reopened')
        )
        or (action_type in ('reopened', 'released') and p.role::text = 'admin')
      )
  loop
    insert into public.notifications (user_id, ticket_id, title, message)
    values (recipient, new.id, notification_title, notification_message);
  end loop;
  return new;
end;
$$;

revoke all on function public.notify_ticket_status_change ()
from
  public,
  anon,
  authenticated;

create or replace function public.notify_ticket_priority_change () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  old_priority text;
  new_priority text;
  recipient uuid;
begin
  if new.priority_id is not distinct from old.priority_id then
    return new;
  end if;

  select p.name into old_priority
  from public.ticket_priorities p where p.id = old.priority_id;
  select p.name into new_priority
  from public.ticket_priorities p where p.id = new.priority_id;

  for recipient in
    select distinct p.id
    from public.profiles p
    where p.is_active
      and (auth.uid() is null or p.id <> auth.uid())
      and (p.id = new.assigned_to or p.id = new.created_by)
  loop
    insert into public.notifications (user_id, ticket_id, title, message)
    values (
      recipient,
      new.id,
      'Prioridade do chamado alterada',
      format('A prioridade do chamado #%s mudou de %s para %s.',
        new.ticket_number, coalesce(old_priority, 'indisponível'), coalesce(new_priority, 'indisponível'))
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.notify_ticket_priority_change ()
from
  public,
  anon,
  authenticated;

drop trigger if exists ticket_priority_change_notification on public.tickets;

create trigger ticket_priority_change_notification
after update of priority_id on public.tickets for each row
execute function public.notify_ticket_priority_change ();

create or replace function public.notify_ticket_message () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  actor_name text;
  ticket_number bigint;
  ticket_creator uuid;
  ticket_assignee uuid;
  recipient uuid;
  notification_title text;
  notification_message text;
begin
  select p.full_name, t.ticket_number, t.created_by, t.assigned_to
  into actor_name, ticket_number, ticket_creator, ticket_assignee
  from public.profiles p
  join public.tickets t on t.id = new.ticket_id
  where p.id = new.sender_id;
  actor_name := coalesce(actor_name, 'Um usuário');

  notification_title := case
    when new.is_internal then format('Nova nota interna no chamado #%s', ticket_number)
    when new.sender_id = ticket_creator then format('Nova resposta da equipe no chamado #%s', ticket_number)
    else format('%s respondeu no chamado #%s', actor_name, ticket_number)
  end;
  notification_message := case
    when new.is_internal then format('%s adicionou uma nota interna ao chamado #%s.', actor_name, ticket_number)
    when new.sender_id = ticket_creator then format('A equipe respondeu ao chamado #%s.', ticket_number)
    else format('Há uma nova resposta de %s no chamado #%s.', actor_name, ticket_number)
  end;

  for recipient in
    select distinct p.id
    from public.profiles p
    where p.is_active
      and p.id <> new.sender_id
      and (
        (new.is_internal and p.role::text = 'admin')
        or (
          not new.is_internal
          and new.sender_id = ticket_creator
          and (
            p.id = ticket_assignee
            or (ticket_assignee is null and p.role::text = 'admin')
          )
        )
        or (not new.is_internal and new.sender_id <> ticket_creator and p.id = ticket_creator)
      )
  loop
    insert into public.notifications (user_id, ticket_id, title, message)
    values (recipient, new.ticket_id, notification_title, notification_message);
  end loop;
  return new;
end;
$$;

revoke all on function public.notify_ticket_message ()
from
  public,
  anon,
  authenticated;

create or replace function public.claim_push_jobs () returns table (
  job_id uuid,
  subscription_id uuid,
  ticket_id uuid,
  notification_title text,
  notification_message text,
  endpoint text,
  p256dh text,
  auth text
) language sql security definer
set
  search_path = '' as $$
  with candidates as (
    select q.id
    from public.push_queue q
    join public.notifications n on n.id = q.notification_id
    join public.push_subscriptions s on s.id = q.subscription_id and s.user_id = n.user_id
    join public.profiles p on p.id = s.user_id
    join public.tickets t on t.id = n.ticket_id
    where q.available_at <= now()
      and q.attempts < 5
      and p.is_active
      and not p.must_change_password
      and (p.role::text = 'admin' or t.created_by = p.id)
      and (n.title not like 'Nova nota interna%' or p.role::text = 'admin')
      and n.created_at > now() - interval '1 day'
    order by q.available_at
    limit 10
    for update of q skip locked
  ), claimed as (
    update public.push_queue q
    set attempts = q.attempts + 1,
        available_at = now() + interval '5 minutes'
    from candidates c
    where q.id = c.id
    returning q.id, q.subscription_id, q.notification_id
  )
  select c.id, s.id, n.ticket_id, n.title, n.message, s.endpoint, s.p256dh, s.auth
  from claimed c
  join public.notifications n on n.id = c.notification_id
  join public.push_subscriptions s on s.id = c.subscription_id;
$$;

revoke all on function public.claim_push_jobs ()
from
  public,
  anon,
  authenticated;

grant
execute on function public.claim_push_jobs () to service_role;
