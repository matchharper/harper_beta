-- General agent resources. No application phases or model-judgment state.
-- Provider checkpoints may contain private reasoning context. Keep them outside
-- user-readable conversation rows and never broaden existing table privileges.
create table public.talent_agent_runtime (
 conversation_id uuid primary key references public.talent_conversations(id) on delete cascade,
 user_id uuid not null references public.talent_users(user_id) on delete cascade,
 state jsonb not null default '{}'::jsonb
);
alter table public.talent_agent_runtime enable row level security;
revoke all on public.talent_agent_runtime from public,anon,authenticated;
grant all on public.talent_agent_runtime to service_role;

-- Survives chat deletion: external resources and irreversible execution receipts
-- still have an owner and are needed to close sessions / prevent duplicate sends.
create table public.talent_external_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.talent_users(user_id) on delete cascade,
  conversation_id uuid references public.talent_conversations(id) on delete set null,
  kind text not null,
  parent_id uuid references public.talent_external_operations(id),
  idempotency_key text not null,
  status text not null default 'reserved',
  revision bigint not null default 1,
  request jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  provider_refs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id,kind,idempotency_key)
);
create index talent_external_operations_conversation on public.talent_external_operations(user_id,conversation_id,created_at desc);
create index talent_external_operations_parent on public.talent_external_operations(parent_id,created_at desc);
alter table public.talent_external_operations enable row level security;
revoke all on public.talent_external_operations from public,anon,authenticated;
grant all on public.talent_external_operations to service_role;

create function public.create_talent_external_operation(
 p_user_id uuid,p_conversation_id uuid,p_kind text,p_parent_id uuid,p_idempotency_key text,p_request jsonb
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_external_operations; parent public.talent_external_operations;
begin
 -- Same idempotency key must never dispatch a second external effect.
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_kind||':'||p_idempotency_key,0));
 select * into item from public.talent_external_operations where user_id=p_user_id and kind=p_kind and idempotency_key=p_idempotency_key;
 if found then return to_jsonb(item); end if;
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id;
 if not found then raise exception 'Conversation unavailable'; end if;
 if p_parent_id is not null then
   select * into parent from public.talent_external_operations where id=p_parent_id and user_id=p_user_id for update;
   if not found then raise exception 'Parent operation unavailable'; end if;
 end if;
 if p_kind='browser_run' then
   if p_parent_id is null or parent.kind <> 'browser_session' then raise exception 'Browser session required'; end if;
   -- The provider only accepts one run controlling a session at a time.
   if parent.status not in ('idle','human') then raise exception 'Browser session is not ready for another run'; end if;
 end if;
 insert into public.talent_external_operations(user_id,conversation_id,kind,parent_id,idempotency_key,request)
 values(p_user_id,p_conversation_id,p_kind,p_parent_id,p_idempotency_key,coalesce(p_request,'{}')) returning * into item;
 if p_kind='browser_run' then
   update public.talent_external_operations set status='running',revision=revision+1,updated_at=now(),
     provider_refs=provider_refs||jsonb_build_object('current_execution_id',item.id) where id=parent.id;
 end if;
 return to_jsonb(item);
end $$;

