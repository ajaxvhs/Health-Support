create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (length(endpoint) < 2048),
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create policy push_owner on public.push_subscriptions for all to authenticated using (user_id = auth.uid ())
with
  check (
    user_id = auth.uid ()
    and exists (
      select
        1
      from
        public.profiles
      where
        id = auth.uid ()
        and is_active
    )
  );

grant
select
,
  insert,
update,
delete on public.push_subscriptions to authenticated;

create table public.push_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  unique (notification_id, subscription_id)
);

alter table public.push_queue enable row level security;

create index push_queue_available_idx on public.push_queue (available_at)
where
  attempts < 5;

grant all on public.push_queue,
public.push_subscriptions to service_role;

revoke all on public.push_queue
from
  anon,
  authenticated;

create function public.enqueue_push () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  insert into public.push_queue(notification_id, subscription_id)
  select new.id, s.id from public.push_subscriptions s where s.user_id = new.user_id
  on conflict do nothing;
  return new;
end;
$$;

create trigger notification_web_push
after insert on public.notifications for each row
execute function public.enqueue_push ();

create function public.notify_new_ticket () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  insert into public.notifications(user_id, ticket_id, title, message)
  select p.id, new.id, 'Novo chamado', 'Um novo chamado aguarda atendimento.'
  from public.profiles p where p.is_active and p.role::text in ('admin', 'atendente')
  and p.id <> new.created_by;
  return new;
end;
$$;

create trigger ticket_created_notification
after insert on public.tickets for each row
execute function public.notify_new_ticket ();

-- Claims are leased so a failed invocation is retried by the next scheduled run.
create function public.claim_push_jobs () returns table (
  job_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text
) language sql security definer
set
  search_path = '' as $$
  with candidates as (
    select q.id from public.push_queue q
    join public.notifications n on n.id = q.notification_id
    join public.push_subscriptions s on s.id = q.subscription_id and s.user_id = n.user_id
    join public.profiles p on p.id = s.user_id
    join public.tickets t on t.id = n.ticket_id
    where q.available_at <= now() and q.attempts < 5
      and p.is_active and not p.must_change_password
      and (p.role::text in ('admin', 'atendente') or t.created_by = p.id)
      and (n.title <> 'Nova nota interna' or p.role::text in ('admin', 'atendente'))
      and n.created_at > now() - interval '1 day'
    order by q.available_at limit 10 for update of q skip locked
  ), claimed as (
    update public.push_queue q set attempts = attempts + 1,
      available_at = now() + interval '5 minutes'
    from candidates c where q.id = c.id returning q.id, q.subscription_id
  )
  select c.id, s.id, s.endpoint, s.p256dh, s.auth
  from claimed c join public.push_subscriptions s on s.id = c.subscription_id;
$$;

revoke all on function public.claim_push_jobs ()
from
  public,
  anon,
  authenticated;

grant
execute on function public.claim_push_jobs () to service_role;

revoke all on function public.enqueue_push ()
from
  public,
  anon,
  authenticated;

revoke all on function public.notify_new_ticket ()
from
  public,
  anon,
  authenticated;
