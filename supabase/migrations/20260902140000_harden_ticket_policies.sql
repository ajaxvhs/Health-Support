drop policy if exists ticket_staff_update on public.tickets;

create policy ticket_staff_update on public.tickets
for update
  to authenticated using (
    (
      public.is_staff ()
      and (
        public.is_admin ()
        or assigned_to = auth.uid ()
        or assigned_to is null
      )
    )
    or created_by = auth.uid ()
  )
with
  check (
    (
      public.is_staff ()
      and (
        public.is_admin ()
        or assigned_to = auth.uid ()
      )
    )
    or created_by = auth.uid ()
  );

drop policy if exists message_insert on public.ticket_messages;

create policy message_insert on public.ticket_messages for insert to authenticated
with
  check (
    sender_id = auth.uid ()
    and public.is_active_user ()
    and (
      (
        not is_internal
        and exists (
          select
            1
          from
            public.tickets
            join public.ticket_statuses on ticket_statuses.id = tickets.status_id
          where
            tickets.id = ticket_messages.ticket_id
            and (
              public.is_staff ()
              or (
                tickets.created_by = auth.uid ()
                and ticket_statuses.slug <> 'fechado'
              )
            )
        )
      )
      or (
        is_internal
        and public.is_staff ()
      )
    )
  );

drop policy if exists event_read on public.ticket_events;

create policy event_read on public.ticket_events for
select
  to authenticated using (
    exists (
      select
        1
      from
        public.tickets
      where
        tickets.id = ticket_events.ticket_id
        and (
          tickets.created_by = auth.uid ()
          or public.is_staff ()
        )
    )
  );

create or replace function public.enforce_ticket_update () returns trigger language plpgsql security definer
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

revoke all on function public.enforce_ticket_update ()
from
  public;

drop trigger if exists tickets_enforce_update on public.tickets;

create trigger tickets_enforce_update
before update on public.tickets for each row
execute function public.enforce_ticket_update ();
