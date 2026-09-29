create or replace function public.is_staff () returns boolean language sql stable security definer
set
  search_path = '' as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active
      and not must_change_password
      and role::text = 'admin'
  );
$$;

create or replace function public.is_admin () returns boolean language sql stable security definer
set
  search_path = '' as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active
      and not must_change_password
      and role::text = 'admin'
  );
$$;

create or replace function public.is_active_user () returns boolean language sql stable security definer
set
  search_path = '' as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active
      and not must_change_password
  );
$$;

create or replace function public.update_own_profile (p_full_name text, p_phone text) returns boolean language plpgsql security definer
set
  search_path = '' as $$
declare
  updated_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sessão expirada.';
  end if;

  if p_full_name is null or pg_catalog.btrim(p_full_name) = '' then
    raise exception using errcode = '22023', message = 'Informe o nome completo.';
  end if;

  if p_phone is null or pg_catalog.btrim(p_phone) = '' then
    raise exception using errcode = '22023', message = 'Informe o telefone.';
  end if;

  update public.profiles
  set full_name = pg_catalog.btrim(p_full_name),
      phone = pg_catalog.btrim(p_phone)
  where id = auth.uid()
    and is_active
    and not must_change_password
  returning id into updated_profile_id;

  if updated_profile_id is null then
    raise exception using errcode = '42501', message = 'Perfil indisponível para atualização.';
  end if;

  return true;
end;
$$;

drop function if exists public.mark_password_changed ();

create or replace function public.sync_password_change_profile () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  if new.encrypted_password is distinct from old.encrypted_password then
    update public.profiles
    set must_change_password = coalesce(new.raw_app_meta_data ->> 'force_password_change', 'false') = 'true'
    where id = new.id
      and is_active;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_password_change_profile ()
from
  public,
  anon,
  authenticated;

drop trigger if exists profiles_password_changed on auth.users;

create trigger profiles_password_changed
after update of encrypted_password on auth.users for each row
execute function public.sync_password_change_profile ();

create or replace function public.get_ticket_participants () returns table (id uuid, full_name text) language sql stable security definer
set
  search_path = '' as $$
  select distinct p.id, p.full_name
  from public.profiles p
  where auth.uid() is not null
    and public.is_active_user()
    and exists (
      select 1
      from public.tickets t
      where (public.is_staff() or t.created_by = auth.uid())
        and (
          p.id = t.created_by
          or p.id = t.assigned_to
          or exists (
            select 1
            from public.ticket_messages m
            where m.ticket_id = t.id
              and m.sender_id = p.id
              and (public.is_staff() or not m.is_internal)
          )
          or exists (
            select 1
            from public.ticket_events e
            where e.ticket_id = t.id and e.actor_id = p.id
          )
        )
    );
$$;

drop policy if exists active_catalog_read on public.units;

drop policy if exists active_unit_read on public.units;

create policy active_catalog_read on public.units for
select
  to authenticated using (
    public.is_active_user ()
    and (
      is_active
      or exists (
        select
          1
        from
          public.tickets t
        where
          t.unit_id = units.id
          and (
            public.is_staff ()
            or t.created_by = (
              select
                auth.uid ()
            )
          )
      )
    )
  );

drop policy if exists active_category_read on public.ticket_categories;

create policy active_category_read on public.ticket_categories for
select
  to authenticated using (
    public.is_active_user ()
    and (
      is_active
      or exists (
        select
          1
        from
          public.tickets t
        where
          t.category_id = ticket_categories.id
          and (
            public.is_staff ()
            or t.created_by = (
              select
                auth.uid ()
            )
          )
      )
    )
  );

drop policy if exists active_priority_read on public.ticket_priorities;

create policy active_priority_read on public.ticket_priorities for
select
  to authenticated using (
    public.is_active_user ()
    and (
      is_active
      or exists (
        select
          1
        from
          public.tickets t
        where
          t.priority_id = ticket_priorities.id
          and (
            public.is_staff ()
            or t.created_by = (
              select
                auth.uid ()
            )
          )
      )
    )
  );

drop policy if exists active_status_read on public.ticket_statuses;

create policy active_status_read on public.ticket_statuses for
select
  to authenticated using (
    public.is_active_user ()
    and (
      is_active
      or exists (
        select
          1
        from
          public.tickets t
        where
          t.status_id = ticket_statuses.id
          and (
            public.is_staff ()
            or t.created_by = (
              select
                auth.uid ()
            )
          )
      )
    )
  );

