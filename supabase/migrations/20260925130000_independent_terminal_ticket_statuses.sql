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
    if not exists (select 1 from public.profiles p where p.id = new.created_by and p.is_active)
      or not exists (select 1 from public.units u where u.id = new.unit_id and u.is_active)
      or not exists (select 1 from public.ticket_categories c where c.id = new.category_id and c.is_active)
      or not exists (select 1 from public.ticket_priorities p where p.id = new.priority_id and p.is_active) then
      raise exception using errcode = '23514', message = 'Solicitante ou catálogo indisponível.';
    end if;
    select p.full_name, p.phone into new.requester_name_snapshot, new.requester_phone_snapshot
    from public.profiles p where p.id = new.created_by and p.is_active;
    new.resolution_notes := null;
    new.resolved_at := null;
    new.closed_at := null;
    return new;
  end if;

  select s.slug into old_status
  from public.ticket_statuses s where s.id = old.status_id;

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
  elsif new_status = 'fechado' and old_status in ('aberto', 'em_andamento') then
    if new.assigned_to is distinct from old.assigned_to then
      raise exception using errcode = '23514', message = 'O fechamento sem resolução deve preservar a atribuição atual.';
    end if;
    if actor_id is not null and not (
      actor_role = 'admin'
      or (actor_role = 'atendente' and old.assigned_to = actor_id)
    ) then
      raise exception using errcode = '42501', message = 'Somente um administrador ou o responsável atual pode fechar sem resolução.';
    end if;
    new.resolution_notes := null;
    new.resolved_at := null;
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

revoke all on function public.enforce_ticket_lifecycle ()
from
  public,
  anon,
  authenticated;
