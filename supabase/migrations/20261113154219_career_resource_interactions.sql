create function career_wrap_legacy_opportunity_v1(p_user uuid,p_recommendation uuid) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare r talent_opportunity_recommendation; role company_roles; title text; output uuid; previous uuid; facts jsonb; canonical uuid;
begin
 select * into r from talent_opportunity_recommendation where id=p_recommendation and talent_id=p_user;
 if not found then raise exception 'Opportunity unavailable'; end if;
 canonical:=current_talent_recommendation_id_v1(p_recommendation);
 perform pg_advisory_xact_lock(hashtextextended('career-role-opportunity:'||p_user::text||':'||r.role_id::text,0));
 select id into output from career_opportunities where talent_id=p_user and recommendation_id=canonical for update;
 select id into previous from career_opportunities where talent_id=p_user and recommendation_id=p_recommendation for update;
 if output is not null then
  if previous is not null and previous<>output then
   update career_opportunities set recommendation_id=null,merged_into_id=output,revision=revision+1,updated_at=now() where id=previous;
  end if;
  return output;
 end if;
 if previous is not null then
  update career_opportunities set recommendation_id=canonical,revision=revision+1,updated_at=now() where id=previous;
  return previous;
 end if;
 select * into r from talent_opportunity_recommendation where id=canonical and talent_id=p_user;
 if not found then raise exception 'Opportunity unavailable';end if;
 select id into output from career_opportunities where talent_id=p_user and recommendation_id is not null
  and current_talent_recommendation_id_v1(recommendation_id)=canonical and merged_into_id is null and deleted_at is null for update;
 if found then
  update career_opportunities set recommendation_id=canonical,revision=revision+1,updated_at=now() where id=output;
  return output;
 end if;
 if not career_resource_available_v1(p_user,jsonb_build_object('kind','role','id',r.role_id::text)) then raise exception 'Opportunity unavailable'; end if;
 select * into role from company_roles where role_id=r.role_id;
 if role.source_type='internal' then
  facts:=read_career_internal_role_v1(p_user,r.role_id);
  title:=coalesce(facts->>'name',facts->'publicPostings'->0->>'name','Career opportunity');
 else title:=coalesce(role.name,'Career opportunity'); end if;
 insert into career_opportunities(talent_id,primary_ref,title,body,recommendation_id,published_at,display_order)
 values(p_user,jsonb_build_object('kind','role','id',r.role_id::text),title,coalesce(r.fit_summary,''),r.id,r.recommended_at,coalesce(r.rank,0)) returning id into output;
 return output;
end $$;

create function career_list_opportunities_v1(p_user uuid,p_saved boolean,p_archived boolean,p_offset integer,p_limit integer,p_unbound boolean default false)
returns table(id uuid,total_count bigint) language sql stable security invoker set search_path=public,pg_temp as $$
 select o.id,count(*) over() from career_opportunities o left join talent_opportunity_recommendation r on r.id=o.recommendation_id and r.talent_id=o.talent_id
 where o.talent_id=p_user and o.deleted_at is null and o.merged_into_id is null and (not p_unbound or o.recommendation_id is null)
  and ((p_archived and o.archived_at is not null) or (not p_archived and o.archived_at is null))
  and (p_saved is null or p_saved=(case when o.recommendation_id is null then o.saved_at is not null
    else r.saved_stage is not null and r.saved_stage<>'hidden' end))
 order by o.display_order,o.id offset p_offset limit p_limit
$$;

create function career_resource_interaction_v1(p_user uuid,p_conversation uuid,p_request text,p_kind text,p_id uuid,p_revision bigint,p_action text,p_selection jsonb,p_message text,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare existing talent_external_operations; v career_views; o career_opportunities; action jsonb; body text; admitted jsonb; selected career_result_sets;
begin
 perform pg_advisory_xact_lock(hashtextextended('career-interaction:'||p_user||':'||p_request,0));
 select * into existing from talent_external_operations where user_id=p_user and kind='resource_interaction' and idempotency_key='resource-interaction:'||p_request;
 if found then return existing.result; end if;
 if p_kind='view' then
  select * into v from career_views where id=p_id and talent_id=p_user and archived_at is null for update;
  if not found then raise exception 'View unavailable'; end if;
  if v.revision<>p_revision then raise exception 'View revision conflict' using errcode='40001'; end if;
  select b->'action' into action from jsonb_array_elements(v.definition->'blocks') b where b->'action'->>'id'=p_action;
 elsif p_kind='opportunity' then
  select * into o from career_opportunities where id=p_id and talent_id=p_user and deleted_at is null and merged_into_id is null for update;
  if not found then raise exception 'Opportunity unavailable'; end if;
  if o.revision<>p_revision then raise exception 'Opportunity revision conflict' using errcode='40001'; end if;
  if not career_resource_available_v1(p_user,o.primary_ref) then raise exception 'Source unavailable'; end if;
  action:=o.presentation->'action';
 else raise exception 'Unsupported interaction resource'; end if;
 if action is null or action->>'id' is distinct from p_action or action->>'request' is null then raise exception 'Action unavailable'; end if;
 if p_selection is not null then
  select * into selected from career_result_sets where id::text=p_selection->>'setId' and revision::text=p_selection->>'revision' and talent_id=p_user;
  if not found then raise exception 'Selection unavailable'; end if;
  if exists(select 1 from career_result_items i where i.set_id=selected.id and i.set_revision=selected.revision
    and (not career_resource_available_v1(p_user,i.resource_ref) or (i.evaluation_ref is not null and not career_resource_available_v1(p_user,i.evaluation_ref))))
    then raise exception 'Selection source unavailable'; end if;
 end if;
 body:=action->>'request'||case when coalesce(p_message,'')='' then '' else E'\n\n'||p_message end;
 admitted:=admit_career_request(p_user,p_conversation,body,'chat',coalesce(p_payload,'{}')||jsonb_build_object(
  'clientRequestId',p_request,'careerResourceInteraction',jsonb_build_object('kind',p_kind,'id',p_id,'revision',p_revision,'action',action,
   'selectionRef',p_selection,'sourceRefs',case when p_kind='opportunity' then jsonb_build_array(o.primary_ref)||o.related_refs||o.evidence_refs else '[]'::jsonb end)),null);
 insert into talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
 values(p_user,p_conversation,'resource_interaction','resource-interaction:'||p_request,'completed',jsonb_build_object('resourceKind',p_kind,'resourceId',p_id,'revision',p_revision,'selectionRef',p_selection),admitted);
 return admitted;
end $$;
revoke all on function career_wrap_legacy_opportunity_v1(uuid,uuid),career_list_opportunities_v1(uuid,boolean,boolean,integer,integer,boolean),
 career_resource_interaction_v1(uuid,uuid,text,text,uuid,bigint,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function career_wrap_legacy_opportunity_v1(uuid,uuid),career_list_opportunities_v1(uuid,boolean,boolean,integer,integer,boolean),
 career_resource_interaction_v1(uuid,uuid,text,text,uuid,bigint,text,jsonb,text,jsonb) to service_role;
