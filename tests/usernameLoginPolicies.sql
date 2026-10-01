-- Run with psql against a disposable Supabase database after schema.sql and migrations.
-- The transaction rolls back all rate-limit fixtures. Never run against production.
begin;

do $$
declare
  lookup_function regprocedure := to_regprocedure('public.auth_user_id_for_username(text)');
  rate_function regprocedure := to_regprocedure(
    'public.consume_username_login_attempt(text,integer,integer)'
  );
begin
  if to_regprocedure('public.auth_email_for_username(text)') is not null then
    raise exception 'The anonymous email lookup RPC must be removed';
  end if;
  if lookup_function is null or not has_function_privilege('service_role', lookup_function, 'EXECUTE') then
    raise exception 'The private username lookup must be callable by service_role';
  end if;
  if has_function_privilege('anon', lookup_function, 'EXECUTE')
     or has_function_privilege('authenticated', lookup_function, 'EXECUTE') then
    raise exception 'Client roles must not execute the private username lookup';
  end if;
  if rate_function is null or not has_function_privilege('service_role', rate_function, 'EXECUTE') then
    raise exception 'The rate-limit RPC must be callable by service_role';
  end if;
  if has_function_privilege('anon', rate_function, 'EXECUTE')
     or has_function_privilege('authenticated', rate_function, 'EXECUTE') then
    raise exception 'Client roles must not execute the rate-limit RPC';
  end if;
  if has_table_privilege('anon', 'public.username_login_rate_limits', 'SELECT')
     or has_table_privilege('anon', 'public.username_login_rate_limits', 'INSERT')
     or has_table_privilege('anon', 'public.username_login_rate_limits', 'UPDATE')
     or has_table_privilege('anon', 'public.username_login_rate_limits', 'DELETE')
     or has_table_privilege('authenticated', 'public.username_login_rate_limits', 'SELECT')
     or has_table_privilege('authenticated', 'public.username_login_rate_limits', 'INSERT')
     or has_table_privilege('authenticated', 'public.username_login_rate_limits', 'UPDATE')
     or has_table_privilege('authenticated', 'public.username_login_rate_limits', 'DELETE') then
    raise exception 'Client roles must not access login rate-limit buckets';
  end if;
  if not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.username_login_rate_limits'::regclass
  ) then
    raise exception 'The rate-limit table must have RLS enabled';
  end if;
end;
$$;

set
  local role service_role;

do $$
declare
  result record;
begin
  select * into result
  from public.consume_username_login_attempt(repeat('a', 64), 2, 60);
  if not result.allowed then
    raise exception 'The first attempt must be allowed';
  end if;

  select * into result
  from public.consume_username_login_attempt(repeat('a', 64), 2, 60);
  if not result.allowed then
    raise exception 'The second attempt must be allowed';
  end if;

  select * into result
  from public.consume_username_login_attempt(repeat('a', 64), 2, 60);
  if result.allowed or result.retry_after_seconds < 1 then
    raise exception 'Attempts over the configured limit must be blocked';
  end if;
end;
$$;

reset role;

set
  local role anon;

do $$
begin
  begin
    perform * from public.auth_user_id_for_username('synthetic-user');
    raise exception 'anon must not execute the private username lookup';
  exception when insufficient_privilege then
    null;
  end;

  begin
    perform * from public.consume_username_login_attempt(repeat('b', 64), 2, 60);
    raise exception 'anon must not execute the rate-limit RPC';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;

rollback;
