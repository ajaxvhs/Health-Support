create index if not exists tickets_created_at_id_idx on public.tickets (created_at desc, id desc);

create index if not exists tickets_updated_at_id_idx on public.tickets (updated_at desc, id desc);

create index if not exists ticket_events_created_at_id_idx on public.ticket_events (created_at desc, id desc);

create or replace function public.get_ticket_page (
  p_view text,
  p_assigned_to_me_only boolean,
  p_status text,
  p_statuses text[],
  p_priority_id uuid,
  p_unit_id uuid,
  p_requester_id uuid,
  p_search text,
  p_created_after timestamptz,
  p_sort text,
  p_offset integer,
  p_limit integer
) returns table (
  total_count bigint,
  queue_unassigned_count bigint,
  queue_in_progress_count bigint,
  tickets jsonb
) language sql stable security invoker
set
  search_path = '' as $$
  with visible as materialized (
    select t.*, s.slug as status_slug, p.slug as priority_slug
    from public.tickets t
    join public.ticket_statuses s on s.id = t.status_id
    join public.ticket_priorities p on p.id = t.priority_id
    left join public.profiles requester on requester.id = t.created_by
    left join public.units u on u.id = t.unit_id
    where
      (p_view <> 'mine' or t.created_by = (select auth.uid()))
      and (p_view <> 'queue' or s.slug not in ('resolvido', 'fechado'))
      and (not coalesce(p_assigned_to_me_only, false) or t.assigned_to = (select auth.uid()))
      and (
        case
          when coalesce(cardinality(p_statuses), 0) > 0 then s.slug = any(p_statuses)
          else coalesce(p_status, 'todos') = 'todos' or s.slug = p_status
        end
      )
      and (p_priority_id is null or t.priority_id = p_priority_id)
      and (p_unit_id is null or t.unit_id = p_unit_id)
      and (p_requester_id is null or t.created_by = p_requester_id)
      and (p_created_after is null or t.created_at >= p_created_after)
      and (
        nullif(btrim(p_search), '') is null
        or concat_ws(' ', t.ticket_number::text, t.title, t.description,
          t.requester_name_snapshot, requester.full_name, u.name)
          ilike '%' || regexp_replace(btrim(p_search), '^#', '') || '%'
      )
  ),
  page_rows as (
    select
      v.*,
      case when v.status_slug in ('aberto', 'em_andamento') then 0 else 1 end as status_order,
      case when p_sort = 'priority' then
        case v.priority_slug when 'urgente' then 0 when 'alta' then 1 when 'media' then 2 when 'baixa' then 3 else -1 end
      else 0 end as priority_order
    from visible v
    order by
      status_order,
      priority_order,
      case when p_sort = 'oldest' then v.created_at end asc,
      case when p_sort <> 'oldest' then v.created_at end desc,
      v.id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 10), 1), 100)
  ),
  totals as (
    select
      (select count(*) from visible) as total_count,
      (select count(*) from public.tickets t join public.ticket_statuses s on s.id = t.status_id
       where s.slug in ('aberto', 'em_andamento') and t.assigned_to is null) as queue_unassigned_count,
      (select count(*) from public.tickets t join public.ticket_statuses s on s.id = t.status_id
       where s.slug = 'em_andamento') as queue_in_progress_count
  )
  select
    totals.total_count,
    totals.queue_unassigned_count,
    totals.queue_in_progress_count,
    coalesce(
      (select jsonb_agg(
        to_jsonb(page_rows) - 'status_slug' - 'priority_slug' - 'status_order' - 'priority_order'
        || jsonb_build_object('ticket_statuses', jsonb_build_object('slug', page_rows.status_slug))
        order by page_rows.status_order, page_rows.priority_order,
          case when p_sort = 'oldest' then page_rows.created_at end asc,
          case when p_sort <> 'oldest' then page_rows.created_at end desc,
          page_rows.id desc
      ) from page_rows),
      '[]'::jsonb
    )
  from totals;
$$;

create or replace function public.get_ticket_navigation_counts () returns table (visible_open_count bigint, my_open_count bigint) language sql stable security invoker
set
  search_path = '' as $$
  select
    count(*) filter (where s.slug not in ('resolvido', 'fechado')),
    count(*) filter (where s.slug not in ('resolvido', 'fechado') and t.created_by = (select auth.uid()))
  from public.tickets t
  join public.ticket_statuses s on s.id = t.status_id;
$$;

