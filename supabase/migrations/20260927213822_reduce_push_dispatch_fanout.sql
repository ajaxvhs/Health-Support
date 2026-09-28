create or replace function public.notify_ticket_message () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  actor_name text;
  ticket_number bigint;
  ticket_creator uuid;
  ticket_assignee uuid;
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

  insert into public.notifications (user_id, ticket_id, title, message)
  select distinct p.id, new.ticket_id, notification_title, notification_message
  from public.profiles p
  where p.is_active
    and p.id <> new.sender_id
    and (
      (new.is_internal and p.role::text = 'admin')
      or (
        not new.is_internal
        and new.sender_id = ticket_creator
        and (p.id = ticket_assignee or (ticket_assignee is null and p.role::text = 'admin'))
      )
      or (not new.is_internal and new.sender_id <> ticket_creator and p.id = ticket_creator)
    );
  return new;
end;
$$;

create or replace function public.enqueue_push_batch () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  queued_jobs integer;
begin
  insert into public.push_queue (notification_id, subscription_id)
  select n.id, s.id
  from inserted_notifications n
  join public.push_subscriptions s on s.user_id = n.user_id
  on conflict do nothing;
  get diagnostics queued_jobs = row_count;

  if queued_jobs > 0 then
    perform public.dispatch_push_queue();
  end if;
  return null;
end;
$$;

revoke all on function public.enqueue_push_batch ()
from
  public,
  anon,
  authenticated;

drop trigger if exists notification_web_push on public.notifications;

create trigger notification_web_push
after insert on public.notifications referencing new table as inserted_notifications for each statement
execute function public.enqueue_push_batch ();

drop function if exists public.enqueue_push ();

create index if not exists ticket_messages_latest_public_by_ticket_idx on public.ticket_messages (ticket_id, created_at desc) include (sender_id)
where
  not is_internal;

create or replace function public.get_latest_public_ticket_messages () returns table (ticket_id uuid, sender_id uuid) language sql security invoker
set
  search_path = '' as $$
  select distinct on (m.ticket_id) m.ticket_id, m.sender_id
  from public.ticket_messages m
  where not m.is_internal
  order by m.ticket_id, m.created_at desc, m.id desc;
$$;

revoke all on function public.get_latest_public_ticket_messages ()
from
  public,
  anon;

grant
execute on function public.get_latest_public_ticket_messages () to authenticated;
