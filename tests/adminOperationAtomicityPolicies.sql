-- Run with psql against a disposable Supabase database after all migrations.
-- Fixtures are synthetic and rolled back. Never run against production.
begin;

select
  set_config('test.admin_a', gen_random_uuid()::text, true);

select
  set_config('test.admin_b', gen_random_uuid()::text, true);

select
  set_config(
    'test.pending_admin',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.admin_a_name',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.admin_b_name',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.pending_admin_name',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.admin_unit',
    (
      select
        id::text
      from
        public.units
      where
        is_active
      order by
        id
      limit
        1
    ),
    true
  );

insert into
  auth.users (id)
values
  (current_setting('test.admin_a')::uuid),
  (current_setting('test.admin_b')::uuid),
  (current_setting('test.pending_admin')::uuid);

insert into
  public.profiles (
    id,
    username,
    full_name,
    phone,
    role,
    default_unit_id,
    is_active,
    must_change_password
  )
values
  (
    current_setting('test.admin_a')::uuid,
    current_setting('test.admin_a_name'),
    'Admin A',
    '100',
    'admin',
    current_setting('test.admin_unit')::uuid,
    true,
    false
  ),
  (
    current_setting('test.admin_b')::uuid,
    current_setting('test.admin_b_name'),
    'Admin B',
    '200',
    'admin',
    current_setting('test.admin_unit')::uuid,
    true,
    false
  ),
  (
    current_setting('test.pending_admin')::uuid,
    current_setting('test.pending_admin_name'),
    'Pending Admin',
    '300',
    'admin',
    current_setting('test.admin_unit')::uuid,
    true,
    true
  );

-- Keep only two effective admins; a password-pending admin does not count.
update public.profiles
set
  is_active = false
where
  role::text = 'admin'
  and is_active
  and not must_change_password
  and id not in (
    current_setting('test.admin_a')::uuid,
    current_setting('test.admin_b')::uuid,
    current_setting('test.pending_admin')::uuid
  );

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.admin_a'),
    true
  );

set
  local role authenticated;

do $$
declare
  affected integer;
begin
  begin
    update public.profiles
    set role = 'solicitante'
    where id = current_setting('test.admin_b')::uuid;
    get diagnostics affected = row_count;
    if affected <> 0 then
      raise exception 'Authenticated admins must not directly change profile roles';
    end if;
  exception when insufficient_privilege then null;
  end;

  begin
    delete from public.profiles where id = current_setting('test.admin_b')::uuid;
    raise exception 'Authenticated admins must not directly delete profiles';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.profiles (
      id, username, full_name, phone, role, default_unit_id, is_active, must_change_password
    ) values (
      gen_random_uuid(), 'direct-profile-insert', 'Blocked insert', '300', 'admin',
      current_setting('test.admin_unit')::uuid, true, false
    );
    raise exception 'Authenticated admins must not directly insert profiles';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

do $$
declare
  active_admin_count bigint;
begin
  begin
    update public.profiles
    set is_active = false
    where id in (
      current_setting('test.admin_a')::uuid,
      current_setting('test.admin_b')::uuid
    );
    raise exception 'A bulk write must not deactivate every active administrator';
  exception when check_violation then null;
  end;

  select count(*) into active_admin_count
  from public.profiles
  where role::text = 'admin' and is_active and not must_change_password;
  if active_admin_count <> 2 then
    raise exception 'The rejected bulk write changed the active admin count';
  end if;
end;
$$;

update public.profiles
set
  is_active = false
where
  id = current_setting('test.admin_a')::uuid;

do $$
begin
  begin
    delete from auth.users where id = current_setting('test.admin_b')::uuid;
    raise exception 'Deleting the last active admin must be rejected';
  exception when check_violation then null;
  end;

  if not exists (select 1 from auth.users where id = current_setting('test.admin_b')::uuid) then
    raise exception 'The rejected Auth deletion must retain the account';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = current_setting('test.admin_b')::uuid and is_active and role::text = 'admin'
  ) then
    raise exception 'The rejected Auth deletion must retain the active admin profile';
  end if;
end;
$$;

rollback;