create or replace function public.get_ticket_dashboard () returns jsonb language sql stable security invoker
set
  search_path = '' as $$
  with visible as materialized (
    select t.*, s.slug as status_slug, p.slug as priority_slug
    from public.tickets t
    join public.ticket_statuses s on s.id = t.status_id
    join public.ticket_priorities p on p.id = t.priority_id
  ),
  latest_public as (
    select distinct on (m.ticket_id) m.ticket_id, m.sender_id
    from public.ticket_messages m
    where not m.is_internal
    order by m.ticket_id, m.created_at desc, m.id desc
  ),
  summary as (
    select
      count(*) filter (where v.status_slug <> 'fechado') as open_count,
      count(*) filter (where v.status_slug = 'em_andamento') as in_progress_count,
      count(*) filter (where v.status_slug = 'fechado') as closed_count,
      count(*) filter (where v.status_slug = 'aberto') as waiting_count,
      count(*) filter (where v.priority_slug = 'urgente' and v.status_slug <> 'fechado') as urgent_count,
      count(*) filter (where v.assigned_to is null and v.status_slug <> 'fechado') as unassigned_count,
      count(*) filter (where v.assigned_to = (select auth.uid()) and v.status_slug <> 'fechado') as assigned_to_me_count,
      count(*) filter (
        where v.status_slug <> 'fechado'
          and latest_public.ticket_id is not null
          and latest_public.sender_id <> v.created_by
      ) as waiting_for_requester_count
    from visible v
    left join latest_public on latest_public.ticket_id = v.id
  ),
  recent as (
    select to_jsonb(v) - 'status_slug' - 'priority_slug'
      || jsonb_build_object('ticket_statuses', jsonb_build_object('slug', v.status_slug)) as ticket
    from visible v
    order by v.updated_at desc, v.id desc
    limit 5
  )
  select to_jsonb(summary) || jsonb_build_object(
    'tickets', coalesce((select jsonb_agg(recent.ticket) from recent), '[]'::jsonb)
  )
  from summary;
$$;

create or replace function public.get_audit_events_page (
  p_actor_id uuid,
  p_event_type text,
  p_from timestamptz,
  p_to timestamptz,
  p_search text,
  p_offset integer,
  p_limit integer
) returns table (
  total_count bigint,
  ticket_count bigint,
  actor_count bigint,
  events jsonb
) language sql stable security invoker
set
  search_path = '' as $$
  with filtered as materialized (
    select e.*, actor.full_name as actor_name,
      t.ticket_number, t.title as ticket_title, t.requester_name_snapshot
    from public.ticket_events e
    left join public.profiles actor on actor.id = e.actor_id
    left join public.tickets t on t.id = e.ticket_id
    where
      (p_actor_id is null or e.actor_id = p_actor_id)
      and (nullif(p_event_type, '') is null or e.event_type = p_event_type)
      and (p_from is null or e.created_at >= p_from)
      and (p_to is null or e.created_at <= p_to)
      and (
        nullif(btrim(p_search), '') is null
        or case
          when btrim(p_search) ~ '^#[0-9]+$' then t.ticket_number::text = substring(btrim(p_search) from 2)
          else concat_ws(' ', e.event_type, coalesce(e.metadata ->> 'detail', e.event_type),
            actor.full_name, t.ticket_number, t.title, t.requester_name_snapshot)
            ilike '%' || btrim(p_search) || '%'
        end
      )
  ),
  page_rows as (
    select * from filtered
    order by created_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 10), 1), 100)
  ),
  totals as (
    select count(*) as total_count,
      count(distinct ticket_id) as ticket_count,
      count(distinct actor_id) as actor_count
    from filtered
  )
  select
    totals.total_count,
    totals.ticket_count,
    totals.actor_count,
    coalesce(
      (select jsonb_agg(
        (to_jsonb(page_rows) - 'actor_name' - 'ticket_number' - 'ticket_title' - 'requester_name_snapshot')
        || jsonb_build_object(
          'ticket_number', page_rows.ticket_number,
          'ticket_title', page_rows.ticket_title,
          'requester_name_snapshot', page_rows.requester_name_snapshot
        )
        order by page_rows.created_at desc, page_rows.id desc
      ) from page_rows),
      '[]'::jsonb
    )
  from totals;
$$;

revoke all on function public.get_ticket_page (
  text,
  boolean,
  text,
  text[],
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  text,
  integer,
  integer
)
from
  public,
  anon;

revoke all on function public.get_ticket_navigation_counts ()
from
  public,
  anon;

revoke all on function public.get_ticket_dashboard ()
from
  public,
  anon;

revoke all on function public.get_audit_events_page (
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  integer,
  integer
)
from
  public,
  anon;

grant
execute on function public.get_ticket_page (
  text,
  boolean,
  text,
  text[],
  uuid,
  uuid,
  uuid,
  text,
  timestamptz,
  text,
  integer,
  integer
) to authenticated;

grant
execute on function public.get_ticket_navigation_counts () to authenticated;

grant
execute on function public.get_ticket_dashboard () to authenticated;

grant
execute on function public.get_audit_events_page (
  uuid,
  text,
  timestamptz,
  timestamptz,
  text,
  integer,
  integer
) to authenticated;