drop policy if exists push_owner on public.push_subscriptions;

create policy push_owner on public.push_subscriptions for all to authenticated using (
  user_id = (
    select
      auth.uid ()
  )
  and public.is_active_user ()
)
with
  check (
    user_id = (
      select
        auth.uid ()
    )
    and public.is_active_user ()
  );

drop policy if exists push_config_read on public.push_public_config;

create policy push_config_read on public.push_public_config for
select
  to authenticated using (public.is_active_user ());

drop policy if exists profile_read on public.profiles;

create policy profile_read on public.profiles for
select
  to authenticated using (
    (
      id = (
        select
          auth.uid ()
      )
      and is_active
    )
    or public.is_staff ()
  );

drop policy if exists ticket_read on public.tickets;

create policy ticket_read on public.tickets for
select
  to authenticated using (
    public.is_active_user ()
    and (
      created_by = (
        select
          auth.uid ()
      )
      or public.is_staff ()
    )
  );

drop policy if exists ticket_active_user_insert on public.tickets;

create policy ticket_active_user_insert on public.tickets for insert to authenticated
with
  check (
    created_by = (
      select
        auth.uid ()
    )
    and public.is_active_user ()
  );

drop policy if exists ticket_staff_update on public.tickets;

create policy ticket_staff_update on public.tickets
for update
  to authenticated using (
    public.is_active_user ()
    and (
      (
        public.is_staff ()
        and (
          public.is_admin ()
          or assigned_to = (
            select
              auth.uid ()
          )
          or assigned_to is null
        )
      )
      or created_by = (
        select
          auth.uid ()
      )
    )
  )
with
  check (
    public.is_active_user ()
    and (
      (
        public.is_staff ()
        and (
          public.is_admin ()
          or assigned_to = (
            select
              auth.uid ()
          )
        )
      )
      or created_by = (
        select
          auth.uid ()
      )
    )
  );

drop policy if exists message_read on public.ticket_messages;

create policy message_read on public.ticket_messages for
select
  to authenticated using (
    public.is_active_user ()
    and (
      public.is_staff ()
      or (
        not is_internal
        and exists (
          select
            1
          from
            public.tickets t
          where
            t.id = ticket_messages.ticket_id
            and t.created_by = (
              select
                auth.uid ()
            )
        )
      )
    )
  );

drop policy if exists message_insert on public.ticket_messages;

create policy message_insert on public.ticket_messages for insert to authenticated
with
  check (
    sender_id = (
      select
        auth.uid ()
    )
    and public.is_active_user ()
    and exists (
      select
        1
      from
        public.tickets t
        join public.ticket_statuses s on s.id = t.status_id
      where
        t.id = ticket_messages.ticket_id
        and s.slug not in ('resolvido', 'fechado')
        and (
          (
            public.is_staff ()
            and (
              public.is_admin ()
              or t.assigned_to = (
                select
                  auth.uid ()
              )
              or t.assigned_to is null
            )
          )
          or (
            not is_internal
            and t.created_by = (
              select
                auth.uid ()
            )
          )
        )
    )
  );

drop policy if exists event_read on public.ticket_events;

create policy event_read on public.ticket_events for
select
  to authenticated using (
    public.is_active_user ()
    and (
      public.is_admin ()
      or exists (
        select
          1
        from
          public.tickets t
        where
          t.id = ticket_events.ticket_id
          and (
            t.created_by = (
              select
                auth.uid ()
            )
            or public.is_staff ()
          )
      )
    )
  );

drop policy if exists notifications_owner_read on public.notifications;

create policy notifications_owner_read on public.notifications for
select
  to authenticated using (
    user_id = (
      select
        auth.uid ()
    )
    and public.is_active_user ()
  );

drop policy if exists notifications_owner_update on public.notifications;

create policy notifications_owner_update on public.notifications
for update
  to authenticated using (
    user_id = (
      select
        auth.uid ()
    )
    and public.is_active_user ()
  )
with
  check (
    user_id = (
      select
        auth.uid ()
    )
    and public.is_active_user ()
  );

drop policy if exists notifications_owner_delete on public.notifications;

create policy notifications_owner_delete on public.notifications for delete to authenticated using (
  user_id = (
    select
      auth.uid ()
  )
  and public.is_active_user ()
);