-- The conversation lock makes a form revision or click atomic. Only immutable
-- form snapshots, exact user responses and hide markers are added to messages.
create unique index talent_messages_career_form_revision on public.talent_messages(user_id,conversation_id,((payload->>'formId')::bigint),((payload->>'revision')::integer)) where message_type='career_form';
create unique index talent_messages_career_form_request on public.talent_messages(user_id,conversation_id,message_type,(payload->>'requestId')) where message_type in ('career_form','career_form_presentation','career_form_response') and payload->>'requestId' is not null;
create function public.write_career_form(
 p_user_id uuid,p_conversation_id uuid,p_action text,p_form_id bigint default null,p_revision integer default null,
 p_expected_revision integer default null,p_payload jsonb default null,p_content text default '',p_request_id text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.talent_messages; root public.talent_messages; snapshot public.talent_messages; next_revision integer; kind text; body jsonb;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id for update;
 if not found then raise exception 'Conversation unavailable'; end if;
 kind:=case when p_action in ('create','update') then 'career_form' when p_action='present' then 'career_form_presentation' when p_action='respond' then 'career_form_response' end;
 if p_request_id is not null and kind is not null then
   select * into item from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type=kind and payload->>'requestId'=p_request_id;
   if found then return to_jsonb(item); end if;
 end if;
 if p_action='create' then
   insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
   values(p_user_id,p_conversation_id,'assistant',kind,'',coalesce(p_payload,'{}')||jsonb_build_object('revision',1,'requestId',p_request_id)) returning * into item;
   update public.talent_messages set payload=payload||jsonb_build_object('formId',item.id) where id=item.id returning * into item;
   return to_jsonb(item);
 end if;
 select * into root from public.talent_messages where id=p_form_id and user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form' and payload->>'revision'='1' for update;
 if not found then raise exception 'Form unavailable'; end if;
 if p_action='hide' then
   update public.talent_messages set payload=payload||'{"hidden":true}'::jsonb where user_id=p_user_id and conversation_id=p_conversation_id and message_type in ('career_form','career_form_presentation','career_form_response') and payload->>'formId'=p_form_id::text;
   select * into item from public.talent_messages where id=p_form_id;
   return to_jsonb(item);
 end if;
 if coalesce((root.payload->>'hidden')::boolean,false) then raise exception 'Form unavailable'; end if;
 if p_action='update' then
   select max((payload->>'revision')::integer)+1 into next_revision from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form' and payload->>'formId'=p_form_id::text;
   if p_expected_revision is distinct from next_revision-1 then raise exception 'Form revision conflict'; end if;
   body:=coalesce(p_payload,'{}')||jsonb_build_object('formId',p_form_id,'revision',next_revision,'requestId',p_request_id);
 elsif p_action in ('present','respond') then
   select * into snapshot from public.talent_messages where user_id=p_user_id and conversation_id=p_conversation_id and message_type='career_form' and payload->>'formId'=p_form_id::text and payload->>'revision'=p_revision::text;
   if not found then raise exception 'Form revision unavailable'; end if;
   body:=case when p_action='present' then snapshot.payload else coalesce(p_payload,'{}')||jsonb_build_object('formSnapshot',snapshot.payload) end;
   body:=body||jsonb_build_object('formId',p_form_id,'revision',p_revision,'requestId',p_request_id);
 else raise exception 'Unknown form operation'; end if;
 insert into public.talent_messages(user_id,conversation_id,role,message_type,content,payload)
 values(p_user_id,p_conversation_id,case when p_action='respond' then 'user' else 'assistant' end,kind,coalesce(p_content,''),body) returning * into item;
 return to_jsonb(item);
end $$;

-- Merge against the current counters: another reply may have completed while
-- this reply's exact provider transcript was waiting in the continuation queue.
create function public.consume_career_agent_handbooks(p_current jsonb,p_record jsonb,p_after jsonb)
returns jsonb language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb:='[]'; book jsonb; supplied jsonb; remaining integer;
begin
 for book in select value from jsonb_array_elements(coalesce(p_current,'[]')) loop
   if coalesce(p_record->'loadedHandbooks','[]') ? (book->>'id') then continue; end if;
   remaining:=(book->>'remainingReplies')::integer;
   if coalesce(p_record->'injectedHandbooks','[]') ? (book->>'id') then
     select value into supplied from jsonb_array_elements(coalesce(p_record->'handbooks','[]'))
       where value->>'id'=book->>'id' and value->>'version'=book->>'version' limit 1;
     if found then remaining:=remaining-1; end if;
   end if;
   if remaining>0 then result:=result||jsonb_build_array(book||jsonb_build_object('remainingReplies',remaining)); end if;
 end loop;
 -- Only an actual load/reload may add a lease or renew it. An expired carried
 -- snapshot cannot resurrect a guide after intervening replies consumed it.
 for book in select value from jsonb_array_elements(coalesce(p_after,'[]')) loop
   if coalesce(p_record->'loadedHandbooks','[]') ? (book->>'id') then result:=result||jsonb_build_array(book); end if;
 end loop;
 return result;
end $$;

-- A delivered logical reply consumes a handbook lease once. Tool-loop calls,
-- queue retries and fallback providers do not. The claim protects concurrent
-- replies; checkpoints retain actual provider transcripts, not model plans.
create function public.claim_career_agent_turn(p_user_id uuid,p_conversation_id uuid,p_reply_id text,p_claim_id text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare runtime_state jsonb; delivered jsonb; sequence bigint;
begin
 perform 1 from public.talent_conversations where id=p_conversation_id and user_id=p_user_id;
 if not found then raise exception 'Conversation unavailable'; end if;
 insert into public.talent_agent_runtime(conversation_id,user_id) values(p_conversation_id,p_user_id) on conflict(conversation_id) do nothing;
 select r.state into runtime_state from public.talent_agent_runtime r where conversation_id=p_conversation_id and user_id=p_user_id for update;
 runtime_state:=coalesce(runtime_state,'{}');
 if coalesce(runtime_state->'completedReplyIds','{}') ? p_reply_id then return jsonb_build_object('accepted',false,'completed',true,'state',runtime_state); end if;
 -- Assistant persistence may have succeeded just before the request died.
 -- Recover its already-recorded completion instead of repeating external work.
 select payload->'agentTurn' into delivered from public.talent_messages
 where user_id=p_user_id and conversation_id=p_conversation_id and role='assistant'
 and payload#>>'{agentTurn,replyId}'=p_reply_id order by id desc limit 1;
 if found then
   sequence:=coalesce((runtime_state->>'completedSequence')::bigint,0)+1;
   runtime_state:=(runtime_state-'checkpoint')||jsonb_build_object('checkpoints',coalesce(runtime_state->'checkpoints','{}')-p_reply_id)||jsonb_build_object('activeReply',case when runtime_state#>>'{activeReply,replyId}'=p_reply_id then null else runtime_state->'activeReply' end,'completedSequence',sequence,
     'handbooks',public.consume_career_agent_handbooks(runtime_state->'handbooks',delivered->'record',delivered->'handbooks'),'previous',delivered->'record',
     'completedReplyIds',coalesce(runtime_state->'completedReplyIds','{}')||jsonb_build_object(p_reply_id,sequence));
   update public.talent_agent_runtime r set state=runtime_state where r.conversation_id=p_conversation_id;
   return jsonb_build_object('accepted',false,'completed',true,'state',runtime_state);
 end if;
 if runtime_state->'activeReply' is not null and runtime_state->'activeReply'<>'null'::jsonb and (runtime_state#>>'{activeReply,expiresAt}')::timestamptz>now() and runtime_state#>>'{activeReply,claimId}' is distinct from p_claim_id then
   return jsonb_build_object('accepted',false,'completed',false,'state',runtime_state);
 end if;
 -- Multiple queued replies retain their own exact transcript. The alias in
 -- the returned state selects only this reply and is never authoritative.
 runtime_state:=runtime_state||jsonb_build_object('version',1,'completedSequence',coalesce((runtime_state->>'completedSequence')::bigint,0),'activeReply',jsonb_build_object('replyId',p_reply_id,'claimId',p_claim_id,'expiresAt',now()+interval '8 minutes'));
 update public.talent_agent_runtime r set state=runtime_state where r.conversation_id=p_conversation_id;
 return jsonb_build_object('accepted',true,'state',runtime_state||jsonb_build_object('checkpoint',runtime_state#>array['checkpoints',p_reply_id]));
end $$;
create function public.checkpoint_career_agent_turn(p_user_id uuid,p_conversation_id uuid,p_reply_id text,p_claim_id text,p_checkpoint jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.talent_agent_runtime set state=jsonb_set(state||jsonb_build_object('checkpoints',coalesce(state->'checkpoints','{}')||jsonb_build_object(p_reply_id,p_checkpoint)),'{activeReply,expiresAt}',to_jsonb(now()+interval '8 minutes'))
 where conversation_id=p_conversation_id and user_id=p_user_id and state#>>'{activeReply,replyId}'=p_reply_id and state#>>'{activeReply,claimId}'=p_claim_id;
 return found;
end $$;
create function public.finish_career_agent_turn(p_user_id uuid,p_conversation_id uuid,p_reply_id text,p_claim_id text,p_record jsonb,p_handbooks jsonb)
returns boolean language plpgsql security invoker set search_path='' as $$
declare runtime_state jsonb; sequence bigint;
begin
 select r.state into runtime_state from public.talent_agent_runtime r where conversation_id=p_conversation_id and user_id=p_user_id for update;
 if not found then return false; end if;
 if coalesce(runtime_state->'completedReplyIds','{}') ? p_reply_id then return true; end if;
 if runtime_state#>>'{activeReply,replyId}' is distinct from p_reply_id or runtime_state#>>'{activeReply,claimId}' is distinct from p_claim_id then return false; end if;
 sequence:=coalesce((runtime_state->>'completedSequence')::bigint,0)+1;
 runtime_state:=(runtime_state-'checkpoint')||jsonb_build_object('checkpoints',coalesce(runtime_state->'checkpoints','{}')-p_reply_id)||jsonb_build_object('activeReply',null,'completedSequence',sequence,'handbooks',public.consume_career_agent_handbooks(runtime_state->'handbooks',p_record,p_handbooks),'previous',p_record,'completedReplyIds',coalesce(runtime_state->'completedReplyIds','{}')||jsonb_build_object(p_reply_id,sequence));
 update public.talent_agent_runtime r set state=runtime_state where r.conversation_id=p_conversation_id;
 return true;
end $$;
create function public.release_career_agent_turn(p_user_id uuid,p_conversation_id uuid,p_reply_id text,p_claim_id text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 update public.talent_agent_runtime set state=state||'{"activeReply":null}'::jsonb where conversation_id=p_conversation_id and user_id=p_user_id and state#>>'{activeReply,replyId}'=p_reply_id and state#>>'{activeReply,claimId}'=p_claim_id;
 return found;
end $$;

-- Repair the crash window between saving a transcript and publishing its
-- continuation. This short dispatch lease is only an execution scheduling fact;
-- the logical reply claim still guards the model and external effects. Claiming
-- each batch moves it out of the next page, including across cron invocations.
-- Adapter-owned replies are recovered by their original delivery queues.
create function public.claim_career_reply_recovery(p_limit integer default 20)
returns table ("userId" uuid,"conversationId" uuid,"replyId" text,"checkpointKey" text,"sourceMessageId" bigint,"proactiveContext" text)
language plpgsql security invoker set search_path='' as $$
declare runtime_row record; item record; next_state jsonb; claimed integer:=0;
begin
 for runtime_row in
   select r.conversation_id,r.user_id,r.state from public.talent_agent_runtime r
   where coalesce((r.state#>>'{activeReply,expiresAt}')::timestamptz,'-infinity'::timestamptz)<=now()
   and exists (select 1 from jsonb_each(coalesce(r.state->'checkpoints','{}')) c
     where c.value#>>'{continuation,channel}'='career'
     and coalesce((c.value->>'recoveryAfter')::timestamptz,'-infinity'::timestamptz)<=now()
     and not (coalesce(r.state->'completedReplyIds','{}') ? c.key))
   order by r.conversation_id limit p_limit for update skip locked
 loop
   next_state:=runtime_row.state;
   for item in select c.key,c.value from jsonb_each(coalesce(next_state->'checkpoints','{}')) c
     where c.value#>>'{continuation,channel}'='career'
       and coalesce((c.value->>'recoveryAfter')::timestamptz,'-infinity'::timestamptz)<=now()
       and not (coalesce(next_state->'completedReplyIds','{}') ? c.key)
     order by c.key limit p_limit-claimed
   loop
     next_state:=jsonb_set(next_state,array['checkpoints',item.key,'recoveryAfter'],to_jsonb(now()+interval '2 minutes'));
     "userId":=runtime_row.user_id; "conversationId":=runtime_row.conversation_id;
     "replyId":=item.key; "checkpointKey":=item.value->>'checkpointId';
     "sourceMessageId":=(item.value#>>'{continuation,sourceMessageId}')::bigint;
     "proactiveContext":=item.value#>>'{continuation,runtimeInstruction}';
     claimed:=claimed+1;
     return next;
   end loop;
   update public.talent_agent_runtime r set state=next_state where r.conversation_id=runtime_row.conversation_id;
   exit when claimed>=p_limit;
 end loop;
end $$;

revoke all on function public.create_talent_external_operation(uuid,uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.write_career_form(uuid,uuid,text,bigint,integer,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.consume_career_agent_handbooks(jsonb,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.claim_career_agent_turn(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.checkpoint_career_agent_turn(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.finish_career_agent_turn(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.release_career_agent_turn(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.claim_career_reply_recovery(integer) from public,anon,authenticated;
grant execute on function public.create_talent_external_operation(uuid,uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.write_career_form(uuid,uuid,text,bigint,integer,integer,jsonb,text,text) to service_role;
grant execute on function public.consume_career_agent_handbooks(jsonb,jsonb,jsonb) to service_role;
grant execute on function public.claim_career_agent_turn(uuid,uuid,text,text) to service_role;
grant execute on function public.checkpoint_career_agent_turn(uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.finish_career_agent_turn(uuid,uuid,text,text,jsonb,jsonb) to service_role;
grant execute on function public.release_career_agent_turn(uuid,uuid,text,text) to service_role;
grant execute on function public.claim_career_reply_recovery(integer) to service_role;

-- The email runtime persists its assistant and delivery metadata in one RPC.
-- Copy only its completion receipt within that same transaction so a crash
-- cannot leave a delivered email reply looking unfinished to the shared agent.
create function public.copy_email_career_agent_completion() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.assistant_message_id is not null and new.metadata->'agentTurn' is not null then
   update public.talent_messages set payload=coalesce(payload,'{}')||jsonb_build_object('agentTurn',new.metadata->'agentTurn')
   where id=new.assistant_message_id and user_id=new.talent_id and conversation_id=new.conversation_id and role='assistant';
 end if;
 return new;
end $$;
revoke all on function public.copy_email_career_agent_completion() from public,anon,authenticated;
grant execute on function public.copy_email_career_agent_completion() to service_role;
create trigger email_career_agent_completion after update of metadata,assistant_message_id on public.email_reply_jobs
for each row execute function public.copy_email_career_agent_completion();

-- Archived application rows no longer represent an exclusive conversation mode.
-- Otherwise an old active row would still block ordinary coaching writes.
-- Existing application records and in-flight execution receipts are preserved.
drop trigger if exists guard_application_coaching_mode on public.talent_conversations;

-- Only the new form/browser UI keys; preserve unrelated translations.
insert into public.translation_entries(namespace,key,locale,value,status,updated_by) values
('career','career.forms.legacyQuestions','ko','저장된 질문 {count}개','reviewed','translation:sync:codex-direct'),
('career','career.browser.title','ko','지원 브라우저','reviewed','translation:sync:codex-direct'),
('career','career.browser.closed','ko','종료된 브라우저','reviewed','translation:sync:codex-direct'),
('career','career.browser.human','ko','직접 조작 중','reviewed','translation:sync:codex-direct'),
('career','career.browser.handoff','ko','직접 조작','reviewed','translation:sync:codex-direct'),
('career','career.browser.close','ko','닫기','reviewed','translation:sync:codex-direct'),
('career','career.browser.openWindow','ko','새 창에서 열기','reviewed','translation:sync:codex-direct'),
('career','career.browser.loginDone','ko','로그인을 마치면 대화에서 알려주세요.','reviewed','translation:sync:codex-direct'),
('career','career.browser.noPreview','ko','브라우저 화면을 불러올 수 없어요. 세션 상태를 확인해 주세요.','reviewed','translation:sync:codex-direct'),
('career','career.browser.loading','ko','브라우저를 불러오는 중이에요.','reviewed','translation:sync:codex-direct'),
('career','career.browser.error','ko','브라우저 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.legacyContinue','ko','{role}에 이전에 준비한 내용을 바탕으로 지원을 도와줘.','reviewed','translation:sync:codex-direct'),
('career','career.forms.continueError','ko','응답은 저장됐지만 대화를 이어가지 못했어요. 다시 눌러 주세요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.saveError','ko','응답을 저장하지 못했어요. 다시 시도해 주세요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.gmailWritePermission','ko','이메일 작성·발송 권한을 확인하지 못했어요. Gmail을 다시 연결해 주세요.','reviewed','translation:sync:codex-direct'),
('career','career.forms.legacyQuestions','en','{count} saved questions','draft','translation:sync:codex-direct'),
('career','career.browser.title','en','Application browser','draft','translation:sync:codex-direct'),
('career','career.browser.closed','en','Closed browser','draft','translation:sync:codex-direct'),
('career','career.browser.human','en','You''re in control','draft','translation:sync:codex-direct'),
('career','career.browser.handoff','en','Take control','draft','translation:sync:codex-direct'),
('career','career.browser.close','en','Close','draft','translation:sync:codex-direct'),
('career','career.browser.openWindow','en','Open in a new window','draft','translation:sync:codex-direct'),
('career','career.browser.loginDone','en','Let Harper know in the chat when you''ve signed in.','draft','translation:sync:codex-direct'),
('career','career.browser.noPreview','en','The browser preview is unavailable. Please check the session status.','draft','translation:sync:codex-direct'),
('career','career.browser.loading','en','Loading the browser…','draft','translation:sync:codex-direct'),
('career','career.browser.error','en','The browser status could not be checked. Please try again shortly.','draft','translation:sync:codex-direct'),
('career','career.forms.legacyContinue','en','Help me apply to {role} using the materials we prepared earlier.','draft','translation:sync:codex-direct'),
('career','career.forms.continueError','en','Your response was saved, but the conversation could not continue. Please click again.','draft','translation:sync:codex-direct'),
('career','career.forms.saveError','en','Your response could not be saved. Please try again.','draft','translation:sync:codex-direct'),
('career','career.forms.gmailWritePermission','en','We could not confirm permission to compose and send email. Please reconnect Gmail.','draft','translation:sync:codex-direct')
on conflict (namespace,key,locale) do update set value=excluded.value,status=excluded.status,updated_by=excluded.updated_by,updated_at=now();
