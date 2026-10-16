-- Both email runtimes persist CC-introduction replies here. Keep capture and
-- the existing company_update outbox atomic; no separate notification table.
create or replace function public.enqueue_intro_first_reply_company_update_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.org_intro_email_threads; v_candidate_email text; v_name text;
begin
  if new.direction <> 'inbound' or new.mail_type <> 'org_intro_reply'
     or new.status <> 'received' or new.metadata->>'source' is distinct from 'org_intro_capture' then
    return new;
  end if;
  -- The legacy and Vercel consumers use different metadata keys.
  select * into t from public.org_intro_email_threads
    where id::text=coalesce(new.metadata->>'orgIntroThreadId',new.metadata->>'threadId')
      and talent_id=new.talent_id and status='active' for update;
  if t.id is null then return new; end if;
  -- Use the recipient of the actual introduction, not a mutable profile email
  -- or an assumption about the order of the participants array.
  select lower(btrim(to_email)) into v_candidate_email from public.career_email_messages
    where id=t.outbound_message_id and direction='outbound' and talent_id=t.talent_id;
  if v_candidate_email is null or lower(btrim(new.from_email)) is distinct from v_candidate_email
     or not exists(select 1 from unnest(t.participant_emails) e where lower(btrim(e))=v_candidate_email) then
    return new;
  end if;
  -- Existing replies count too: activating this migration does not notify old
  -- threads on their next reply. The row lock serializes concurrent captures.
  if exists(select 1 from public.career_email_messages m
    where m.id<>new.id and m.talent_id=t.talent_id and m.direction='inbound'
      and m.mail_type='org_intro_reply' and m.status='received'
      and m.metadata->>'source'='org_intro_capture'
      and coalesce(m.metadata->>'orgIntroThreadId',m.metadata->>'threadId')=t.id::text
      and lower(btrim(m.from_email))=v_candidate_email) then return new; end if;
  select name into v_name from public.talent_users where user_id=t.talent_id;
  perform public.enqueue_company_update_v1(t.company_workspace_id,t.role_id,
    'intro-first-candidate-reply:'||t.id::text,
    'Let the company know briefly in this role conversation that the candidate has replied to the CC introduction email for the first time. Use the existing conversation context to decide the wording and any useful next step.',
    jsonb_build_object('companyMessageAlreadyDelivered',false,
      'talentId',t.talent_id,'candidateName',v_name,'roleId',t.role_id,
      'recommendationId',t.recommendation_id,'introEmailThreadId',t.id,
      'emailMessageId',new.id,'candidateFirstReplyReceivedAt',new.occurred_at));
  return new;
end; $$;
revoke all on function public.enqueue_intro_first_reply_company_update_v1() from public,anon,authenticated;
create trigger enqueue_intro_first_reply_company_update
after insert on public.career_email_messages for each row
execute function public.enqueue_intro_first_reply_company_update_v1();
