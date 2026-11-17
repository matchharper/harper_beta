-- One active private import per owner/connection. A replaced attempt cannot write Memory.
create or replace function public.claim_gmail_history_run_v1(
  p_talent_id uuid, p_connection_version timestamptz, p_initial_import boolean
) returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.logs%rowtype;
  fresh boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('gmail-history:' || p_talent_id::text, 0));
  perform 1 from public.talent_integrations where talent_id=p_talent_id and provider='gmail'
    and status='active' and updated_at=p_connection_version for share;
  if not found then raise exception 'Gmail connection was replaced'; end if;
  select * into r from public.logs where user_id=p_talent_id and type='gmail_career_history_analysis_run'
    order by id desc limit 1;
  fresh := (r.meta_data->>'updatedAt')::timestamptz > now() - interval '10 minutes';
  if (r.meta_data->>'connectionVersion')::timestamptz = p_connection_version
     and ((fresh and r.meta_data->>'status' in ('queued','running','retrying'))
          or (p_initial_import and r.meta_data->>'status' = 'completed')) then
    return jsonb_build_object('id',r.id,'createdAt',r.created_at,'status',r.meta_data->>'status','created',false);
  end if;
  insert into public.logs(user_id,type,meta_data) values(p_talent_id,'gmail_career_history_analysis_run',
    jsonb_build_object('status','queued','updatedAt',now(),'connectionVersion',p_connection_version))
    returning * into r;
  return jsonb_build_object('id',r.id,'createdAt',r.created_at,'status','queued','created',true);
end $$;

create or replace function public.advance_gmail_history_run_v1(
  p_talent_id uuid, p_run_id bigint, p_status text, p_attempt integer, p_reason text
) returns boolean language plpgsql set search_path = '' as $$
declare
  r public.logs%rowtype;
  active_attempt integer;
  connection_version timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('gmail-history:' || p_talent_id::text, 0));
  select * into r from public.logs where user_id=p_talent_id and type='gmail_career_history_analysis_run'
    order by id desc limit 1;
  if r.id is distinct from p_run_id or r.meta_data->>'status' in ('completed','failed') then return false; end if;
  active_attempt := coalesce((r.meta_data->>'deliveryCount')::integer,0);
  if p_status = 'running' then
    if active_attempt >= p_attempt then return false; end if;
  elsif p_status not in ('completed','failed','retrying') or active_attempt <> p_attempt then
    return false;
  end if;
  connection_version := (r.meta_data->>'connectionVersion')::timestamptz;
  if connection_version is null then
    select updated_at into connection_version from public.talent_integrations where talent_id=p_talent_id and provider='gmail' and status='active';
  end if;
  update public.logs set meta_data = r.meta_data || jsonb_strip_nulls(jsonb_build_object(
    'status',p_status,'updatedAt',now(),'deliveryCount',p_attempt,'reason',p_reason,'connectionVersion',connection_version)) where id=r.id;
  return true;
end $$;

create or replace function public.apply_gmail_history_memories_v1(
  p_talent_id uuid, p_run_id bigint, p_attempt integer, p_connection_version timestamptz,
  p_request_id text, p_changes jsonb
) returns jsonb language plpgsql as $$
declare r public.logs%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('gmail-history:' || p_talent_id::text, 0));
  select * into r from public.logs where user_id=p_talent_id and type='gmail_career_history_analysis_run'
    order by id desc limit 1;
  if r.id is distinct from p_run_id or r.meta_data->>'status' <> 'running'
     or (r.meta_data->>'deliveryCount')::integer is distinct from p_attempt
     or (r.meta_data->>'connectionVersion')::timestamptz is distinct from p_connection_version then
    raise exception 'Gmail import superseded';
  end if;
  perform 1 from public.talent_integrations where talent_id=p_talent_id and provider='gmail'
    and status='active' and updated_at=p_connection_version for share;
  if not found then raise exception 'Gmail import superseded'; end if;
  if jsonb_array_length(p_changes)=0 then return jsonb_build_object('applied','[]'::jsonb); end if;
  return public.mutate_talent_contexts(p_talent_id => p_talent_id, p_changes => p_changes, p_request_id => p_request_id);
end $$;

revoke all on function public.claim_gmail_history_run_v1(uuid,timestamptz,boolean),
  public.advance_gmail_history_run_v1(uuid,bigint,text,integer,text),
  public.apply_gmail_history_memories_v1(uuid,bigint,integer,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.claim_gmail_history_run_v1(uuid,timestamptz,boolean),
  public.advance_gmail_history_run_v1(uuid,bigint,text,integer,text),
  public.apply_gmail_history_memories_v1(uuid,bigint,integer,timestamptz,text,jsonb) to service_role;
