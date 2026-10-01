create or replace function public.auth_user_id_for_username (login_username text) returns table (user_id uuid, is_active boolean) language sql stable
set
  search_path = '' as $$
  select profile.id, profile.is_active
  from public.profiles as profile
  where pg_catalog.lower(profile.username) = pg_catalog.lower(pg_catalog.btrim(login_username))
  limit 1;
$$;

revoke all on function public.auth_user_id_for_username (text)
from
  public,
  anon,
  authenticated;

grant
execute on function public.auth_user_id_for_username (text) to service_role;

create table public.username_login_rate_limits (
  bucket_hash text primary key check (bucket_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null
);

alter table public.username_login_rate_limits enable row level security;

revoke all on table public.username_login_rate_limits
from
  public,
  anon,
  authenticated;

grant
select
,
  insert,
update,
delete on table public.username_login_rate_limits to service_role;

create index username_login_rate_limits_updated_at_idx on public.username_login_rate_limits (updated_at);

create or replace function public.consume_username_login_attempt (
  p_bucket_hash text,
  p_max_attempts integer,
  p_window_seconds integer
) returns table (allowed boolean, retry_after_seconds integer) language plpgsql
set
  search_path = '' as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_window timestamptz;
  v_attempts integer;
begin
  if p_bucket_hash is null
     or p_bucket_hash !~ '^[0-9a-f]{64}$'
     or p_max_attempts is null
     or p_max_attempts < 1
     or p_max_attempts > 1000
     or p_window_seconds is null
     or p_window_seconds < 1
     or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'Invalid username login rate-limit parameters.';
  end if;

  insert into public.username_login_rate_limits as rate_limit (
    bucket_hash, window_started_at, attempt_count, updated_at
  ) values (p_bucket_hash, v_now, 1, v_now)
  on conflict (bucket_hash) do update
  set
    window_started_at = case
      when rate_limit.window_started_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
        then v_now
      else rate_limit.window_started_at
    end,
    attempt_count = case
      when rate_limit.window_started_at <= v_now - pg_catalog.make_interval(secs => p_window_seconds)
        then 1
      else rate_limit.attempt_count + 1
    end,
    updated_at = v_now
  returning rate_limit.window_started_at, rate_limit.attempt_count into v_window, v_attempts;

  allowed := v_attempts <= p_max_attempts;
  retry_after_seconds := greatest(
    0,
    ceil(extract(epoch from v_window + pg_catalog.make_interval(secs => p_window_seconds) - v_now))::integer
  );
  return next;

  delete from public.username_login_rate_limits as expired
  where expired.bucket_hash in (
    select stale.bucket_hash
    from public.username_login_rate_limits as stale
    where stale.updated_at < v_now - interval '1 day'
    order by stale.updated_at
    limit 100
  );
end;
$$;

revoke all on function public.consume_username_login_attempt (text, integer, integer)
from
  public,
  anon,
  authenticated;

grant
execute on function public.consume_username_login_attempt (text, integer, integer) to service_role;
