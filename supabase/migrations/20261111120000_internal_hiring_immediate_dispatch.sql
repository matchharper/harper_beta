-- pg_net starts the HTTP request only after the business transaction commits.
-- The five-minute cron is recovery only, never the normal delivery clock.
create extension if not exists pg_net;

alter table public.internal_hiring_notifications
  add column dispatch_token uuid not null default gen_random_uuid(),
  add column dispatch_request_id bigint;

create function public.dispatch_internal_hiring_notification()
returns trigger language plpgsql security definer set search_path='' as $$
declare request_id bigint;
begin
  -- A per-event capability authorizes only this already-saved notification.
  -- No shared secret/config sync, candidate facts or Slack token in the request.
  request_id:=net.http_post(
    url:='https://matchharper.com/api/internal/slack/hiring-notification',
    body:=jsonb_build_object('id',new.id,'token',new.dispatch_token),
    headers:='{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds:=20000
  );
  update public.internal_hiring_notifications set dispatch_request_id=request_id where id=new.id;
  return new;
exception when others then
  -- Preserve the committed business event and let recovery retry a missed dispatch.
  update public.internal_hiring_notifications set last_error='immediate_dispatch_enqueue_failed' where id=new.id;
  return new;
end $$;
revoke all on function public.dispatch_internal_hiring_notification() from public,anon,authenticated;
create trigger internal_hiring_immediate_dispatch after insert on public.internal_hiring_notifications
  for each row execute function public.dispatch_internal_hiring_notification();
