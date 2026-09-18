create or replace function public.notify_ticket_message () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  recipient uuid;
  actor_name text;
  ticket_number bigint;
  notification_title text;
  notification_message text;
begin
  select p.full_name, t.ticket_number
  into actor_name, ticket_number
  from public.profiles p
  join public.tickets t on t.id = new.ticket_id
  where p.id = new.sender_id;

  actor_name := coalesce(actor_name, 'Um usuário');
  notification_title := case
    when new.is_internal then format('Nova nota interna no chamado #%s', ticket_number)
    else format('%s respondeu sobre o chamado #%s', actor_name, ticket_number)
  end;
  notification_message := case
    when new.is_internal then format('%s adicionou uma nota interna ao chamado #%s.', actor_name, ticket_number)
    else format('Há uma nova resposta de %s no chamado #%s.', actor_name, ticket_number)
  end;

  for recipient in
    select distinct p.id
    from public.profiles p
    join public.tickets t on t.id = new.ticket_id
    where p.is_active
      and p.id <> new.sender_id
      and (
        p.id = t.created_by
        or p.id = t.assigned_to
        or (t.assigned_to is null and p.role::text <> 'solicitante')
      )
      and (not new.is_internal or p.role::text <> 'solicitante')
  loop
    insert into public.notifications (user_id, ticket_id, title, message)
    values (recipient, new.ticket_id, notification_title, notification_message);
  end loop;
  return new;
end;
$$;

create or replace function public.notify_new_ticket () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  requester text;
begin
  requester := coalesce(new.requester_name_snapshot, 'Um usuário');
  insert into public.notifications (user_id, ticket_id, title, message)
  select
    p.id,
    new.id,
    'Novo chamado aberto',
    format('%s abriu o chamado #%s e aguarda atendimento.', requester, new.ticket_number)
  from public.profiles p
  where p.is_active
    and p.role::text in ('admin', 'atendente')
    and p.id <> new.created_by;
  return new;
end;
$$;

drop function if exists public.claim_push_jobs ();

create function public.claim_push_jobs () returns table (
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
      and (p.role::text in ('admin', 'atendente') or t.created_by = p.id)
      and (n.title not like 'Nova nota interna%' or p.role::text in ('admin', 'atendente'))
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
  select
    c.id,
    s.id,
    n.ticket_id,
    n.title,
    n.message,
    s.endpoint,
    s.p256dh,
    s.auth
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

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel pr
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where pr.prpubid = (select oid from pg_publication where pubname = 'supabase_realtime')
      and n.nspname = 'public'
      and c.relname = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
