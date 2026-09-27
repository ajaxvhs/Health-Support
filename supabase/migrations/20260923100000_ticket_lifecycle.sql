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
    select p.role::text into actor_role
    from public.profiles p
    where p.id = actor_id and p.is_active;

    if actor_role is null then
      raise exception using errcode = '42501', message = 'Conta inativa ou sessão inválida.';
    end if;
  end if;

  select s.slug into new_status
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
    if not exists (select 1 from public.profiles p where p.id = new.created_by and p.is_active) then
      raise exception using errcode = '23514', message = 'O solicitante não está ativo.';
    end if;
    if not exists (select 1 from public.units u where u.id = new.unit_id and u.is_active)
      or not exists (select 1 from public.ticket_categories c where c.id = new.category_id and c.is_active)
      or not exists (select 1 from public.ticket_priorities p where p.id = new.priority_id and p.is_active) then
      raise exception using errcode = '23514', message = 'Unidade, categoria ou prioridade indisponível.';
    end if;
    select p.full_name, p.phone into new.requester_name_snapshot, new.requester_phone_snapshot
    from public.profiles p where p.id = new.created_by and p.is_active;
    new.resolution_notes := null;
    new.resolved_at := null;
    new.closed_at := null;
    return new;
  end if;

  select s.slug into old_status
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

  -- Historical references remain valid; only newly selected inactive catalog entries are rejected.
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
    select p.is_active and p.role::text in ('admin', 'atendente') into assignee_is_eligible
    from public.profiles p where p.id = new.assigned_to;
    if coalesce(assignee_is_eligible, false) is false then
      raise exception using errcode = '23514', message = 'O responsável deve ser um membro ativo da equipe.';
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
    if actor_role = 'atendente' and old.assigned_to is distinct from actor_id and (
      new.priority_id is distinct from old.priority_id
      or new.unit_id is distinct from old.unit_id
      or new.category_id is distinct from old.category_id
    ) then
      raise exception using errcode = '42501', message = 'Assuma o chamado antes de editar seus detalhes.';
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
      raise exception using errcode = '23514', message = 'Assumir um chamado exige atribuir um membro ativo da equipe.';
    end if;
    if actor_id is not null and actor_role <> 'admin' and new.assigned_to <> actor_id then
      raise exception using errcode = '42501', message = 'Um atendente só pode assumir o chamado para si.';
    end if;
    new.resolution_notes := null;
    new.resolved_at := null;
    new.closed_at := null;
  elsif old_status = 'em_andamento' and new_status = 'aberto' then
    if old.assigned_to is null or new.assigned_to is not null then
      raise exception using errcode = '23514', message = 'Liberar um chamado deve removê-lo da atribuição e devolvê-lo à fila aberta.';
    end if;
    if actor_id is not null and actor_role <> 'admin' and old.assigned_to <> actor_id then
      raise exception using errcode = '42501', message = 'Somente o responsável atual ou um administrador pode liberar o chamado.';
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
    if actor_id is not null and actor_role <> 'admin' and old.assigned_to <> actor_id then
      raise exception using errcode = '42501', message = 'Somente o responsável atual pode resolver o chamado.';
    end if;
    new.resolved_at := pg_catalog.now();
    new.closed_at := null;
  elsif old_status = 'resolvido' and new_status = 'fechado' then
    if new.assigned_to is distinct from old.assigned_to
      or new.resolution_notes is distinct from old.resolution_notes then
      raise exception using errcode = '23514', message = 'O encerramento deve preservar responsável e solução.';
    end if;
    if actor_id is not null and not (
      actor_role = 'admin'
      or (actor_role = 'solicitante' and old.created_by = actor_id)
      or (actor_role = 'atendente' and old.assigned_to = actor_id)
    ) then
      raise exception using errcode = '42501', message = 'Você não pode encerrar este chamado.';
    end if;
    if old.resolved_at is null then
      raise exception using errcode = '23514', message = 'O chamado precisa ter uma resolução registrada antes do encerramento.';
    end if;
    new.resolved_at := old.resolved_at;
    new.closed_at := pg_catalog.now();
  elsif old_status in ('resolvido', 'fechado') and new_status = 'aberto' then
    if new.assigned_to is not null then
      raise exception using errcode = '23514', message = 'A reabertura deve devolver o chamado à fila sem responsável.';
    end if;
    if actor_id is not null and not (
      actor_role = 'admin'
      or (actor_role = 'solicitante' and old.created_by = actor_id)
      or (actor_role = 'atendente' and old.assigned_to = actor_id)
    ) then
      raise exception using errcode = '42501', message = 'Você não pode reabrir este chamado.';
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

