create table public.push_public_config (
  singleton boolean primary key default true check (singleton),
  vapid_public_key text not null
);

alter table public.push_public_config enable row level security;

revoke all on public.push_public_config
from
  anon,
  authenticated;

grant
select
  on public.push_public_config to authenticated;

grant all on public.push_public_config to service_role;

create policy push_config_read on public.push_public_config for
select
  to authenticated using (true);

create extension if not exists pg_cron;

create extension if not exists pg_net
with
  schema extensions;

-- The scheduled command contains only a function call, never the dispatch secret.
create function public.dispatch_push_queue () returns void language plpgsql security definer
set
  search_path = '' as $$
declare dispatch_url text; dispatch_secret text;
begin
  select decrypted_secret into dispatch_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if dispatch_url is null or dispatch_secret is null then return; end if;
  perform net.http_post(
    url := dispatch_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || dispatch_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  delete from public.push_queue q using public.notifications n
  where q.notification_id = n.id and (n.created_at < now() - interval '1 day' or q.attempts >= 5 and q.available_at < now());
end;
$$;

revoke all on function public.dispatch_push_queue ()
from
  public,
  anon,
  authenticated;

grant
execute on function public.dispatch_push_queue () to service_role;
