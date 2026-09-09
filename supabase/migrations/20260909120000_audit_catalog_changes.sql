alter table public.ticket_events
alter column ticket_id
drop not null;

drop policy if exists event_read on public.ticket_events;

create policy event_read on public.ticket_events for
select
  to authenticated using (
    public.is_admin ()
    or exists (
      select
        1
      from
        public.tickets
      where
        public.tickets.id = public.ticket_events.ticket_id
        and (
          public.tickets.created_by = auth.uid ()
          or public.is_staff ()
        )
    )
  );

create or replace function public.audit_catalog_change () returns trigger language plpgsql security definer
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

  insert into public.ticket_events (ticket_id, actor_id, event_type, metadata)
  values (
    null,
    auth.uid(),
    event_type,
    jsonb_build_object('detail', event_detail, 'catalog', tg_table_name, 'item', item_name)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists units_audit on public.units;

create trigger units_audit
after insert or update or delete on public.units for each row
execute function public.audit_catalog_change ();

drop trigger if exists categories_audit on public.ticket_categories;

create trigger categories_audit
after insert or update or delete on public.ticket_categories for each row
execute function public.audit_catalog_change ();

drop trigger if exists priorities_audit on public.ticket_priorities;

create trigger priorities_audit
after insert or update or delete on public.ticket_priorities for each row
execute function public.audit_catalog_change ();

drop trigger if exists statuses_audit on public.ticket_statuses;

create trigger statuses_audit
after insert or update or delete on public.ticket_statuses for each row
execute function public.audit_catalog_change ();
