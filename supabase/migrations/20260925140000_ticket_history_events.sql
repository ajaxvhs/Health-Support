create or replace function public.audit_ticket_change () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  old_status text;
  new_status text;
  old_status_name text;
  new_status_name text;
  old_priority_name text;
  new_priority_name text;
  change_type text;
  change_detail text;
  event_metadata jsonb;
begin
  if tg_op = 'INSERT' then
    select s.slug, s.name into new_status, new_status_name
    from public.ticket_statuses s where s.id = new.status_id;
    insert into public.ticket_events(
      ticket_id, actor_id, event_type, to_status_id, to_assigned_to, metadata
    ) values (
      new.id, auth.uid(), 'created', new.status_id, new.assigned_to,
      jsonb_build_object('detail', 'Chamado aberto', 'to_status', coalesce(new_status_name, new_status))
    );
    return new;
  end if;

  -- updated_at and other incidental updates must not create history entries.
  if new.status_id is not distinct from old.status_id
    and new.assigned_to is not distinct from old.assigned_to
    and new.priority_id is not distinct from old.priority_id
    and new.resolution_notes is not distinct from old.resolution_notes then
    return new;
  end if;

  select s.slug, s.name into old_status, old_status_name
  from public.ticket_statuses s where s.id = old.status_id;
  select s.slug, s.name into new_status, new_status_name
  from public.ticket_statuses s where s.id = new.status_id;

  if new.status_id is distinct from old.status_id then
    change_type := case
      when old_status in ('resolvido', 'fechado') and new_status = 'aberto' then 'reopened'
      when new_status = 'resolvido' then 'resolved'
      when new_status = 'fechado' then 'closed'
      else 'status_changed'
    end;
    change_detail := case change_type
      when 'reopened' then 'Chamado reaberto'
      when 'resolved' then 'Chamado resolvido'
      when 'closed' then 'Chamado fechado sem resolução'
      else 'Situação alterada para ' || coalesce(new_status_name, new_status)
    end;
    event_metadata := jsonb_build_object(
      'detail', change_detail,
      'from_status', old_status_name,
      'to_status', new_status_name
    );
  elsif new.assigned_to is distinct from old.assigned_to then
    change_type := case
      when new.assigned_to is null then 'released'
      when old.assigned_to is null then 'assigned'
      else 'reassigned'
    end;
    change_detail := case change_type
      when 'released' then 'Chamado liberado para a fila'
      when 'reassigned' then 'Responsável alterado'
      else 'Responsável atribuído'
    end;
    event_metadata := jsonb_build_object('detail', change_detail);
  elsif new.priority_id is distinct from old.priority_id then
    select p.name into old_priority_name
    from public.ticket_priorities p where p.id = old.priority_id;
    select p.name into new_priority_name
    from public.ticket_priorities p where p.id = new.priority_id;
    change_type := 'priority_changed';
    change_detail := 'Prioridade alterada de '
      || coalesce(old_priority_name, 'indisponível')
      || ' para '
      || coalesce(new_priority_name, 'indisponível');
    event_metadata := jsonb_build_object(
      'detail', change_detail,
      'priority_from_id', old.priority_id,
      'priority_to_id', new.priority_id,
      'priority_from', old_priority_name,
      'priority_to', new_priority_name
    );
  else
    change_type := 'ticket_details_updated';
    change_detail := 'Detalhes do chamado atualizados';
    event_metadata := jsonb_build_object('detail', change_detail);
  end if;

  insert into public.ticket_events(
    ticket_id, actor_id, event_type, from_status_id, to_status_id,
    from_assigned_to, to_assigned_to, metadata
  ) values (
    new.id, auth.uid(), change_type, old.status_id, new.status_id,
    old.assigned_to, new.assigned_to, event_metadata
  );
  return new;
end;
$$;

revoke all on function public.audit_ticket_change ()
from
  public,
  anon,
  authenticated;

-- The audit function existed remotely, but tickets had no trigger attached to it.
drop trigger if exists tickets_audit on public.tickets;

create trigger tickets_audit
after insert or update on public.tickets for each row
execute function public.audit_ticket_change ();

create or replace function public.get_ticket_participants () returns table (id uuid, full_name text) language sql stable security definer
set
  search_path = '' as $$
  select distinct p.id, p.full_name
  from public.profiles p
  where auth.uid() is not null and exists (
    select 1
    from public.tickets t
    where (public.is_staff() or t.created_by = auth.uid())
      and (
        p.id = t.created_by
        or p.id = t.assigned_to
        or exists (
          select 1
          from public.ticket_messages m
          where m.ticket_id = t.id
            and m.sender_id = p.id
            and (public.is_staff() or not m.is_internal)
        )
        or exists (
          select 1
          from public.ticket_events e
          where e.ticket_id = t.id and e.actor_id = p.id
        )
      )
  );
$$;

revoke all on function public.get_ticket_participants ()
from
  public,
  anon;

grant
execute on function public.get_ticket_participants () to authenticated;

-- The immutable creation fields allow one truthful opening event for each old ticket.
-- Past intermediate transitions cannot be reconstructed and are not fabricated.
insert into
  public.ticket_events (
    ticket_id,
    actor_id,
    event_type,
    to_status_id,
    to_assigned_to,
    metadata,
    created_at
  )
select
  t.id,
  t.created_by,
  'created',
  (
    select
      s.id
    from
      public.ticket_statuses s
    where
      s.slug = 'aberto'
  ),
  null,
  jsonb_build_object(
    'detail',
    'Chamado aberto',
    'history_backfill',
    true
  ),
  t.created_at
from
  public.tickets t
where
  not exists (
    select
      1
    from
      public.ticket_events e
    where
      e.ticket_id = t.id
      and e.event_type = 'created'
  );
