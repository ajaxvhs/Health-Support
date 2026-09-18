create or replace function public.enqueue_push () returns trigger language plpgsql security definer
set
  search_path = '' as $$
begin
  insert into public.push_queue(notification_id, subscription_id)
  select new.id, s.id
  from public.push_subscriptions s
  where s.user_id = new.user_id
  on conflict do nothing;

  -- Dispatch immediately; the scheduled job remains a retry safety net.
  perform public.dispatch_push_queue();
  return new;
end;
$$;

revoke all on function public.enqueue_push ()
from
  public,
  anon,
  authenticated;
