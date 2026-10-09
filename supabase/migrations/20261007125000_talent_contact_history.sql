begin;
create or replace function public.read_talent_contact_history_v1(
  p_talent_id uuid,p_limit integer default 5,p_before_id uuid default null,
  p_query text default null,p_refs uuid[] default null
) returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
with selected as (
  select p.id,p.created_at,p.role_id,p.metadata,
    case when p.kind='matching_clarification_sent' then p.text
      when p_refs is not null and sent.body is not null then sent.body
      else coalesce('Previously asked topic: '||(p.metadata->>'reevaluationTopic'),p.text) end as text,
    row_number() over(order by p.created_at desc,p.id desc) as ordinal
  from public.talent_progress p
  left join lateral (
    select delivery.payload#>>'{emailPayload,textBody}' as body
    from public.talent_opportunity_delivery delivery
    where p_refs is not null and p.kind='internal_fit_question_asked'
      and delivery.talent_id=p.talent_id
      and delivery.discovery_run_id::text=p.metadata->>'discoveryRunId'
      and delivery.channel='email' and delivery.status='sent'
    order by delivery.sent_at desc limit 1
  ) sent on true
  where p.talent_id=p_talent_id and p.kind in ('matching_clarification_sent','internal_fit_question_asked')
    and (p_refs is null or p.id=any(p_refs[1:3]))
    and (p_before_id is null or (p.created_at,p.id)<(
      select created_at,id from public.talent_progress where id=p_before_id and talent_id=p_talent_id))
    and (nullif(p_query,'') is null or concat_ws(' ',p.text,p.metadata->>'reevaluationTopic') ilike '%'||replace(replace(replace(p_query,'\','\\'),'%','\%'),'_','\_')||'%')
  order by p.created_at desc,p.id desc limit case when p_refs is null then least(greatest(p_limit,1),20)+1 else 4 end
), visible as (
  select * from selected where ordinal<=case when p_refs is null then least(greatest(p_limit,1),20) else 3 end
)
select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object(
 'ref',id,'sentAt',created_at,'question',case when p_refs is null then left(text,180) else left(text,8000) end,
 'truncated',length(text)>case when p_refs is null then 180 else 8000 end,
 'roleIds',case when p_refs is null then null else coalesce(metadata->'coveredRoleIds',jsonb_build_array(role_id)) end,
 'channel',metadata->>'sentChannel') order by created_at desc,id desc) from visible),'[]'::jsonb),
 'nextCursor',case when (select count(*) from selected)>(select count(*) from visible)
   then (select id::text from visible order by created_at,id limit 1) else null end,
 'meaning','These are actual questions sent by Harper, not proof of an answer. Read exact refs if the current reply needs older scope; save only user-confirmed facts through write_talent_context, preserving one-role exceptions in the Brief.')
$$;
revoke all on function public.read_talent_contact_history_v1(uuid,integer,uuid,text,uuid[]) from public,anon,authenticated;
grant execute on function public.read_talent_contact_history_v1(uuid,integer,uuid,text,uuid[]) to service_role;
commit;
