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
    select t.*, s.slug as status_slug, p.level as priority_level
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
      case when p_sort = 'priority' then v.priority_level end as priority_order
    from visible v
    order by
      status_order,
      priority_order desc nulls last,
      case when p_sort = 'oldest' then v.created_at end asc,
      case when p_sort <> 'oldest' then v.created_at end desc,
      v.ticket_number desc,
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
        to_jsonb(page_rows) - 'status_slug' - 'priority_level' - 'status_order' - 'priority_order'
        || jsonb_build_object('ticket_statuses', jsonb_build_object('slug', page_rows.status_slug))
        order by page_rows.status_order, page_rows.priority_order desc nulls last,
          case when p_sort = 'oldest' then page_rows.created_at end asc,
          case when p_sort <> 'oldest' then page_rows.created_at end desc,
          page_rows.ticket_number desc,
          page_rows.id desc
      ) from page_rows),
      '[]'::jsonb
    )
  from totals;
$$;