drop trigger if exists tickets_enforce_update on public.tickets;

create trigger tickets_enforce_update
before insert or update on public.tickets for each row
execute function public.enforce_ticket_lifecycle ();

revoke all on function public.enforce_ticket_lifecycle ()
from
  public,
  anon,
  authenticated;

drop policy if exists ticket_staff_update on public.tickets;

create policy ticket_staff_update on public.tickets
for update
  to authenticated using (
    public.is_admin ()
    or (
      public.is_staff ()
      and (
        assigned_to = auth.uid ()
        or assigned_to is null
      )
    )
    or created_by = auth.uid ()
  )
with
  check (
    public.is_admin ()
    or (
      public.is_staff ()
      and (
        assigned_to = auth.uid ()
        or assigned_to is null
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
    and exists (
      select
        1
      from
        public.tickets t
        join public.ticket_statuses s on s.id = t.status_id
      where
        t.id = ticket_messages.ticket_id
        and s.slug not in ('resolvido', 'fechado')
        and (
          (
            public.is_staff ()
            and (
              public.is_admin ()
              or t.assigned_to = auth.uid ()
              or t.assigned_to is null
            )
          )
          or (
            not ticket_messages.is_internal
            and t.created_by = auth.uid ()
          )
        )
    )
  );

create or replace function public.get_ticket_participants () returns table (id uuid, full_name text) language sql stable security definer
set
  search_path = '' as $$
  select distinct p.id, p.full_name
  from public.profiles p
  where auth.uid() is not null
    and exists (
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
        )
    );
$$;

revoke all on function public.get_ticket_participants ()
from
  public,
  anon;

grant
execute on function public.get_ticket_participants () to authenticated;

create or replace function public.protect_structural_ticket_statuses () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  if old.slug in ('aberto', 'em_andamento', 'resolvido', 'fechado') then
    if tg_op = 'DELETE'
      or new.slug is distinct from old.slug
      or new.name is distinct from old.name
      or new.is_terminal is distinct from (old.slug in ('resolvido', 'fechado'))
      or not new.is_active then
      raise exception using errcode = '23514', message = 'Status estrutural não pode ser removido, renomeado ou desativado.';
    end if;
    new.is_terminal := old.slug in ('resolvido', 'fechado');
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.protect_structural_ticket_statuses ()
from
  public,
  anon,
  authenticated;

drop trigger if exists ticket_statuses_protect_structural on public.ticket_statuses;

create trigger ticket_statuses_protect_structural
before update or delete on public.ticket_statuses for each row
execute function public.protect_structural_ticket_statuses ();

drop policy if exists active_unit_read on public.units;

create policy active_unit_read on public.units for
select
  to authenticated using (
    is_active
    or exists (
      select
        1
      from
        public.tickets t
      where
        t.unit_id = units.id
        and (
          public.is_staff ()
          or t.created_by = auth.uid ()
        )
    )
  );

drop policy if exists active_category_read on public.ticket_categories;

create policy active_category_read on public.ticket_categories for
select
  to authenticated using (
    is_active
    or exists (
      select
        1
      from
        public.tickets t
      where
        t.category_id = ticket_categories.id
        and (
          public.is_staff ()
          or t.created_by = auth.uid ()
        )
    )
  );

drop policy if exists active_priority_read on public.ticket_priorities;

create policy active_priority_read on public.ticket_priorities for
select
  to authenticated using (
    is_active
    or exists (
      select
        1
      from
        public.tickets t
      where
        t.priority_id = ticket_priorities.id
        and (
          public.is_staff ()
          or t.created_by = auth.uid ()
        )
    )
  );

drop policy if exists active_status_read on public.ticket_statuses;

create policy active_status_read on public.ticket_statuses for
select
  to authenticated using (
    is_active
    or exists (
      select
        1
      from
        public.tickets t
      where
        t.status_id = ticket_statuses.id
        and (
          public.is_staff ()
          or t.created_by = auth.uid ()
        )
    )
  );

create or replace function public.audit_ticket_change () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  old_status text;
  new_status text;
  change_type text;
  change_detail text;
begin
  if tg_op = 'INSERT' then
    select s.slug into new_status from public.ticket_statuses s where s.id = new.status_id;
    insert into public.ticket_events(ticket_id, actor_id, event_type, to_status_id, to_assigned_to, metadata)
    values (new.id, auth.uid(), 'created', new.status_id, new.assigned_to,
      jsonb_build_object('detail', 'Chamado aberto'));
    return new;
  end if;

  if new.status_id is not distinct from old.status_id
    and new.assigned_to is not distinct from old.assigned_to
    and new.priority_id is not distinct from old.priority_id
    and new.resolution_notes is not distinct from old.resolution_notes then
    return new;
  end if;

  select s.slug into old_status from public.ticket_statuses s where s.id = old.status_id;
  select s.slug into new_status from public.ticket_statuses s where s.id = new.status_id;
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
      when 'closed' then 'Chamado encerrado'
      else 'Status alterado'
    end;
  elsif old.assigned_to is distinct from new.assigned_to then
    change_type := case when new.assigned_to is null then 'released' else 'assigned' end;
    change_detail := case when new.assigned_to is null then 'Chamado liberado para a fila' else 'Chamado atribuído' end;
  else
    change_type := 'updated';
    change_detail := 'Detalhes do chamado atualizados';
  end if;

  insert into public.ticket_events(
    ticket_id, actor_id, event_type, from_status_id, to_status_id,
    from_assigned_to, to_assigned_to, metadata
  ) values (
    new.id, auth.uid(), change_type, old.status_id, new.status_id,
    old.assigned_to, new.assigned_to,
    jsonb_build_object('detail', change_detail)
  );
  return new;
end;
$$;

create or replace function public.notify_ticket_status_change () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  new_status text;
  notification_title text;
  recipient uuid;
begin
  if new.status_id is not distinct from old.status_id then return new; end if;
  select s.slug into new_status from public.ticket_statuses s where s.id = new.status_id;
  notification_title := case new_status
    when 'resolvido' then 'Chamado resolvido'
    when 'fechado' then 'Chamado encerrado'
    when 'aberto' then 'Chamado reaberto'
    else 'Status do chamado atualizado'
  end;

  for recipient in
    select distinct p.id
    from public.profiles p
    where p.is_active
      and p.id <> auth.uid()
      and (
        p.id = new.created_by
        or p.id = old.assigned_to
        or p.id = new.assigned_to
        or (new.assigned_to is null and p.role::text in ('admin', 'atendente'))
      )
  loop
    insert into public.notifications(user_id, ticket_id, title, message)
    values (recipient, new.id, notification_title, 'O chamado #' || new.ticket_number || ' teve seu status atualizado.');
  end loop;
  return new;
end;
$$;

drop trigger if exists ticket_status_change_notification on public.tickets;

create trigger ticket_status_change_notification
after update of status_id on public.tickets for each row
execute function public.notify_ticket_status_change ();
