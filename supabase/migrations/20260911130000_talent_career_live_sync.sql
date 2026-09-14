begin;

drop policy if exists "talent can receive own career live sync"
  on realtime.messages;

create policy "talent can receive own career live sync"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) =
    'talent-career:' || (select auth.uid())::text
);

create or replace function public.broadcast_talent_career_live_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text;
  v_talent_id uuid;
begin
  if tg_table_name = 'talent_messages' then
    if coalesce(new.role, '') <> 'assistant' then
      return new;
    end if;
    v_talent_id := new.user_id;
    v_scope := 'messages';
  elsif tg_table_name = 'talent_opportunity_recommendation' then
    v_talent_id := new.talent_id;
    v_scope := 'opportunities';
  elsif tg_table_name = 'opportunity_discovery_run' then
    if tg_op = 'UPDATE'
       and new.status is not distinct from old.status
       and new.completed_at is not distinct from old.completed_at then
      return new;
    end if;
    v_talent_id := new.talent_id;
    v_scope := 'runs';
  end if;

  if v_talent_id is not null then
    perform realtime.send(
      pg_catalog.jsonb_build_object('scope', v_scope),
      'career_changed',
      'talent-career:' || v_talent_id::text,
      true
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.broadcast_talent_career_live_sync()
  from public, anon, authenticated;

drop trigger if exists talent_messages_career_live_sync
  on public.talent_messages;
create trigger talent_messages_career_live_sync
after insert on public.talent_messages
for each row
execute function public.broadcast_talent_career_live_sync();

drop trigger if exists talent_recommendations_career_live_sync
  on public.talent_opportunity_recommendation;
create trigger talent_recommendations_career_live_sync
after insert on public.talent_opportunity_recommendation
for each row
execute function public.broadcast_talent_career_live_sync();

drop trigger if exists opportunity_runs_career_live_sync
  on public.opportunity_discovery_run;
create trigger opportunity_runs_career_live_sync
after insert or update of status, completed_at
on public.opportunity_discovery_run
for each row
execute function public.broadcast_talent_career_live_sync();

commit;
