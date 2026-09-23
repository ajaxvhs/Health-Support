-- Run with psql against a disposable Supabase database after schema.sql and migrations.
-- All fixtures are synthetic and rolled back. Never run against production.
begin;

select
  set_config(
    'test.profile_user',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.inactive_user',
    gen_random_uuid()::text,
    true
  );

select
  set_config(
    'test.profile_unit',
    gen_random_uuid()::text,
    true
  );

insert into
  public.units (id, name, code)
values
  (
    current_setting('test.profile_unit')::uuid,
    'Profile test unit',
    'PROFILE-TEST'
  );

insert into
  auth.users (id)
values
  (current_setting('test.profile_user')::uuid),
  (current_setting('test.inactive_user')::uuid);

insert into
  public.profiles (
    id,
    username,
    full_name,
    phone,
    default_unit_id,
    is_active,
    must_change_password
  )
values
  (
    current_setting('test.profile_user')::uuid,
    current_setting('test.profile_user'),
    'Before',
    '111',
    current_setting('test.profile_unit')::uuid,
    true,
    false
  ),
  (
    current_setting('test.inactive_user')::uuid,
    current_setting('test.inactive_user'),
    'Inactive',
    '222',
    current_setting('test.profile_unit')::uuid,
    false,
    false
  );

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.profile_user'),
    true
  );

set
  local role authenticated;

do $$
declare
  affected integer;
begin
  if not public.update_own_profile('  Updated Name  ', '  333  ') then
    raise exception 'Own profile update did not return success';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and full_name = 'Updated Name' and phone = '333'
  ) then
    raise exception 'Own profile fields were not trimmed and updated';
  end if;

  update public.profiles set role = 'admin' where id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'Direct role update must remain blocked by RLS';
  end if;

  begin
    perform public.update_own_profile('   ', '444');
    raise exception 'Blank name should be rejected';
  exception when sqlstate '22023' then null;
  end;
end;
$$;

reset role;

select
  set_config(
    'request.jwt.claim.sub',
    current_setting('test.inactive_user'),
    true
  );

set
  local role authenticated;

do $$
begin
  begin
    perform public.update_own_profile('Inactive', '555');
    raise exception 'Inactive profile update should be rejected';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

set
  local role anon;

do $$
begin
  begin
    perform public.update_own_profile('Anonymous', '666');
    raise exception 'Anonymous profile update should be rejected';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
