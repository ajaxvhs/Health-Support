create or replace function public.lock_profile_admin_state () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(741205, 27);
  return null;
end;
$$;

revoke all on function public.lock_profile_admin_state ()
from
  public,
  anon,
  authenticated,
  service_role;

create or replace function public.guard_last_active_admin_delete () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  active_admin_count bigint;
begin
  if old.role::text = 'admin' and old.is_active and not old.must_change_password then
    perform pg_catalog.pg_advisory_xact_lock(741205, 27);
    select count(*) into active_admin_count
    from public.profiles
    where role::text = 'admin' and is_active and not must_change_password;

    if active_admin_count <= 1 then
      raise exception using
        errcode = '23514',
        message = 'At least one active administrator must remain.';
    end if;
  end if;
  return old;
end;
$$;

revoke all on function public.guard_last_active_admin_delete ()
from
  public,
  anon,
  authenticated,
  service_role;

create or replace function public.ensure_active_admin_remains () returns trigger language plpgsql security definer
set
  search_path = '' as $$
declare
  removes_active_admin boolean := false;
  active_admin_count bigint;
begin
  if tg_op = 'UPDATE' then
    select exists (
      select 1
      from old_profiles old_profile
      join new_profiles new_profile using (id)
      where old_profile.role::text = 'admin'
        and old_profile.is_active
        and not old_profile.must_change_password
        and (
          new_profile.role::text is distinct from 'admin'
          or not new_profile.is_active
          or new_profile.must_change_password
        )
    ) into removes_active_admin;
  elsif tg_op = 'DELETE' then
    select exists (
      select 1 from old_profiles
      where role::text = 'admin' and is_active and not must_change_password
    ) into removes_active_admin;
  end if;

  if removes_active_admin then
    select count(*) into active_admin_count
    from public.profiles
    where role::text = 'admin' and is_active and not must_change_password;

    if active_admin_count < 1 then
      raise exception using
        errcode = '23514',
        message = 'At least one active administrator must remain.';
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.ensure_active_admin_remains ()
from
  public,
  anon,
  authenticated,
  service_role;

drop trigger if exists profiles_lock_admin_state_update on public.profiles;

create trigger profiles_lock_admin_state_update
before update of role,
is_active,
must_change_password on public.profiles for each statement
execute function public.lock_profile_admin_state ();

drop trigger if exists profiles_lock_admin_state_delete on public.profiles;

create trigger profiles_lock_admin_state_delete
before delete on public.profiles for each statement
execute function public.lock_profile_admin_state ();

drop trigger if exists profiles_guard_last_admin_delete on public.profiles;

create trigger profiles_guard_last_admin_delete
before delete on public.profiles for each row
execute function public.guard_last_active_admin_delete ();

drop trigger if exists profiles_check_last_admin_update on public.profiles;

create trigger profiles_check_last_admin_update
after update on public.profiles referencing old table as old_profiles new table as new_profiles for each statement
execute function public.ensure_active_admin_remains ();

drop trigger if exists profiles_check_last_admin_delete on public.profiles;

create trigger profiles_check_last_admin_delete
after delete on public.profiles referencing old table as old_profiles for each statement
execute function public.ensure_active_admin_remains ();

drop policy if exists profile_admin_insert on public.profiles;

drop policy if exists profile_admin_update on public.profiles;

drop policy if exists profile_admin_delete on public.profiles;

revoke insert,
update,
delete on public.profiles
from
  anon,
  authenticated;
