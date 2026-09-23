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
    and is_active = true
  returning id into updated_profile_id;

  if updated_profile_id is null then
    raise exception using errcode = '42501', message = 'Perfil indisponível para atualização.';
  end if;

  return true;
end;
$$;

revoke all on function public.update_own_profile (text, text)
from
  public,
  anon;

grant
execute on function public.update_own_profile (text, text) to authenticated;
