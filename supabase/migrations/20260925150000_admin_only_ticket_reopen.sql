create or replace function public.require_admin_for_ticket_reopen () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  actor_id uuid := auth.uid();
  old_status text;
  new_status text;
  actor_role text;
begin
  if new.status_id is not distinct from old.status_id then
    return new;
  end if;

  select s.slug into old_status
  from public.ticket_statuses s where s.id = old.status_id;
  select s.slug into new_status
  from public.ticket_statuses s where s.id = new.status_id;

  if old_status in ('resolvido', 'fechado') and new_status = 'aberto' and actor_id is not null then
    select p.role::text into actor_role
    from public.profiles p
    where p.id = actor_id and p.is_active;

    if actor_role is distinct from 'admin' then
      raise exception using errcode = '42501', message = 'Somente um administrador pode reabrir o chamado.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.require_admin_for_ticket_reopen ()
from
  public,
  anon,
  authenticated;

-- Runs after the lifecycle trigger and provides the final role-specific guard.
drop trigger if exists zz_ticket_reopen_admin_only on public.tickets;

create trigger zz_ticket_reopen_admin_only
before update of status_id on public.tickets for each row
execute function public.require_admin_for_ticket_reopen ();
