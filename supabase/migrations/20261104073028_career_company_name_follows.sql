-- Company names are durable follow facts even when the directory has no identity.
-- Existing company/workspace keys and rows are preserved. Name keys only dedupe
-- identical trimmed input within a user, not aliases or companies across users.
alter table public.talent_company_follow add column company_name text;
alter table public.talent_company_follow add constraint talent_company_follow_name_identity
 check (scope <> 'name' or (company_name is not null and btrim(company_name) <> ''
   and company_db_id is null and company_workspace_id is null));
alter table public.talent_company_follow drop column scope_key;
alter table public.talent_company_follow add column scope_key text generated always as
 (case when scope='workspace' then 'workspace:'||company_workspace_id::text
       when scope='name' then 'name:'||md5(company_name)
       else 'company:'||company_db_id::text end) stored;
create unique index talent_company_follow_scope on public.talent_company_follow(talent_id,scope_key);

create or replace function public.write_career_company_follow(p_user_id uuid,p_conversation_id uuid,p_request_id text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_company_follow; operation public.talent_external_operations; scope_value text:=coalesce(p_input->>'scope',case when p_input->>'company_workspace_id' is not null then 'workspace' when p_input->>'company_db_id' is not null then 'company' else 'name' end);
 name_value text:=nullif(btrim(p_input->>'company_name'),'');
 db_id bigint:=(p_input->>'company_db_id')::bigint; workspace_id uuid:=(p_input->>'company_workspace_id')::uuid; key_value text; action text:=coalesce(p_input->>'action','follow'); body jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':career_follow:'||p_request_id,0));
 select * into operation from public.talent_external_operations where user_id=p_user_id and kind='career_follow_mutation' and idempotency_key=p_request_id;
 if found then return operation.result; end if;
 if p_conversation_id is not null and not exists(select 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id) then raise exception 'Conversation unavailable'; end if;
 if scope_value='company' then
   if not exists(select 1 from public.company_db where id=db_id) then raise exception 'Company unavailable'; end if;
   if workspace_id is not null and not exists(select 1 from public.company_workspace where company_workspace_id=workspace_id and company_db_id=db_id) then raise exception 'Workspace does not belong to company'; end if;
   key_value:='company:'||db_id::text;
 elsif scope_value='workspace' then
   select company_db_id into db_id from public.company_workspace where company_workspace_id=workspace_id;
   if not found then raise exception 'Company workspace unavailable'; end if;
   key_value:='workspace:'||workspace_id::text;
 elsif scope_value='name' then
   if name_value is null then raise exception 'Company name is required'; end if;
   if db_id is not null or workspace_id is not null then raise exception 'Name-only follows cannot carry a directory identity'; end if;
   key_value:='name:'||md5(name_value);
 else raise exception 'Invalid company scope'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':follow:'||key_value,0));
 select * into item from public.talent_company_follow where talent_id=p_user_id and scope_key=key_value for update;
 if action not in ('follow','update','unfollow') then raise exception 'Invalid follow action'; end if;
 if action='update' and item.id is null then raise exception 'Follow unavailable'; end if;
 if p_input ? 'expected_revision' and item.revision is distinct from (p_input->>'expected_revision')::bigint then raise exception 'Follow revision conflict'; end if;
 if item.id is null and action='unfollow' then body:='{"following":false}'::jsonb;
 else
   insert into public.talent_company_follow(talent_id,company_db_id,company_workspace_id,company_name,scope,conversation_id,source,instruction,tracking_summary,discovery_channel_summary)
   values(p_user_id,db_id,workspace_id,name_value,scope_value,p_conversation_id,coalesce(p_input->>'source','career_agent'),coalesce(p_input->>'instruction',''),null,null)
   on conflict(talent_id,scope_key) do update set
     unfollowed_at=case when action='unfollow' then coalesce(talent_company_follow.unfollowed_at,now()) when action='follow' then null else talent_company_follow.unfollowed_at end,
     followed_at=case when action='follow' and talent_company_follow.unfollowed_at is not null then now() else talent_company_follow.followed_at end,
     instruction=case when p_input ? 'instruction' then p_input->>'instruction' else talent_company_follow.instruction end,
     conversation_id=coalesce(p_conversation_id,talent_company_follow.conversation_id),
     scan_state=case when (p_input ? 'instruction' and p_input->>'instruction' is distinct from talent_company_follow.instruction) or (action='follow' and talent_company_follow.unfollowed_at is not null) then '{}'::jsonb else talent_company_follow.scan_state end,
     revision=talent_company_follow.revision+case when (p_input ? 'instruction' and p_input->>'instruction' is distinct from talent_company_follow.instruction)
       or (action='unfollow' and talent_company_follow.unfollowed_at is null) or (action='follow' and talent_company_follow.unfollowed_at is not null) then 1 else 0 end,
     tracking_summary=null,discovery_channel_summary=null,updated_at=now()
   returning * into item;
   body:=to_jsonb(item);
 end if;
 insert into public.talent_external_operations(user_id,conversation_id,kind,idempotency_key,status,request,result)
 values(p_user_id,p_conversation_id,'career_follow_mutation',p_request_id,'completed',p_input,body);
 return body;
end $$;
revoke all on function public.write_career_company_follow(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.write_career_company_follow(uuid,uuid,text,jsonb) to service_role;
