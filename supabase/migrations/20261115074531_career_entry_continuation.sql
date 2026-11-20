-- Entry is an account action, not proof of complete career information.
-- Persist its receipt and exact source before admitting the original agent.
-- Keep the legacy interview submission RPC for already-open legacy sessions.
create function public.finalize_career_entry(
  p_user_id uuid, p_conversation_id uuid, p_receipt text,
  p_official_job_slug text default null, p_is_mobile boolean default false
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.talent_conversations; m public.talent_messages;
  j public.official_jobs; r jsonb; inserted boolean := false;
begin
  select * into c from public.talent_conversations
    where id=p_conversation_id and user_id=p_user_id for update;
  if not found then raise exception 'Conversation unavailable'; end if;
  select * into m from public.talent_messages
    where conversation_id=c.id and user_id=p_user_id and message_type='profile_submit'
    order by id limit 1;
  if not found then
    insert into public.talent_messages(conversation_id,user_id,role,content,message_type,is_mobile)
      values(c.id,p_user_id,'user',p_receipt,'profile_submit',p_is_mobile) returning * into m;
    inserted := true;
  end if;
  -- The source belongs to the first entry, not a later navigation or retry.
  if inserted and p_official_job_slug is not null then
    select * into j from public.official_jobs where slug=p_official_job_slug and is_published is true;
    if found then
      insert into public.talent_activity_events(talent_id,conversation_id,event_type,
        changed_domains,impact_level,source,summary)
      values(p_user_id,c.id,'official_jobs_signup_intent',array['official_job_intent','onboarding'],
        'high','official_jobs_onboarding:'||j.slug,
        'Entry from Talk to Harper: '||coalesce(j.company_name,'')||' / '||coalesce(j.role_title,'')||
        '. This navigation records interest, not introduction or profile-sharing consent.');
    end if;
  end if;
  update public.talent_conversations set stage='completed',updated_at=now(),
    profile_ingestion_status='completed',profile_ingestion_error=null,profile_ingestion_updated_at=now()
    where id=c.id returning * into c;
  -- This existing admission owns the recovery job, model cursor and dedupe key.
  r := public.enqueue_career_onboarding_continuation(p_user_id,c.id,
    jsonb_build_object('source','career_entry','instruction',
      'The candidate has finished account setup and entered Career. Continue from the actual entry opportunity, supplied materials and conversation. Career information may be incomplete.'));
  return jsonb_build_object('inserted',inserted,'conversation',to_jsonb(c),
    'userMessage',to_jsonb(m),'run',r);
end $$;
revoke all on function public.finalize_career_entry(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finalize_career_entry(uuid,uuid,text,text,boolean) to service_role;
