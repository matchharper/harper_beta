begin;

-- Wake a local listener when durable calibration work becomes actionable.
-- The payload intentionally contains only queue identity/state. The listener
-- always re-reads company_role_calibrations and claims through the existing
-- security-definer helper before any work starts.
create or replace function public.notify_company_role_calibration_work_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_is_work boolean;
  v_changed boolean;
begin
  v_is_work := (
    new.status = 'queued'
    or (
      new.status = 'ready'
      and coalesce(new.payload->'delivery'->>'status', 'pending') <> 'sent'
    )
  );

  if not v_is_work then
    return new;
  end if;

  v_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    v_changed := (
      old.status is distinct from new.status
      or old.available_at is distinct from new.available_at
      or old.payload->'delivery' is distinct from new.payload->'delivery'
    );
  end if;

  if v_changed then
    perform pg_notify(
      'harper_company_role_calibration_work',
      jsonb_build_object(
        'calibrationId', new.id,
        'status', new.status,
        'availableAt', new.available_at
      )::text
    );
  end if;

  return new;
end;
$$;

drop trigger if exists company_role_calibrations_notify_work_v1
  on public.company_role_calibrations;
create trigger company_role_calibrations_notify_work_v1
after insert or update of status, available_at, payload
on public.company_role_calibrations
for each row
execute function public.notify_company_role_calibration_work_v1();

comment on function public.notify_company_role_calibration_work_v1() is
  'Emits a non-sensitive queue-only wake hint for local Codex; company_role_calibrations remains authoritative.';

commit;
